import OpenAI from "openai";

const ai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const Q = [
  ['site:reuters.com (Israel OR Iran OR Gaza OR Lebanon OR "United States" OR Trump OR Middle East)', 'en-US', 'US', 'US:en'],
  ['site:ynet.co.il (פוליטיקה OR ממשלה OR איראן OR ישראל OR ביטחון OR כלכלה)', 'he', 'IL', 'IL:he'],
  ['site:ynetnews.com (Israel OR Iran OR politics OR security OR economy)', 'en-US', 'US', 'US:en'],
  ['site:globes.co.il (שוק ההון OR אנבידיה OR בינה מלאכותית OR השקעות OR פוליטיקה OR איראן)', 'he', 'IL', 'IL:he'],
  ['site:en.globes.co.il (Nvidia OR AI OR investments OR Israel OR autonomous OR robotics)', 'en-US', 'US', 'US:en'],
  ['site:reuters.com (Nvidia OR "S&P 500" OR silver OR uranium OR SpaceX OR earnings OR markets)', 'en-US', 'US', 'US:en'],
  ['site:reuters.com (humanoid OR robotics OR "autonomous driving" OR ADAS OR "artificial intelligence")', 'en-US', 'US', 'US:en'],
  ['site:techcrunch.com (AI OR robotics OR agents OR Nvidia OR SpaceX)', 'en-US', 'US', 'US:en'],
  ['site:spacenews.com (SpaceX OR Starship OR launch OR satellite)', 'en-US', 'US', 'US:en'],
  ['site:arstechnica.com (AI OR science OR space OR chips)', 'en-US', 'US', 'US:en'],
  ['(uranium OR nuclear fuel OR enrichment OR Cameco OR Kazatomprom) markets', 'en-US', 'US', 'US:en'],
  ['(silver price OR silver demand OR solar silver) markets', 'en-US', 'US', 'US:en'],
  ['Nvidia earnings upcoming expectations AI capex', 'en-US', 'US', 'US:en'],
  ['S&P 500 market outlook earnings Federal Reserve', 'en-US', 'US', 'US:en'],
  ['Israel domestic politics coalition Knesset latest', 'en-US', 'US', 'US:en'],
  ['Iran Israel US geopolitics latest analysis', 'en-US', 'US', 'US:en'],
  ['important science breakthrough research latest', 'en-US', 'US', 'US:en'],
  ['surprising technology business science story latest', 'en-US', 'US', 'US:en'],
  ['energy markets oil natural gas nuclear power latest', 'en-US', 'US', 'US:en'],
  ['global business strategy major company earnings latest', 'en-US', 'US', 'US:en'],
  ['Europe politics economy defense latest', 'en-US', 'US', 'US:en'],
  ['China economy technology policy latest', 'en-US', 'US', 'US:en']
];

const strip = (s = "") => String(s)
  .replace(/<!\[CDATA\[|\]\]>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&nbsp;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const tag = (body, name) => {
  const m = body.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i")
  );
  return m ? strip(m[1]) : "";
};

const raw = (body, name) => {
  const m = body.match(
    new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i")
  );
  return m ? m[1] : "";
};

function source(title, url, supplied = "") {
  const x = `${title} ${url} ${supplied}`.toLowerCase();

  if (x.includes("reuters")) return "Reuters";
  if (x.includes("globes")) return "Globes";
  if (x.includes("ynet")) return "Ynet";
  if (x.includes("techcrunch")) return "TechCrunch";
  if (x.includes("spacenews")) return "SpaceNews";
  if (x.includes("ars technica")) return "Ars Technica";

  return supplied || "Other";
}

async function rss([q, hl, gl, ceid]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);

  try {
    const u =
      `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:7d")}` +
      `&hl=${encodeURIComponent(hl)}` +
      `&gl=${encodeURIComponent(gl)}` +
      `&ceid=${encodeURIComponent(ceid)}`;

    const r = await fetch(u, {
      headers: {
        "User-Agent": "LearningOS/5.0"
      },
      signal: controller.signal
    });

    if (!r.ok) return [];

    const xml = await r.text();

    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
      .slice(0, 12)
      .map(m => {
        const body = m[1];

        const title = tag(body, "title");
        const url = tag(body, "link");
        const published = tag(body, "pubDate");
        const desc = raw(body, "description");
        const suppliedSource = tag(body, "source");

        const imageMatch = desc.match(
          /<img[^>]+src=["']([^"']+)["']/i
        );

        const src = source(title, url, suppliedSource);

        return {
          id: `${title}-${src}`.slice(0, 220),
          title,
          url,
          published,
          description: strip(desc).slice(0, 700),
          source: src,
          image: imageMatch ? imageMatch[1] : ""
        };
      });

  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const norm = s =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, " ")
    .trim();

function similarity(a, b) {
  const aa = new Set(norm(a).split(" ").filter(Boolean));
  const bb = new Set(norm(b).split(" ").filter(Boolean));

  if (!aa.size || !bb.size) return 0;

  const overlap = [...aa].filter(x => bb.has(x)).length;

  return overlap / Math.max(aa.size, bb.size);
}

function dedupe(xs) {
  const seen = [];

  return xs.filter(x => {
    const k = norm(x.title);

    if (!k) return false;

    if (seen.some(y => similarity(k, y) > 0.68)) {
      return false;
    }

    seen.push(k);
    return true;
  });
}

function score(x, p) {
  const s = `${x.title} ${x.description}`.toLowerCase();

  let v = Number(p?.sources?.[x.source] || 0);

  for (const [k, w] of Object.entries(p?.topics || {})) {
    if (s.includes(k.toLowerCase().replace(" & ", " "))) {
      v += Number(w || 0) * 0.18;
    }
  }

  for (const [k, w] of Object.entries(p?.tags || {})) {
    if (s.includes(k.toLowerCase())) {
      v += Number(w || 0) * 0.15;
    }
  }

  for (const [k, w] of Object.entries(p?.entities || {})) {
    if (s.includes(k.toLowerCase())) {
      v += Number(w || 0) * 0.22;
    }
  }

  for (const w of p?.watch || []) {
    if (s.includes(String(w).toLowerCase())) {
      v += 3.5;
    }
  }

  return v;
}

function parseJson(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function byNewest(a, b) {
  return (Date.parse(b.published) || 0) -
         (Date.parse(a.published) || 0);
}

export default async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "POST only"
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      error: "OPENAI_API_KEY missing"
    });
  }

  try {

    const p = req.body?.profile || {};

    const requestedBatch =
      Number(req.body?.batchSize);

    const batchSize =
      Number.isFinite(requestedBatch)
        ? Math.max(
            6,
            Math.min(
              10,
              Math.round(requestedBatch)
            )
          )
        : 10;

    const settled =
      await Promise.allSettled(
        Q.map(rss)
      );

    const all =
      dedupe(
        settled.flatMap(
          r =>
            r.status === "fulfilled"
              ? r.value
              : []
        )
      )
      .filter(
        x => x.title && x.url
      );

    const seenIds =
      new Set(
        (p.seenIds || [])
          .map(String)
      );

    const seenTitles =
      (p.seenTitles || [])
        .map(String)
        .filter(Boolean)
        .slice(-160);

    const unseen =
      all.filter(x => {

        if (
          seenIds.has(
            String(x.id)
          )
        ) {
          return false;
        }

        return !seenTitles.some(
          t =>
            similarity(
              x.title,
              t
            ) > 0.72
        );
      });

    const ranked =
      [...unseen]
        .sort(
          (a, b) =>
            score(b, p) -
            score(a, p)
        );

    const top =
      ranked.slice(0, 60);

    const topIds =
      new Set(
        top.map(x => x.id)
      );

    const exploration =
      unseen
        .filter(
          x => !topIds.has(x.id)
        )
        .sort(byNewest)
        .slice(0, 50);

    const candidates =
      dedupe([
        ...top,
        ...exploration
      ])
      .slice(0, 110);

    if (!candidates.length) {

      return res.status(200).json({
        items: [],
        candidateCount: 0,
        model: MODEL,
        exhausted: true
      });
    }

    const candidatePayload =
      candidates.map(x => ({
        id: x.id,
        title: x.title,
        url: x.url,
        published: x.published,
        description: x.description,
        source: x.source,
        image: x.image
      }));

    const prompt = `
You edit LearningOS, a personal intelligence feed designed to replace low-value scrolling with a richer, more useful, more surprising stream of current information.

USER MODEL:
${JSON.stringify(p)}

CANDIDATES:
${JSON.stringify(candidatePayload)}

Choose up to ${batchSize} strong items.
Prefer ${batchSize} when enough worthwhile candidates exist.

DIVERSITY FOR A ${batchSize}-ITEM BATCH:

- About 2 Investments/Markets items, including portfolio/watch threads, earnings, catalysts, macro or valuation when genuinely relevant.

- About 2 Geopolitics items, especially Israel/Iran/US/Middle East when important, but do not let that region dominate every batch.

- About 1 internal Israeli politics/economy/society item when meaningful.

- About 1-2 AI/technology items.

- Maximum 1 robotics/autonomy item unless there is major breaking news.

- At least 1 science, intellectual, cultural or unexpected-world item.

- At least 1 deliberate new-territory item outside established preferences.

- Use remaining slots for the strongest business, economics, energy, space, policy, health, science or unexpected developments.

No single company, country or theme may dominate.

Strongly avoid stories similar to seenTitles.

If a familiar story has no meaningful new development, omit it.

This is not a school quiz and not only an executive-summary app.

Make it genuinely interesting.

Vary the mental experience across items:
prediction,
counterpoint,
ranking,
thesis,
reflection,
causal explanation,
or scenario.

For every selected item return:

id:
copy EXACTLY from the selected candidate.

topic:
one of
Investments,
Markets,
Geopolitics,
Israel,
Politics,
AI,
Robotics,
ADAS,
Science,
Surprise.

what:
2-3 factual sentences based only on candidate metadata.

why:
why this deserves the user's attention now.

lesson:
one non-obvious explanatory model, mechanism or reusable insight.

novelty:
what is genuinely new, changed or surprising.

format:
one of
prediction,
counterpoint,
ranking,
thesis,
reflection,
causal,
scenario.

prompt:
one sharp judgment question that is not trivia.

options:
2-4 plausible choices when useful,
otherwise [].

reveal:
a short useful response after a choice,
never "correct/incorrect".

tags:
3-6 precise lowercase tags.

entities:
key people,
countries,
companies,
assets,
or technologies.

Do not invent facts beyond candidate metadata.

Keep claims narrow when metadata is thin.

Return ONLY valid JSON in the form:

{"items":[...]}
`;

    const response =
      await ai.responses.create({
        model: MODEL,
        input: prompt
      });

    const parsed =
      parseJson(
        response.output_text
      );

    const candidateById =
      new Map(
        candidates.map(
          x => [
            String(x.id),
            x
          ]
        )
      );

    const items =
      (
        Array.isArray(parsed.items)
          ? parsed.items
          : []
      )
      .map(x => {

        const base =
          candidateById.get(
            String(x.id)
          );

        if (!base) {
          return null;
        }

        return {
          id: base.id,
          topic: String(
            x.topic || "Surprise"
          ),
          source: base.source,
          published: base.published,
          title: base.title,
          url: base.url,
          image: base.image,

          what:
            String(
              x.what || ""
            ).trim(),

          why:
            String(
              x.why || ""
            ).trim(),

          lesson:
            String(
              x.lesson || ""
            ).trim(),

          novelty:
            String(
              x.novelty || ""
            ).trim(),

          format:
            String(
              x.format ||
              "reflection"
            ),

          prompt:
            String(
              x.prompt || ""
            ).trim(),

          options:
            Array.isArray(
              x.options
            )
              ? x.options
                  .map(String)
                  .slice(0, 4)
              : [],

          reveal:
            String(
              x.reveal || ""
            ).trim(),

          tags:
            Array.isArray(
              x.tags
            )
              ? x.tags
                  .map(String)
                  .slice(0, 6)
              : [],

          entities:
            Array.isArray(
              x.entities
            )
              ? x.entities
                  .map(String)
                  .slice(0, 8)
              : []
        };
      })
      .filter(
        x =>
          x &&
          x.title &&
          x.what &&
          x.why &&
          x.lesson
      )
      .slice(
        0,
        batchSize
      );

    return res.status(200).json({
      items,
      candidateCount:
        unseen.length,
      model: MODEL,
      exhausted:
        items.length === 0
    });

  } catch (e) {

    console.error(e);

    return res.status(500).json({
      error: "feed_failed",
      detail:
        String(
          e?.message || e
        )
    });
  }
}
