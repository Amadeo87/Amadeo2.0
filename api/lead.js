const MAX_BODY_SIZE = 16 * 1024;
const MAX_FIELD_LENGTH = 2000;

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readPayload(req) {
  const chunks = [];
  let size = 0;
  let tooLarge = false;

  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE) {
      tooLarge = true;
    } else if (!tooLarge) {
      chunks.push(chunk);
    }
  }

  if (tooLarge) return { error: "Request body too large", statusCode: 413 };

  try {
    const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { error: "Invalid request body", statusCode: 400 };
    }
    return { payload };
  } catch {
    return { error: "Invalid JSON", statusCode: 400 };
  }
}

function readField(payload, key) {
  const value = payload[key];
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_FIELD_LENGTH);
}

module.exports = async function handleLead(req, res) {
  const allowedOrigin =
    process.env.ALLOWED_ORIGIN || "https://amadeo87.github.io";
  const requestOrigin = req.headers.origin;

  res.setHeader("Vary", "Origin");
  if (requestOrigin && requestOrigin !== allowedOrigin) {
    return sendJson(res, 403, { error: "Origin not allowed" });
  }

  if (requestOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  }

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.writeHead(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!req.headers["content-type"]?.startsWith("application/json")) {
    return sendJson(res, 415, {
      error: "Content-Type must be application/json",
    });
  }

  const result = await readPayload(req);
  if (result.error) {
    return sendJson(res, result.statusCode, { error: result.error });
  }

  const payload = result.payload;
  const name = readField(payload, "name");
  const phone = readField(payload, "phone");
  if (!name || !phone) {
    return sendJson(res, 400, { error: "Name and phone are required" });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!botToken || !chatId) {
    console.error("Telegram lead endpoint is missing server configuration");
    return sendJson(res, 500, { error: "Lead service is not configured" });
  }

  const fields = [
    ["Джерело", readField(payload, "source")],
    ["Напрямок", readField(payload, "practice")],
    ["Етап", readField(payload, "stage")],
    ["Орієнтовний термін", readField(payload, "estimate")],
    ["Рекомендована дія", readField(payload, "action")],
    ["Ім'я", name],
    ["Телефон", phone],
    ["Опис", readField(payload, "message")],
  ];
  const text = fields
    .filter(([, value]) => value)
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n")
    .slice(0, 4000);

  try {
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      },
    );
    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramResult.ok) {
      console.error(
        "Telegram rejected a lead",
        telegramResponse.status,
        telegramResult.description || "Unknown Telegram API error",
      );
      return sendJson(res, 502, { error: "Could not deliver lead" });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Could not deliver lead to Telegram", error);
    return sendJson(res, 502, { error: "Could not deliver lead" });
  }
};
