const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
};

const clean = (value, max) => String(value || "").trim().slice(0, max);

function send(response, statusCode, body) {
  response.status(statusCode);
  Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
  response.json(body);
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return request.body;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body || "{}");
  }

  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function remoteAddress(request) {
  const forwardedFor = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (
    request.headers["cf-connecting-ip"] ||
    request.headers["x-real-ip"] ||
    request.headers["x-vercel-forwarded-for"] ||
    forwardedFor ||
    request.headers["client-ip"] ||
    ""
  );
}

function supabaseHeaders(serviceKey) {
  return {
    "Content-Type": "application/json",
    "apikey": serviceKey,
    "Authorization": `Bearer ${serviceKey}`,
    "Prefer": "return=minimal"
  };
}

function supabaseRestUrl(rawUrl, tableName) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    const basePath = url.pathname.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
    url.pathname = `${basePath}/rest/v1/${tableName}`.replace(/\/{2,}/g, "/");
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    throw new Error("SUPABASE_URL must be your project URL, for example https://project-ref.supabase.co");
  }
}

async function verifyTurnstile(token, remoteip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: false, message: "Turnstile secret key is not configured." };
  if (!token) return { ok: false, message: "Please complete the security check." };

  const form = new URLSearchParams();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteip) form.set("remoteip", remoteip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const result = await response.json().catch(() => ({}));
  const errors = Array.isArray(result["error-codes"]) ? result["error-codes"].join(", ") : "";
  return {
    ok: Boolean(result.success),
    message: errors ? `Security check failed: ${errors}` : "Security check failed. Please try again."
  };
}

async function insertInquiry(payload) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  const response = await fetch(supabaseRestUrl(supabaseUrl, "inquiries"), {
    method: "POST",
    headers: supabaseHeaders(serviceKey),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase inquiry insert failed with HTTP ${response.status} ${response.statusText || ""}`.trim());
  }
}

module.exports = async function handler(request, response) {
  if (request.method === "OPTIONS") return send(response, 204, {});
  if (request.method !== "POST") return send(response, 405, { error: "Method not allowed." });

  try {
    const input = await readJsonBody(request).catch(() => ({}));
    const security = await verifyTurnstile(input.captchaToken, remoteAddress(request));
    if (!security.ok) return send(response, 403, { error: security.message });

    const payload = {
      company_name: clean(input.company_name, 140),
      contact_name: clean(input.contact_name, 140),
      phone: clean(input.phone, 40),
      email: clean(input.email, 180),
      service: clean(input.service, 120),
      message: clean(input.message, 1200),
      source: "website"
    };

    if (payload.contact_name.length < 2 || payload.phone.length < 7 || payload.service.length < 2 || payload.message.length < 5) {
      return send(response, 400, { error: "Please complete the required inquiry fields." });
    }

    await insertInquiry(payload);
    return send(response, 200, { ok: true, message: "Inquiry submitted." });
  } catch (error) {
    console.error(error);
    return send(response, 500, { error: "Could not submit inquiry. Please try WhatsApp or call us directly." });
  }
};
