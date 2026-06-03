/**
 * Vercel Speed Insights initialization for static HTML pages.
 * Vercel serves this route only after Speed Insights is enabled for the project.
 */
(function () {
  if (window.__sbgSpeedInsightsLoaded) return;
  window.__sbgSpeedInsightsLoaded = true;
  window.si = window.si || function () {
    (window.siq = window.siq || []).push(arguments);
  };

  var script = document.createElement("script");
  script.defer = true;
  script.src = "/_vercel/speed-insights/script.js";
  document.head.appendChild(script);
})();
