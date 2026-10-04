import OpenAI from "openai";
import { redis, hasRedis } from "./_redis.js";

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

// Forecasts live on the device; Redis keeps a backup copy so they survive
// a cleared browser.
const MAX_RESOLVE = 3;
const MAX_STORED = 1000;

// Give up on a question the AI still can't settle this long after its deadline.
const VOID_AFTER_DAYS = 21;

const forecastsKey = deviceId =>
  `learningos:forecasts:${deviceId}`;

const clip = (s, n) =>
  String(s ?? "").slice(0, n);

const today = () =>
  new Date().toISOString().slice(0, 10);

function parseJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  return JSON.parse(
    start >= 0 && end > start
      ? cleaned.slice(start, end + 1)
      : cleaned
  );
}

function resolutionPrompt(f) {
  const daysLate =
    Math.floor(
      (Date.now() - Date.parse(f.resolveBy)) / 864e5
    );

  return `
You are the impartial judge for a personal forecasting journal.
Today is ${today()}.

A forecast question was written on ${clip(f.createdAt, 10)} and was due to resolve on ${f.resolveBy}.

QUESTION:
${clip(f.question, 600)}

RESOLUTION CRITERIA:
${clip(f.criteria, 1200)}

OPTIONS (mutually exclusive; answer with the 0-based index):
${(f.options || []).map((o, i) => `${i}. ${clip(o, 300)}`).join("\n")}

The forecaster picked option ${f.pick} ("${clip(f.options?.[f.pick], 300)}") with ${Math.round(f.confidence * 100)}% confidence.
Source article: ${clip(f.title, 300)} ${clip(f.url, 500)}

Search the web for what actually happened up to ${f.resolveBy}. For price questions, find the actual closing levels on the relevant dates.

Rules:
- Resolve strictly by the criteria, not by vibes.
- If the evidence is not yet clear enough, return status "unclear". ${daysLate >= VOID_AFTER_DAYS ? 'This question is long overdue: if it still cannot be settled, return status "void".' : ""}
- "evidence": 2-3 sentences with the concrete facts (numbers, dates, events) that settle it.
- "lesson": 2-3 sentences of feedback to the forecaster. If they were wrong, what signal did they likely underweight? If right, was it skill or a near miss? Be specific and useful, not generic.

Return ONLY JSON:
{"status":"resolved"|"unclear"|"void","outcome":<index or null>,"evidence":"...","lesson":"...","sources":["url", ...]}
`;
}

async function askJudge(f) {
  const input = resolutionPrompt(f);

  // Prefer live web search; fall back to the model alone if the tool is
  // unavailable for the configured model.
  try {
    const r = await ai.responses.create({
      model: MODEL,
      input,
      tools: [{ type: "web_search" }]
    });

    return parseJson(r.output_text);
  } catch (e) {
    console.warn("web_search resolution failed, retrying without tools", e?.message);

    const r = await ai.responses.create({
      model: MODEL,
      input:
        input +
        "\nYou have no web access in this call: only resolve if you are certain from your own knowledge; otherwise return \"unclear\"."
    });

    return parseJson(r.output_text);
  }
}

async function resolveOne(f) {
  try {
    const d = await askJudge(f);
    const n = (f.options || []).length;
    const outcome = Number(d.outcome);

    if (d.status === "resolved" && Number.isInteger(outcome) && outcome >= 0 && outcome < n) {
      return {
        id: f.id,
        status: "resolved",
        outcome,
        evidence: clip(d.evidence, 1200),
        lesson: clip(d.lesson, 1200),
        sources: (Array.isArray(d.sources) ? d.sources : []).map(x => clip(x, 500)).slice(0, 4),
        resolvedAt: new Date().toISOString()
      };
    }

    if (d.status === "void") {
      return {
        id: f.id,
        status: "void",
        evidence: clip(d.evidence, 1200),
        resolvedAt: new Date().toISOString()
      };
    }

    return { id: f.id, status: "open", checkedAt: new Date().toISOString() };
  } catch (e) {
    console.error("resolve failed", f.id, e);
    return { id: f.id, status: "open", error: String(e?.message || e) };
  }
}

function sanitizeForResolve(f) {
  return {
    id: clip(f?.id, 240),
    question: clip(f?.question, 600),
    criteria: clip(f?.criteria, 1200),
    options: (Array.isArray(f?.options) ? f.options : []).slice(0, 4).map(o => clip(o, 300)),
    pick: Number(f?.pick) || 0,
    confidence: Math.max(0, Math.min(1, Number(f?.confidence) || 0)),
    createdAt: clip(f?.createdAt, 40),
    resolveBy: clip(f?.resolveBy, 10),
    title: clip(f?.title, 300),
    url: clip(f?.url, 500)
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const body = req.body || {};
  const action = body.action;

  try {
    if (action === "resolve") {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(503).json({ error: "OPENAI_API_KEY missing" });
      }

      const due = (Array.isArray(body.items) ? body.items : [])
        .map(sanitizeForResolve)
        .filter(f =>
          f.id &&
          f.question &&
          f.options.length >= 2 &&
          /^\d{4}-\d{2}-\d{2}$/.test(f.resolveBy) &&
          f.resolveBy <= today()
        )
        .slice(0, MAX_RESOLVE);

      const results = await Promise.all(due.map(resolveOne));

      return res.status(200).json({ results });
    }

    const deviceId = clip(body.deviceId, 128).trim();

    if (!deviceId) {
      return res.status(400).json({ error: "deviceId required" });
    }

    if (!hasRedis()) {
      return res.status(503).json({ error: "redis_not_configured" });
    }

    if (action === "sync") {
      const items = (Array.isArray(body.items) ? body.items : []).slice(-MAX_STORED);

      await redis("SET", forecastsKey(deviceId), JSON.stringify(items));

      return res.status(200).json({ ok: true, count: items.length });
    }

    if (action === "restore") {
      const raw = await redis("GET", forecastsKey(deviceId));
      let items = [];

      try {
        items = raw ? JSON.parse(raw) : [];
      } catch {
        items = [];
      }

      return res.status(200).json({ items: Array.isArray(items) ? items : [] });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    console.error(e);

    return res.status(500).json({
      error: "forecast_failed",
      detail: String(e?.message || e)
    });
  }
}
