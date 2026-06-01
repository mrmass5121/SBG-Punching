import { supabase, isSupabaseConfigured, getPublicMediaUrl } from "./supabaseClient.js";

const cfg = window.SBG_CONFIG || {};
const fallbackProductions = [];

let productions = [];
let activeFilter = "all";
let searchTerm = "";
let lightboxItems = [];
let lightboxIndex = 0;

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const publicBucket = cfg.publicStorageBucket || cfg.storageBucket || "production-media-public";
const privateBucket = cfg.privateStorageBucket || "production-media-private";
const isPrivateMedia = media => Boolean(media?.private) || media?.bucket === privateBucket;
const publicMediaUrl = media => {
  if (!media || isPrivateMedia(media)) return "";
  return getPublicMediaUrl(media.path || media.url || media.src || "", media.bucket || publicBucket);
};
const quantityTagPattern = /^qty:(\d+)$/i;
const formatQuantity = value => {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity.toLocaleString("en-IN") : "1";
};
const isQuantityTag = tag => quantityTagPattern.test(String(tag || "").trim());
const visibleTags = tags => (tags || []).filter(tag => !isQuantityTag(tag));
const productionQuantity = item => {
  const direct = Number(item?.quantity);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const tag = (item?.tags || []).find(isQuantityTag);
  const tagged = Number(String(tag || "").match(quantityTagPattern)?.[1]);
  return Number.isFinite(tagged) && tagged > 0 ? tagged : 1;
};

document.addEventListener("DOMContentLoaded", async () => {
  window.lucide?.createIcons();
  bindNavigation();
  bindReveal();
  bindCounters();
  bindForms();
  bindLightbox();
  bindWhatsapp();
  qs("#productionSearch")?.addEventListener("input", event => {
    searchTerm = event.target.value.trim().toLowerCase();
    renderCards();
  });
  await loadProductions();
  registerRealtime();
  registerServiceWorker();
});

function bindNavigation() {
  const toggle = qs("#menuToggle");
  const panel = qs("#mobilePanel");
  toggle?.addEventListener("click", () => {
    const open = panel.hasAttribute("hidden");
    panel.toggleAttribute("hidden", !open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  qsa("#mobilePanel a").forEach(link => link.addEventListener("click", () => {
    panel.setAttribute("hidden", "");
    toggle?.setAttribute("aria-expanded", "false");
  }));
  window.addEventListener("scroll", () => qs("#siteHeader")?.classList.toggle("scrolled", scrollY > 12), { passive: true });
}

function bindReveal() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle("is-visible", entry.isIntersecting));
  }, { threshold: 0.14 });
  qsa(".reveal").forEach(el => observer.observe(el));
}

function bindCounters() {
  const counters = qsa("[data-counter]");
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting || entry.target.dataset.done) return;
      entry.target.dataset.done = "true";
      const target = Number(entry.target.dataset.counter || 0);
      const start = performance.now();
      const tick = now => {
        const progress = Math.min(1, (now - start) / 950);
        entry.target.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3))).toLocaleString("en-IN");
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  counters.forEach(counter => observer.observe(counter));
}

async function loadProductions() {
  if (!isSupabaseConfigured) {
    productions = fallbackProductions;
    renderProduction();
    return;
  }

  const { data, error } = await supabase
    .from("productions")
    .select("*")
    .eq("is_public", true)
    .order("production_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    productions = fallbackProductions;
  } else {
    productions = data || [];
  }
  renderProduction();
}

function registerRealtime() {
  if (!isSupabaseConfigured) return;
  supabase.channel("public-production-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "productions" }, loadProductions)
    .subscribe();
}

function renderProduction() {
  const filters = ["all", ...new Set(productions.map(item => item.category).filter(Boolean))];
  qs("#productionFilters").innerHTML = filters.map(filter => `<button class="chip ${filter === activeFilter ? "active" : ""}" data-filter="${esc(filter)}">${esc(filter)}</button>`).join("");
  qsa("#productionFilters .chip").forEach(btn => btn.addEventListener("click", () => {
    activeFilter = btn.dataset.filter;
    renderProduction();
  }));

  renderStats();
  renderCards();
  renderFeatured();
  window.lucide?.createIcons();
}

function filteredProduction() {
  return productions.filter(item => {
    const matchesFilter = activeFilter === "all" || item.category === activeFilter;
    const blob = [item.title, item.category, item.material, productionQuantity(item), item.customer_name, item.status, item.description, ...(item.tags || [])].join(" ").toLowerCase();
    return matchesFilter && (!searchTerm || blob.includes(searchTerm));
  });
}

function renderStats() {
  const today = new Date().toISOString().slice(0, 10);
  const stats = [
    ["Total live jobs", productions.length],
    ["Today", productions.filter(item => item.production_date === today).length],
    ["Completed", productions.filter(item => item.status === "Completed").length],
    ["Featured", productions.filter(item => item.featured).length]
  ];
  qs("#productionStats").innerHTML = stats.map(([label, value]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
}

function renderCards() {
  const gallery = qs("#productionGallery");
  const items = filteredProduction();
  if (!items.length) {
    gallery.innerHTML = `<div class="empty-state">No production entries match this view.</div>`;
    return;
  }
  lightboxItems = items.flatMap(item => (item.media || []).map(media => ({ ...media, title: item.title, category: item.category })));
  gallery.innerHTML = items.map((item, index) => productionCard(item, index)).join("");
  qsa("[data-preview]").forEach(button => button.addEventListener("click", () => openLightbox(Number(button.dataset.preview))));
  window.lucide?.createIcons();
}

function productionCard(item, index) {
  const media = (item.media || [])[0] || {};
  const src = publicMediaUrl(media);
  const mediaHtml = !src
    ? `<div class="empty-media"><i data-lucide="image"></i></div>`
    : media.type === "video"
    ? `<video src="${esc(src)}" muted playsinline preload="metadata"></video>`
    : `<img src="${esc(src)}" alt="${esc(media.alt || item.title)}" loading="lazy">`;
  const lightboxOffset = lightboxItems.findIndex(entry => entry.title === item.title);
  return `
    <article class="production-card reveal is-visible">
      <button class="media-button" type="button" data-preview="${Math.max(0, lightboxOffset)}" aria-label="Preview ${esc(item.title)}">
        ${mediaHtml}
        <span class="status ${statusClass(item.status)}">${esc(item.status || "Live")}</span>
      </button>
      <div class="production-content">
        <div class="card-kicker">${esc(item.category || "Production")}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(item.description)}</p>
        <div class="meta-line"><span>${esc(item.material || "Material TBC")}</span><span>Qty ${formatQuantity(productionQuantity(item))}</span><span>${formatDate(item.production_date)}</span></div>
        <div class="tag-row">${visibleTags(item.tags).slice(0, 4).map(tag => `<span>${esc(tag)}</span>`).join("")}</div>
      </div>
    </article>`;
}

function renderFeatured() {
  const featured = productions.filter(item => item.featured).slice(0, 3);
  qs("#featuredProjects").innerHTML = featured.map(item => `
    <article class="project-card reveal is-visible">
      <span>${esc(item.category)}</span>
      <h3>${esc(item.title)}</h3>
      <p>${esc(item.description)}</p>
    </article>
  `).join("");
}

function statusClass(status = "") {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function formatDate(value) {
  if (!value) return "Date TBC";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function bindForms() {
  qs("#quote")?.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = qs("#formStatus");
    const payload = Object.fromEntries(new FormData(form).entries());
    if (payload.website) return;
    status.textContent = "Submitting inquiry...";

    if (isSupabaseConfigured) {
      const { error } = await supabase.from("inquiries").insert({
        company_name: payload.company_name,
        contact_name: payload.contact_name,
        phone: payload.phone,
        email: payload.email,
        service: payload.service,
        message: payload.message,
        source: "contact-section"
      });
      if (error) {
        status.textContent = "Could not submit right now. Please use phone or WhatsApp.";
        return;
      }
    }

    status.textContent = "Inquiry received. We will contact you shortly.";
    form.reset();
  });
}

function bindWhatsapp() {
  const url = `https://wa.me/${cfg.whatsappNumber}?text=${encodeURIComponent("Hello SBG Punching, I want to discuss a fabrication requirement.")}`;
  qs("#whatsappFloat")?.addEventListener("click", () => window.open(url, "_blank", "noopener"));
  const contact = qs("#whatsappContact");
  if (contact) contact.href = url;
}

function bindLightbox() {
  qs("#lightboxClose")?.addEventListener("click", closeLightbox);
  qs("#lightboxPrev")?.addEventListener("click", () => moveLightbox(-1));
  qs("#lightboxNext")?.addEventListener("click", () => moveLightbox(1));
  qs("#lightbox")?.addEventListener("click", event => { if (event.target.id === "lightbox") closeLightbox(); });
  document.addEventListener("keydown", event => {
    if (qs("#lightbox")?.hasAttribute("hidden")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") moveLightbox(-1);
    if (event.key === "ArrowRight") moveLightbox(1);
  });
}

function openLightbox(index) {
  lightboxIndex = index;
  renderLightbox();
  qs("#lightbox").removeAttribute("hidden");
  document.body.classList.add("modal-open");
}

function closeLightbox() {
  qs("#lightbox").setAttribute("hidden", "");
  document.body.classList.remove("modal-open");
}

function moveLightbox(delta) {
  lightboxIndex = (lightboxIndex + delta + lightboxItems.length) % lightboxItems.length;
  renderLightbox();
}

function renderLightbox() {
  const item = lightboxItems[lightboxIndex] || {};
  const src = publicMediaUrl(item);
  if (!src) {
    qs("#lightboxBody").innerHTML = `<div class="empty-state">This media is private. Publish or re-upload it from the admin page.</div>`;
    return;
  }
  qs("#lightboxBody").innerHTML = item.type === "video"
    ? `<video src="${esc(src)}" controls autoplay playsinline></video><figcaption>${esc(item.title || "")}</figcaption>`
    : `<img src="${esc(src)}" alt="${esc(item.alt || item.title || "Production preview")}"><figcaption>${esc(item.title || "")}</figcaption>`;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js").catch(console.warn);
  }
}
