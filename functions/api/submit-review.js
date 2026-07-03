const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload"
};

const json = (status, body) => new Response(JSON.stringify(body), { status, headers });
const clean = (value, max) => String(value || "").trim().slice(0, max);

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

async function verifyTurnstile(env, token, remoteip) {
  const secret = env.TURNSTILE_SECRET_KEY;
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

async function insertReview(env, payload) {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase server environment variables are not configured.");
  }

  const response = await fetch(supabaseRestUrl(supabaseUrl, "production_reviews"), {
    method: "POST",
    headers: supabaseHeaders(serviceKey),
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = (await response.text()).trim();
    let detail = text;
    try {
      const parsed = JSON.parse(text);
      detail = parsed.message || parsed.error || text;
    } catch {
      // Supabase usually returns JSON, but keep the raw text when it does not.
    }
    throw new Error(detail || `Supabase review insert failed with HTTP ${response.status} ${response.statusText || ""}`.trim());
  }
}

export async function onRequestOptions() {
  return json(204, {});
}

export async function onRequestPost(context) {
  try {
    const input = await context.request.json().catch(() => ({}));
    const remoteip = context.request.headers.get("CF-Connecting-IP") || context.request.headers.get("client-ip");
    const security = await verifyTurnstile(context.env, input.captchaToken, remoteip);
    if (!security.ok) return json(403, { error: security.message });

    const payload = {
      product_slug: clean(input.product_slug, 140),
      rating: Math.max(1, Math.min(5, Number(input.rating) || 5)),
      reviewer_name: clean(input.reviewer_name, 80),
      comment: clean(input.comment, 700),
      approved: false
    };

    if (payload.product_slug.length < 3 || payload.reviewer_name.length < 2 || payload.comment.length < 3) {
      return json(400, { error: "Please complete the review fields." });
    }

    await insertReview(context.env, payload);
    return json(200, { ok: true, message: "Review submitted for approval." });
  } catch (error) {
    console.error(error);
    return json(500, { error: "Could not submit review. Please try again later." });
  }
}

export async function onRequest() {
  return json(405, { error: "Method not allowed." });
}
