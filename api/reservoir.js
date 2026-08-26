const REDIS_URL =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;

const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;

const MAX_ITEMS = 100;

function reservoirKey(deviceId) {
  return `learningos:reservoir:${deviceId}`;
}

function profileKey(deviceId) {
  return `learningos:profile:${deviceId}`;
}

async function redis(...command) {
  if (!REDIS_URL || !REDIS_TOKEN) {
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

async function getItems(deviceId) {
  const raw =
    await redis(
      "GET",
      reservoirKey(deviceId)
    );

  if (!raw) {
    return [];
  }

  try {
    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch {
    return [];
  }
}

async function saveItems(
  deviceId,
  items
) {
  await redis(
    "SET",
    reservoirKey(deviceId),
    JSON.stringify(items)
  );
}

function maxAge(item) {
  const topic =
    String(
      item?.topic || ""
    );

  if (
    [
      "Markets",
      "Investments",
      "Geopolitics",
      "Israel",
      "Politics"
    ].includes(topic)
  ) {
    return 72 * 60 * 60 * 1000;
  }

  if (
    [
      "AI",
      "Robotics",
      "ADAS"
    ].includes(topic)
  ) {
    return 5 * 24 * 60 * 60 * 1000;
  }

  return 14 * 24 * 60 * 60 * 1000;
}

function cleanItems(
  items,
  seenIds = []
) {
  const seen =
    new Set(
      (seenIds || []).map(
        x => String(x)
      )
    );

  const ids =
    new Set();

  const now =
    Date.now();

  return (items || [])
    .filter(item => {

      if (!item?.id) {
        return false;
      }

      const id =
        String(item.id);

      if (
        seen.has(id) ||
        ids.has(id)
      ) {
        return false;
      }

      const published =
        Date.parse(
          item.published || ""
        );

      if (
        published &&
        now - published >
          maxAge(item)
      ) {
        return false;
      }

      ids.add(id);

      return true;
    })
    .slice(
      0,
      MAX_ITEMS
    );
}

export default async function handler(
  req,
  res
) {
  res.setHeader(
    "Cache-Control",
    "no-store"
  );
if (req.method === "GET") {
  try {
    const pong = await redis("PING");

    return res
      .status(200)
      .json({
        ok:true,
        redis:pong
      });

  } catch (e) {
    return res
      .status(500)
      .json({
        ok:false,
        error:String(
          e?.message || e
        )
      });
  }
}
  if (
    req.method !== "POST"
  ) {
    return res
      .status(405)
      .json({
        error:"POST only"
      });
  }

  try {

    const body =
      req.body || {};

    const deviceId =
      String(
        body.deviceId || ""
      )
      .trim()
      .slice(0,128);

    if (!deviceId) {
      return res
        .status(400)
        .json({
          error:"deviceId required"
        });
    }

    const action =
      body.action || "get";

    await redis(
      "SADD",
      "learningos:devices",
      deviceId
    );

    if (
      body.profile &&
      typeof body.profile ===
        "object"
    ) {
      await redis(
        "SET",
        profileKey(deviceId),
        JSON.stringify(
          body.profile
        )
      );
    }

    if (action === "get") {

      const existing =
        await getItems(
          deviceId
        );

      const items =
        cleanItems(
          existing,
          body.seenIds
        );

      if (
        items.length !==
        existing.length
      ) {
        await saveItems(
          deviceId,
          items
        );
      }

      return res
        .status(200)
        .json({
          items,
          count:items.length
        });
    }

    if (action === "put") {

      const existing =
        await getItems(
          deviceId
        );

      const incoming =
        Array.isArray(
          body.items
        )
          ? body.items
          : [];

      const items =
        cleanItems(
          [
            ...incoming,
            ...existing
          ],
          body.seenIds
        );

      await saveItems(
        deviceId,
        items
      );

      return res
        .status(200)
        .json({
          items,
          count:items.length
        });
    }

    if (action === "consume") {

      const remove =
        new Set(
          (
            body.ids || []
          ).map(
            x => String(x)
          )
        );

      const existing =
        await getItems(
          deviceId
        );

      const items =
        existing.filter(
          item =>
            !remove.has(
              String(item.id)
            )
        );

      await saveItems(
        deviceId,
        items
      );

      return res
        .status(200)
        .json({
          ok:true,
          count:items.length
        });
    }

    return res
      .status(400)
      .json({
        error:"unknown action"
      });

  } catch (e) {

    console.error(
      "reservoir error",
      e
    );

    return res
      .status(500)
      .json({
        error:
          "reservoir_failed",

        detail:
          String(
            e?.message || e
          )
      });
  }
}
