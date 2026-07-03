const cfg = window.SBG_CONFIG || {};
const publicBucket = cfg.publicStorageBucket || cfg.storageBucket || "production-media-public";
const privateBucket = cfg.privateStorageBucket || "production-media-private";
const createClient = window.supabase?.createClient;

function hasConfigValue(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/^YOUR_/i.test(text) && !/^PASTE_/i.test(text) && !/[<>]/.test(text);
}

export const isSupabaseConfigured = Boolean(
  createClient &&
  hasConfigValue(cfg.supabaseUrl) &&
  hasConfigValue(cfg.supabaseAnonKey) &&
  /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(cfg.supabaseUrl).trim())
);

export const supabase = isSupabaseConfigured
  ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
  : null;

export function getPublicMediaUrl(pathOrUrl, bucket = publicBucket) {
  if (!pathOrUrl) return "";
  pathOrUrl = normalizeStoragePath(pathOrUrl, bucket);
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith("data:") || pathOrUrl.startsWith("blob:")) return pathOrUrl;
  if (!supabase) return pathOrUrl;
  const { data } = supabase.storage.from(bucket).getPublicUrl(pathOrUrl);
  return data.publicUrl;
}

export function normalizeStoragePath(pathOrUrl, bucket = publicBucket) {
  const value = String(pathOrUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("data:") || value.startsWith("blob:")) return value;
  const bucketNames = [...new Set([bucket, publicBucket, privateBucket].filter(Boolean))];
  for (const bucketName of bucketNames) {
    const prefix = `${bucketName}/`;
    if (value.startsWith(prefix)) return value.slice(prefix.length);
    const marker = `/storage/v1/object/public/${bucketName}/`;
    const markerIndex = value.indexOf(marker);
    if (markerIndex >= 0) return decodeURIComponent(value.slice(markerIndex + marker.length).split(/[?#]/)[0]);
    const signedMarker = `/storage/v1/object/sign/${bucketName}/`;
    const signedIndex = value.indexOf(signedMarker);
    if (signedIndex >= 0) return decodeURIComponent(value.slice(signedIndex + signedMarker.length).split(/[?#]/)[0]);
  }
  return value;
}

export async function getMediaUrl(media, options = {}) {
  const pathOrUrl = typeof media === "string" ? media : (media?.path || media?.url || "");
  if (!pathOrUrl) return "";
  if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith("data:") || pathOrUrl.startsWith("blob:")) return pathOrUrl;
  if (!supabase) return pathOrUrl;

  const bucket = media?.bucket || options.bucket || publicBucket;
  const path = normalizeStoragePath(pathOrUrl, bucket);
  const isPrivate = Boolean(media?.private) || bucket === privateBucket;
  if (!isPrivate) return getPublicMediaUrl(path, bucket);

  const expiresIn = Number(options.expiresIn) || 900;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data?.signedUrl || "";
}
