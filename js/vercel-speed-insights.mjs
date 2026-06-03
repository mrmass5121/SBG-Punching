/**
 * Lightweight static-site helpers for Vercel Speed Insights.
 * Keep this browser-safe: the site is copied as static files, so bare package
 * imports such as "@vercel/speed-insights" cannot be resolved by the browser.
 */
export function computeRoute(pathname = window.location.pathname) {
  return String(pathname || "/").replace(/\/products\/[^/?#]+/i, "/products/[slug]");
}

export function injectSpeedInsights() {
  if (window.__sbgSpeedInsightsLoaded) return;
  window.__sbgSpeedInsightsLoaded = true;
  window.si = window.si || function () {
    (window.siq = window.siq || []).push(arguments);
  };

  const script = document.createElement("script");
  script.defer = true;
  script.src = "/_vercel/speed-insights/script.js";
  document.head.appendChild(script);
}
