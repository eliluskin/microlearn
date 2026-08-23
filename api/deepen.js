import OpenAI from "openai";

const ai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const MODEL =
  process.env.OPENAI_MODEL ||
  "gpt-5.6-luna";

const MODES = {

  deeper:
    "Go one level deeper. Explain the mechanism, second-order effects, what most readers miss, and what would change the conclusion.",

  counter:
    "Build the strongest credible counterargument. Identify assumptions, alternative interpretations, and evidence that would weaken the original framing.",

  investment:
    "Analyze the investment angle. Separate direct exposure from second-order exposure, identify possible catalysts and risks, and say what would actually matter for an investor. Do not give personalized buy/sell instructions.",

  context:
    "Give the minimum high-value context needed to understand this story: relevant history, actors, incentives, causal chain, and what to watch next."
};

export default async function handler(req, res) {

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method !== "POST") {

    return res.status(405).json({
      error: "POST only"
    });
  }

  if (!process.env.OPENAI_API_KEY) {

    return res.status(503).json({
      error:
        "OPENAI_API_KEY missing"
    });
  }

  try {

    const item =
      req.body?.item;

    const mode =
      String(
        req.body?.mode ||
        "deeper"
      );

    const profile =
      req.body?.profile || {};

    if (!item?.title) {

      return res.status(400).json({
        error: "item required"
      });
    }

    const instruction =
      MODES[mode] ||
      MODES.deeper;

    const prompt = `
You are the analysis layer inside LearningOS.

TASK:

${instruction}

USER CONTEXT:

${JSON.stringify({
  watch:
    profile.watch || [],
  topics:
    profile.topics || {}
})}

STORY:

${JSON.stringify({
  title: item.title,
  source: item.source,
  published: item.published,
  what: item.what,
  why: item.why,
  lesson: item.lesson,
  novelty: item.novelty,
  tags: item.tags,
  entities: item.entities,
  url: item.url
})}

Rules:

- Be interesting, concrete and intellectually useful.

- Do not repeat the card in different words.

- Distinguish facts from inference.

- Do not invent fresh facts that are not supported by the story data.

- If the available information is too thin for a claim, say what is uncertain.

- Use 4-7 short paragraphs or compact sections, optimized for reading on a phone.

- End with one specific thing to watch that could materially change the interpretation.
`;

    const response =
      await ai.responses.create({
        model: MODEL,
        input: prompt
      });

    return res.status(200).json({
      answer:
        String(
          response.output_text ||
          ""
        ).trim(),
      model: MODEL
    });

  } catch (e) {

    console.error(e);

    return res.status(500).json({
      error: "deepen_failed",
      detail:
        String(
          e?.message || e
        )
    });
  }
}
