const blockedPaths = [
  /^\/\.env(?:\..*)?$/i,
  /^\/\.git(?:\/.*)?$/i,
  /^\/\.github(?:\/.*)?$/i,
  /^\/supabase(?:\/.*)?$/i,
  /^\/functions(?:\/.*)?$/i,
  /^\/netlify(?:\/.*)?$/i,
  /^\/scripts(?:\/.*)?$/i,
  /^\/README\.md$/i,
  /^\/package(?:-lock)?\.json$/i,
  /^\/wrangler\.toml$/i,
  /^\/netlify\.toml$/i,
  /^\/vercel\.json$/i,
  /^\/_headers$/i,
  /^\/_redirects$/i,
  /^\/\.env\.example$/i
];
const canonicalHost = "www.sbgpunching.in";
const redirectHosts = new Set(["sbgpunching.in"]);

export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (redirectHosts.has(url.hostname.toLowerCase())) {
    url.protocol = "https:";
    url.hostname = canonicalHost;
    return Response.redirect(url.toString(), 301);
  }

  const path = url.pathname;
  if (blockedPaths.some(pattern => pattern.test(path))) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  }

  return context.next();
}
