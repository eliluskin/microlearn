import { redis, hasRedis } from "./_redis.js";

// Protects the endpoints that spend OpenAI credits:
// - rejects requests sent from other websites,
// - caps calls per IP per hour and across everyone per day.
// If Redis is unavailable the limits are skipped so the app keeps working;
// the prepaid OpenAI balance remains the hard spending cap.

const DAILY_AI_CALLS =
  Number(process.env.DAILY_AI_CALL_LIMIT) || 400;

function clientIp(req) {
  const fwd = String(req.headers["x-forwarded-for"] || "");
  return (
    fwd.split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "") ||
    "unknown"
  );
}

function sameOrigin(req) {
  const origin = req.headers.origin;

  // Native apps and server-to-server calls send no Origin header.
  if (!origin) return true;

  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

async function bump(key, ttlSeconds) {
  const n = Number(await redis("INCR", key));

  if (n === 1) {
    await redis("EXPIRE", key, ttlSeconds);
  }

  return n;
}

/**
 * Returns true if the request may proceed; otherwise sends the error
 * response itself and returns false.
 */
export async function guard(req, res, { bucket, perIpPerHour, cost = 1 }) {
  if (!sameOrigin(req)) {
    res.status(403).json({ error: "forbidden_origin" });
    return false;
  }

  if (!hasRedis()) return true;

  try {
    const hour = Math.floor(Date.now() / 36e5);
    const day = new Date().toISOString().slice(0, 10);

    const perIp = await bump(
      `learningos:rl:${bucket}:${clientIp(req)}:${hour}`,
      3600
    );

    if (perIp > perIpPerHour) {
      res.status(429).json({ error: "rate_limited", retryAfter: "1h" });
      return false;
    }

    let total = 0;

    for (let i = 0; i < cost; i++) {
      total = await bump(`learningos:rl:ai-day:${day}`, 2 * 86400);
    }

    if (total > DAILY_AI_CALLS) {
      res.status(429).json({ error: "daily_ai_limit_reached" });
      return false;
    }
  } catch (e) {
    console.warn("rate limit check failed, allowing request", e?.message);
  }

  return true;
}

/** Rejects oversized client payloads before they become expensive prompts. */
export function tooLarge(res, value, maxChars) {
  const size = JSON.stringify(value ?? null).length;

  if (size > maxChars) {
    res.status(413).json({ error: "payload_too_large" });
    return true;
  }

  return false;
}
