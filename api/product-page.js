const fs = require("fs");
const path = require("path");

const DEFAULT_TITLE = "S.B.G. PUNCHING — Precision Metal Works, Bangalore";
const DEFAULT_DESC = "CNC Punching, Laser Cutting, Sheet Metal Fabrication & Control Panels in Bangalore. 15+ years. 50K+ projects.";
const PRODUCTION_ORIGIN = "https://www.sbgpunching.in";
const DEFAULT_IMAGE = `${PRODUCTION_ORIGIN}/img/og-image.jpg`;
const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'sha256-tYGkC3y9QbRnJGm74Eqsl5hGkR/BL/Uj3dmMj0hI3mA=' 'sha256-dsWWoim39blxymYPBNXYhZ8KrQEBwXentcqwzdhCf4o=' 'sha256-8mYakfI8MHvmw7U7y4/0r3RHReG4+ma7P0++jnf32wE=' 'sha256-JE4p5XX3NudBdEVaP7dhsVzFduX4IzASsvwQ7Z9oxAE=' 'sha256-rhcEPv4/9Zj9PVFi2KV0I3WT8SsRc1473LM7BADFP9Y=' 'sha256-3+wdB936UWdal5+d8gzQeDrA7AUlqKKYMXDzkfjleWs=' 'sha256-XdeDNvj3n7gZptgnV0rLLmlUFr6XAmTmeJsIRCCU73E=' 'sha256-VZZ8QAsUJ4wq9lCytXrkUmxk1uqwiN4vRas9rNfQAZY=' 'sha256-CBd1tO1a0YQjK0IAcZcyDpp0r9uryTUnkGH8Uh8hrSQ=' https://cdn.jsdelivr.net https://unpkg.com https://challenges.cloudflare.com https://cdn.vercel-insights.com https://va.vercel-scripts.com; script-src-attr 'none'; style-src 'self' https://fonts.googleapis.com; style-src-attr 'none'; img-src 'self' data: blob: https://*.supabase.co; media-src 'self' blob: https://*.supabase.co; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com https://vitals.vercel-insights.com; frame-src https://challenges.cloudflare.com https://www.google.com https://maps.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
};

function esc(value) {
  return String(value || "").replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function slugify(value) {
  return String(value || "product")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "product";
}

function productSlug(product) {
  return product?.slug || slugify(`${product?.category || "production"}-${product?.title || product?.id || "item"}`);
}

function rowQuantity(row) {
  if (!row) return null;
  const direct = Number(row.quantity);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const tag = (Array.isArray(row.tags) ? row.tags : []).find(value => /^qty:\d+$/i.test(String(value || "").trim()));
  const tagged = Number(String(tag || "").match(/^qty:(\d+)$/i)?.[1]);
  return Number.isFinite(tagged) && tagged > 0 ? tagged : null;
}

function supabaseRestUrl(rawUrl, tableName) {
  const url = new URL(String(rawUrl || "").trim());
  const basePath = url.pathname.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  url.pathname = `${basePath}/rest/v1/${tableName}`.replace(/\/{2,}/g, "/");
  url.search = "";
  url.hash = "";
  return url.toString();
}

function publicMediaUrl(src, supabaseUrl, origin = PRODUCTION_ORIGIN, bucket = "production-media-public") {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${origin}${value}`;
  try {
    const base = new URL(supabaseUrl);
    return `${base.origin}/storage/v1/object/public/${bucket}/${value.replace(/^\/+/, "")}`;
  } catch {
    return "";
  }
}

function productImage(row, supabaseUrl, origin) {
  const media = Array.isArray(row.media) ? row.media : [];
  const first = media[0] || {};
  return publicMediaUrl(first.path || first.url || first.src || row.image, supabaseUrl, origin, first.bucket || "production-media-public");
}

function readPublicConfig() {
  const candidates = [
    path.join(process.cwd(), "dist", "js", "config.js"),
    path.join(process.cwd(), "js", "config.js")
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    return {
      supabaseUrl: text.match(/supabaseUrl:\s*"([^"]+)"/)?.[1] || "",
      supabaseAnonKey: text.match(/supabaseAnonKey:\s*"([^"]+)"/)?.[1] || ""
    };
  }
  return { supabaseUrl: "", supabaseAnonKey: "" };
}

async function findProduct(slug) {
  const publicConfig = readPublicConfig();
  const supabaseUrl = process.env.SUPABASE_URL || publicConfig.supabaseUrl;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || publicConfig.supabaseAnonKey;
  if (!supabaseUrl || !apiKey || !slug) return null;

  const url = new URL(supabaseRestUrl(supabaseUrl, "productions"));
  url.searchParams.set("select", "id,title,category,material,thickness,quantity,status,description,tags,media,production_date,created_at,is_public");
  url.searchParams.set("is_public", "eq.true");
  url.searchParams.set("order", "production_date.desc,created_at.desc");

  const response = await fetch(url, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).find(row => productSlug(row) === slug) || null;
}

function requestOrigin(request) {
  const headers = request.headers || {};
  const host = headers["x-forwarded-host"] || headers.host;
  const proto = headers["x-forwarded-proto"] || "https";
  if (host && /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(host))) {
    return `${proto}://${host}`;
  }
  return PRODUCTION_ORIGIN;
}

function readIndexHtml() {
  const candidates = [
    path.join(process.cwd(), "index.html"),
    path.join(process.cwd(), "dist", "index.html"),
    path.join(__dirname, "..", "index.html"),
    path.join(__dirname, "..", "dist", "index.html")
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  }
  return "";
}

function fallbackHtml(title, desc, url, image) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="product">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<title>${esc(title)}</title>
<meta http-equiv="refresh" content="0;url=/index.html?product=${encodeURIComponent(url.split("/products/")[1] || "")}">
</head>
<body><p><a href="/index.html?product=${encodeURIComponent(url.split("/products/")[1] || "")}">Continue to product details</a></p></body>
</html>`;
}

function replaceMeta(html, product, slug, origin) {
  const publicConfig = readPublicConfig();
  const supabaseUrl = process.env.SUPABASE_URL || publicConfig.supabaseUrl;
  const quantity = rowQuantity(product);
  const title = product ? `${product.title || "Production Item"} | S.B.G. Punching` : DEFAULT_TITLE;
  const desc = product
    ? (product.description || `${product.category || "Production"} by S.B.G. Punching. Material: ${product.material || "As required"}${product.thickness ? `, thickness: ${product.thickness}` : ""}${quantity ? `, quantity: ${quantity}` : ""}.`).slice(0, 220)
    : DEFAULT_DESC;
  const url = `${origin}/products/${encodeURIComponent(slug || "")}`;
  const image = productImage(product || {}, supabaseUrl, origin) || DEFAULT_IMAGE;
  if (!html) return fallbackHtml(title, desc, url, image);
  const tags = [
    ["meta", "property", "og:title", title],
    ["meta", "property", "og:description", desc],
    ["meta", "property", "og:type", product ? "product" : "website"],
    ["meta", "property", "og:url", url],
    ["meta", "property", "og:image", image],
    ["meta", "property", "og:image:alt", product ? `${product.title || "Production item"} by S.B.G. Punching` : "S.B.G. Punching production gallery"],
    ["meta", "name", "twitter:card", "summary_large_image"],
    ["meta", "name", "twitter:title", title],
    ["meta", "name", "twitter:description", desc],
    ["meta", "name", "twitter:image", image]
  ].map(([, attr, key, content]) => `<meta ${attr}="${esc(key)}" content="${esc(content)}">`).join("\n");

  let output = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(title)}</title>`);
  output = output.replace(/<meta name="description" content="[^"]*"\s*\/?>/i, `<meta name="description" content="${esc(desc)}">`);
  output = output.replace(/\n?<meta property="og:[^"]+" content="[^"]*"\s*\/?>/gi, "");
  output = output.replace(/\n?<meta name="twitter:[^"]+" content="[^"]*"\s*\/?>/gi, "");
  output = output.replace("</head>", `${tags}\n<link rel="canonical" href="${esc(url)}">\n</head>`);
  return output;
}

module.exports = async function handler(request, response) {
  const rawSlug = String(request.query?.slug || "").split("/")[0];
  const slug = decodeURIComponent(rawSlug || "");
  const origin = requestOrigin(request);
  const html = readIndexHtml();
  let product = null;
  try {
    product = await findProduct(slug);
  } catch (error) {
    console.warn(error.message || error);
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=86400");
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => response.setHeader(key, value));
  response.status(200).send(replaceMeta(html, product, slug, origin));
};
