import { redis, hasRedis } from "./_redis.js";

// Daily time on "junk" sites/apps, reported by the Android tracker.
// Stored as a Redis hash: day -> {"ynet":sec,"walla":sec,"linkedin":sec}.

const SITES = ["ynet", "walla", "linkedin"];
const KEEP_DAYS = 120;

const usageKey = deviceId =>
  `learningos:usage:${deviceId}`;

const isDay = d =>
  /^\d{4}-\d{2}-\d{2}$/.test(d);

function cleanDay(v) {
  const out = {};

  for (const s of SITES) {
    const n = Math.round(Number(v?.[s]) || 0);
    out[s] = Math.max(0, Math.min(86400, n));
  }

  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const body = req.body || {};
  const deviceId = String(body.deviceId || "").trim().slice(0, 128);

  if (!deviceId) {
    return res.status(400).json({ error: "deviceId required" });
  }

  if (!hasRedis()) {
    return res.status(503).json({ error: "redis_not_configured" });
  }

  try {
    const key = usageKey(deviceId);

    if (body.action === "put") {
      // The tracker sends full totals for recent days, so each day is overwritten.
      const days = Object.entries(body.days || {})
        .filter(([d]) => isDay(d))
        .slice(0, 31);

      for (const [d, v] of days) {
        await redis("HSET", key, d, JSON.stringify(cleanDay(v)));
      }

      await redis("HSET", key, "_lastSync", new Date().toISOString());

      const all = (await redis("HKEYS", key)) || [];
      const old = all.filter(isDay).sort().slice(0, -KEEP_DAYS);

      if (old.length) {
        await redis("HDEL", key, ...old);
      }

      return res.status(200).json({ ok: true, days: days.length });
    }

    if (body.action === "get") {
      const flat = (await redis("HGETALL", key)) || [];
      const days = {};
      let lastSync = null;

      for (let i = 0; i + 1 < flat.length; i += 2) {
        if (flat[i] === "_lastSync") {
          lastSync = flat[i + 1];
          continue;
        }

        try {
          days[flat[i]] = cleanDay(JSON.parse(flat[i + 1]));
        } catch {}
      }

      return res.status(200).json({ days, lastSync });
    }

    return res.status(400).json({ error: "unknown action" });
  } catch (e) {
    console.error(e);

    return res.status(500).json({
      error: "usage_failed",
      detail: String(e?.message || e)
    });
  }
}
