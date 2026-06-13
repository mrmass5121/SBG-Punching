const PRODUCTION_ORIGIN = "https://www.sbgpunching.in";
const DEFAULT_TITLE = "S.B.G. Punching - Precision Metal Works, Bangalore";
const DEFAULT_DESC = "CNC Punching, Laser Cutting, Sheet Metal Fabrication and Control Panels in Bangalore.";
const DEFAULT_IMAGE = `${PRODUCTION_ORIGIN}/img/og-image.jpg`;

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
  const direct = Number(row?.quantity);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const tag = (Array.isArray(row?.tags) ? row.tags : []).find(value => /^qty:\d+$/i.test(String(value || "").trim()));
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

function publicMediaUrl(src, supabaseUrl, bucket = "production-media-public") {
  const value = String(src || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `${PRODUCTION_ORIGIN}${value}`;
  try {
    const base = new URL(supabaseUrl);
    return `${base.origin}/storage/v1/object/public/${bucket}/${value.replace(/^\/+/, "")}`;
  } catch {
    return "";
  }
}

function productImage(row, supabaseUrl) {
  const media = Array.isArray(row?.media) ? row.media : [];
  const first = media[0] || {};
  return publicMediaUrl(first.path || first.url || first.src || row?.image, supabaseUrl, first.bucket || "production-media-public");
}

async function findProduct(env, slug) {
  const supabaseUrl = env.SUPABASE_URL;
  const apiKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
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

function productHtml(product, slug, supabaseUrl) {
  const quantity = rowQuantity(product);
  const title = product ? `${product.title || "Production Item"} | S.B.G. Punching` : DEFAULT_TITLE;
  const desc = product
    ? (product.description || `${product.category || "Production"} by S.B.G. Punching. Material: ${product.material || "As required"}${product.thickness ? `, thickness: ${product.thickness}` : ""}${quantity ? `, quantity: ${quantity}` : ""}.`).slice(0, 220)
    : DEFAULT_DESC;
  const url = `${PRODUCTION_ORIGIN}/products/${encodeURIComponent(slug || "")}`;
  const image = productImage(product || {}, supabaseUrl) || DEFAULT_IMAGE;
  const type = product ? "product" : "website";
  const target = `/index.html?product=${encodeURIComponent(slug || "")}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="${esc(type)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(product ? `${product.title || "Production item"} by S.B.G. Punching` : "S.B.G. Punching production gallery")}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta http-equiv="refresh" content="0;url=${esc(target)}">
</head>
<body><p><a href="${esc(target)}">Continue to product details</a></p></body>
</html>`;
}

export async function onRequestGet(context) {
  const slug = decodeURIComponent(String(context.params.slug || "").split("/")[0]);
  let product = null;
  try {
    product = await findProduct(context.env, slug);
  } catch (error) {
    console.warn(error.message || error);
  }

  return new Response(productHtml(product, slug, context.env.SUPABASE_URL || ""), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400"
    }
  });
}

export async function onRequest() {
  return new Response("Method not allowed", { status: 405 });
}
