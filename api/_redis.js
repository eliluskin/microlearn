// Shared Upstash/Vercel KV REST helper. Files starting with "_" are not
// exposed as API routes by Vercel.

const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;

export const hasRedis = () =>
  Boolean(REDIS_URL && REDIS_TOKEN);

export async function redis(...command) {
  if (!hasRedis()) {
    throw new Error("Redis environment variables missing");
  }

  const r =
    await fetch(
      REDIS_URL,
      {
        method:"POST",

        headers:{
          Authorization:
            `Bearer ${REDIS_TOKEN}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(command)
      }
    );

  if (!r.ok) {
    throw new Error(
      `Redis HTTP ${r.status}: ${
        await r.text()
      }`
    );
  }

  const d =
    await r.json();

  return d.result;
}
