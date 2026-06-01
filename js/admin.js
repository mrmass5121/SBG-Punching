import { supabase, isSupabaseConfigured, getMediaUrl, normalizeStoragePath } from "./supabaseClient.js";

const cfg = window.SBG_CONFIG || {};
const isLogin = Boolean(document.getElementById("loginForm"));
const isDashboard = Boolean(document.querySelector(".admin-shell"));
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);
const maxBytes = (Number(cfg.maxUploadMb) || 20) * 1024 * 1024;
const publicBucket = cfg.publicStorageBucket || cfg.storageBucket || "production-media-public";
const privateBucket = cfg.privateStorageBucket || "production-media-private";

let currentUser = null;
let productions = [];
let inquiries = [];
let services = [];
let reviews = [];
let selectedMedia = [];
let uploadedMedia = [];
let mediaForm = null;
let lightboxItems = [];
let lightboxIndex = 0;
let currentUserRole = "";
let publicMediaRepairRunning = false;

const qs = (selector, root = document) => root.querySelector(selector);
const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
const quantityTagPattern = /^qty:(\d+)$/i;
const formatQuantity = value => {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity.toLocaleString("en-IN") : "1";
};
const isQuantityTag = tag => quantityTagPattern.test(String(tag || "").trim());
const stripQuantityTags = tags => (tags || []).filter(tag => !isQuantityTag(tag));
const withQuantityTag = (tags, quantity) => [...stripQuantityTags(tags), `qty:${Math.max(1, Number.parseInt(quantity, 10) || 1)}`];
const productionQuantity = item => {
  const direct = Number(item?.quantity);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const tag = (item?.tags || []).find(isQuantityTag);
  const tagged = Number(String(tag || "").match(quantityTagPattern)?.[1]);
  return Number.isFinite(tagged) && tagged > 0 ? tagged : 1;
};
const slugify = value => String(value || "product").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "product";
const productReviewKey = product => product?.slug || slugify(`${product?.category || "production"}-${product?.title || product?.id || "item"}`);
const isFullAdmin = () => currentUserRole === "admin";
const canUseAdmin = role => ["admin", "standard"].includes(role);
const mediaBucket = media => media?.bucket || publicBucket;
const isPrivateMedia = media => Boolean(media?.private) || mediaBucket(media) === privateBucket;
const hasPrivateMedia = item => (item?.media || []).some(isPrivateMedia);

function safeStorageName(value) {
  const clean = String(value || "production-media")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90);
  return clean || "production-media";
}

async function makeMediaPublic(media = {}, index = 0) {
  const path = normalizeStoragePath(media.path || media.url || "", mediaBucket(media));
  if (!path || !isPrivateMedia(media)) return { ...media, path };

  const privateBucketName = mediaBucket(media);
  let blob = null;
  const download = await supabase.storage.from(privateBucketName).download(path);
  if (download.error) {
    const signedUrl = await getMediaUrl({ ...media, path }, { expiresIn: 120 });
    const response = await fetch(signedUrl);
    if (!response.ok) throw new Error(`Could not copy private media (${response.status}).`);
    blob = await response.blob();
  } else {
    blob = download.data;
  }

  const originalName = media.alt || path.split("/").pop() || "production-media";
  const publicPath = `${currentUser.id}/public-${Date.now()}-${index}-${safeStorageName(originalName)}`;
  const contentType = blob.type || (media.type === "video" ? "video/mp4" : "image/jpeg");
  const { error } = await supabase.storage.from(publicBucket).upload(publicPath, blob, {
    cacheControl: "31536000",
    upsert: true,
    contentType
  });
  if (error) throw error;
  return {
    ...media,
    path: publicPath,
    bucket: publicBucket,
    private: false,
    size: media.size || blob.size,
    type: media.type || (contentType.startsWith("video/") ? "video" : "image")
  };
}

async function ensurePublicMedia(mediaList = []) {
  return Promise.all((mediaList || []).map((media, index) => makeMediaPublic(media, index)));
}

function secureMediaElement(media = {}, alt = "Media preview") {
  const path = normalizeStoragePath(media.path || "", mediaBucket(media));
  const url = media.url || "";
  if (!path && !url) return `<div class="empty-media"><i data-lucide="image"></i></div>`;
  const bucket = media.bucket || publicBucket;
  const isPrivate = Boolean(media.private) || bucket === privateBucket;
  return `<span class="secure-media" data-secure-media data-media-path="${esc(path)}" data-media-url="${esc(url)}" data-media-bucket="${esc(bucket)}" data-media-private="${String(isPrivate)}" data-media-type="${esc(media.type || "image")}" data-media-alt="${esc(media.alt || alt)}"></span>`;
}

async function hydrateSecureMedia(root = document) {
  const nodes = qsa("[data-secure-media]:not([data-secure-bound])", root || document);
  await Promise.all(nodes.map(async node => {
    node.dataset.secureBound = "true";
    const media = {
      path: node.dataset.mediaPath || "",
      url: node.dataset.mediaUrl || "",
      bucket: node.dataset.mediaBucket || publicBucket,
      private: node.dataset.mediaPrivate === "true",
      type: node.dataset.mediaType || "image",
      alt: node.dataset.mediaAlt || "Media preview"
    };
    try {
      const src = await getMediaUrl(media, { expiresIn: 900 });
      if (!src) return;
      node.innerHTML = media.type === "video"
        ? `<video src="${esc(src)}" muted playsinline preload="metadata"></video>`
        : `<img src="${esc(src)}" alt="${esc(media.alt)}">`;
    } catch (error) {
      node.innerHTML = `<span class="media-error">Preview locked</span>`;
    }
  }));
}
const isMissingColumnError = (error, column) => {
  const message = String(error?.message || "");
  return error?.code === "PGRST204" || message.includes(`Could not find the '${column}' column`) || message.includes(`'${column}' column`);
};

function initAmbientBackground() {
  if (!qs(".admin-bg-video") || qs(".admin-bg-canvas")) return;
  const canvas = document.createElement("canvas");
  canvas.className = "admin-bg-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);

  const ctx = canvas.getContext("2d");
  const palette = ["0,210,106", "37,183,232", "255,176,32", "242,246,248"];
  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let stars = [];
  let sparks = [];
  let flows = [];
  let frame = null;

  const rand = (min, max) => min + Math.random() * (max - min);
  const makeStar = () => ({
    x: rand(0, width),
    y: rand(0, height),
    r: rand(.45, 1.75),
    speed: rand(.05, .22),
    drift: rand(-.08, .08),
    phase: rand(0, Math.PI * 2),
    alpha: rand(.28, .82)
  });
  const makeSpark = (top = false) => ({
    x: rand(-80, width + 80),
    y: top ? rand(-height, 0) : rand(-60, height),
    vx: rand(-.32, .18),
    vy: rand(.85, 2.1),
    len: rand(28, 76),
    color: palette[Math.floor(rand(0, palette.length - .001))],
    alpha: rand(.18, .48)
  });
  const makeFlow = index => ({
    offset: rand(0, Math.PI * 2),
    speed: rand(.00016, .00034),
    y: (index + 1) / 7,
    color: palette[index % 3],
    alpha: rand(.08, .18)
  });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.min(160, Math.max(70, Math.floor((width * height) / 14000))) }, makeStar);
    sparks = Array.from({ length: Math.min(42, Math.max(18, Math.floor(width / 34))) }, () => makeSpark(true));
    flows = Array.from({ length: 6 }, (_, index) => makeFlow(index));
  }

  function draw(now = 0) {
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";

    for (const star of stars) {
      const glow = star.alpha + Math.sin(now * .002 + star.phase) * .22;
      ctx.beginPath();
      ctx.fillStyle = `rgba(242,246,248,${Math.max(.08, glow)})`;
      ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx.fill();
      star.y += star.speed;
      star.x += star.drift;
      if (star.y > height + 6 || star.x < -8 || star.x > width + 8) Object.assign(star, makeStar(), { y: -4 });
    }

    for (const spark of sparks) {
      const gradient = ctx.createLinearGradient(spark.x, spark.y, spark.x - spark.vx * spark.len, spark.y - spark.len);
      gradient.addColorStop(0, `rgba(${spark.color},${spark.alpha})`);
      gradient.addColorStop(1, `rgba(${spark.color},0)`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      ctx.moveTo(spark.x, spark.y);
      ctx.lineTo(spark.x - spark.vx * spark.len, spark.y - spark.len);
      ctx.stroke();
      spark.x += spark.vx;
      spark.y += spark.vy;
      if (spark.y > height + spark.len || spark.x < -120 || spark.x > width + 120) Object.assign(spark, makeSpark(true));
    }

    for (const flow of flows) {
      const y = height * flow.y + Math.sin(now * flow.speed + flow.offset) * 52;
      ctx.strokeStyle = `rgba(${flow.color},${flow.alpha})`;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-80, y);
      ctx.bezierCurveTo(width * .22, y - 110, width * .42, y + 120, width * .68, y - 22);
      ctx.bezierCurveTo(width * .82, y - 96, width + 40, y + 88, width + 100, y - 10);
      ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
    if (!prefersReduced) frame = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && frame) cancelAnimationFrame(frame);
    if (!document.hidden && !prefersReduced) frame = requestAnimationFrame(draw);
  });
  draw();
}

document.addEventListener("DOMContentLoaded", async () => {
  initAmbientBackground();
  window.lucide?.createIcons();
  if (isLogin) initLogin();
  if (isDashboard) await initDashboard();
});

function toast(message) {
  const el = qs("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), 3400);
}

function loading(show) {
  qs("#loading")?.classList.toggle("show", Boolean(show));
}

function configuredOrExplain(statusEl) {
  if (isSupabaseConfigured) return true;
  statusEl.textContent = "Add Supabase URL and publishable key in js/config.js before using secure admin login.";
  return false;
}

async function initLogin() {
  const form = qs("#loginForm");
  const status = qs("#loginStatus");
  if (!configuredOrExplain(status)) return;

  const { data } = await supabase.auth.getSession();
  if (data.session) location.replace("index.html");

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const blockedUntil = Number(localStorage.getItem("sbg_auth_blocked_until") || 0);
    if (Date.now() < blockedUntil) {
      status.textContent = "Too many attempts. Try again in a minute.";
      return;
    }
    const attempts = Number(localStorage.getItem("sbg_auth_attempts") || 0);
    const values = Object.fromEntries(new FormData(form).entries());
    status.textContent = "Checking credentials...";
    const { error } = await supabase.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
    if (error) {
      const next = attempts + 1;
      localStorage.setItem("sbg_auth_attempts", String(next));
      if (next >= 5) {
        localStorage.setItem("sbg_auth_blocked_until", String(Date.now() + 60000));
        localStorage.setItem("sbg_auth_attempts", "0");
      }
      status.textContent = "Invalid login or account is not allowed.";
      return;
    }
    localStorage.removeItem("sbg_auth_attempts");
    localStorage.removeItem("sbg_auth_blocked_until");
    location.replace("index.html");
  });
}

async function initDashboard() {
  if (!isSupabaseConfigured) {
    alert("Configure Supabase in js/config.js before opening the admin dashboard.");
    location.replace("login.html");
    return;
  }
  loading(true);
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    location.replace("login.html");
    return;
  }
  currentUser = sessionData.session.user;
  qs("#adminEmail").textContent = currentUser.email || "Admin";

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", currentUser.id)
    .single();
  currentUserRole = profile?.role || "";
  if (error || !canUseAdmin(currentUserRole)) {
    console.error("Admin authorization failed", { error, profile, userId: currentUser.id, email: currentUser.email });
    await supabase.auth.signOut();
    alert(error ? `Admin authorization check failed: ${error.message}` : "This account is not authorized for the admin dashboard.");
    location.replace("login.html");
    return;
  }
  document.body.dataset.userRole = currentUserRole;

  bindDashboardUi();
  await Promise.all([loadProductions(), loadInquiries(), loadServices(), loadReviews()]);
  registerRealtime();
  loading(false);
}

function bindDashboardUi() {
  qsa(".side-nav button").forEach(button => button.addEventListener("click", () => showSection(button.dataset.section)));
  qsa("[data-jump]").forEach(button => button.addEventListener("click", () => showSection(button.dataset.jump)));
  qs("#adminMenu")?.addEventListener("click", () => qs("#sidebar")?.classList.toggle("open"));
  qs("#logoutBtn")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.replace("login.html");
  });
  qs("#refreshInquiries")?.addEventListener("click", loadInquiries);
  qs("#refreshReviews")?.addEventListener("click", loadReviews);
  qs("#adminSearch")?.addEventListener("input", renderAdminGallery);
  qsa("#recordFilters select, #recordFilters input").forEach(input => input.addEventListener("input", renderAdminGallery));
  qs("#clearFilters")?.addEventListener("click", clearRecordFilters);
  bindConditionalFields();
  bindLightbox();
  bindMediaUpload();
  bindUploadActions();
  bindMarketingVisibility();
  qsa("[data-entry-mode]").forEach(form => {
    form.addEventListener("submit", saveProduction);
    form.addEventListener("reset", () => {
      resetMedia(form);
      setTimeout(() => {
        syncOtherFields(form);
        setDefaultDate(form);
        if (form.elements.quantity) form.elements.quantity.value = "1";
      }, 0);
    });
    setDefaultDate(form);
    if (form.elements.quantity) form.elements.quantity.value = "1";
    syncOtherFields(form);
  });
  qs("#serviceForm")?.addEventListener("submit", saveService);
  applyRoleAccess();
}

function applyRoleAccess() {
  if (isFullAdmin()) return;
  qs("#serviceForm")?.setAttribute("hidden", "");
  qsa('[data-jump="production"] small').forEach(element => { element.textContent = "Search, filter, and preview production records."; });
}

function bindMarketingVisibility() {
  qsa("#marketingForm, #customisedForm").forEach(form => {
    const publicInput = form?.elements?.is_public;
    const featuredInput = form?.elements?.featured;
    if (!publicInput || !featuredInput) return;
    featuredInput.addEventListener("change", () => {
      if (featuredInput.checked) publicInput.checked = true;
    });
    publicInput.addEventListener("change", () => {
      if (!publicInput.checked) featuredInput.checked = false;
    });
  });
}

function showSection(name) {
  qsa(".admin-section").forEach(section => section.classList.toggle("active", section.id === `section-${name}`));
  qsa(".side-nav button").forEach(button => button.classList.toggle("active", button.dataset.section === name));
  qs("#pageTitle").textContent = ({
    dashboard: "Dashboard",
    production: "Production Records",
    daily: "Daily Track Record",
    marketing: "Marketing Upload",
    customised: "Customised Designs",
    services: "Marketing Showcase",
    inquiries: "Inquiries",
    reviews: "Reviews"
  })[name] || "Dashboard";
  qs("#sidebar")?.classList.remove("open");
}

async function loadProductions() {
  const { data, error } = await supabase.from("productions").select("*").order("created_at", { ascending: false });
  if (error) return toast(error.message);
  productions = data || [];
  renderFilterOptions();
  renderDashboard();
  renderAdminGallery();
  if (inquiries.length) renderInquiries();
  repairPublicMediaRecords();
}

async function repairPublicMediaRecords() {
  if (!isFullAdmin() || publicMediaRepairRunning) return;
  const targets = productions.filter(item => item.is_public && hasPrivateMedia(item));
  if (!targets.length) return;
  publicMediaRepairRunning = true;
  let repaired = 0;
  try {
    for (const item of targets) {
      const media = await ensurePublicMedia(item.media || []);
      const { error } = await supabase.from("productions").update({ media }).eq("id", item.id);
      if (error) throw error;
      repaired += 1;
    }
    if (repaired) {
      toast(`${repaired} public production media ${repaired === 1 ? "record was" : "records were"} repaired.`);
      await loadProductions();
    }
  } catch (error) {
    toast(`Public media repair failed: ${error.message || error}`);
  } finally {
    publicMediaRepairRunning = false;
  }
}

async function loadInquiries() {
  const { data, error } = await supabase.from("inquiries").select("*").order("created_at", { ascending: false });
  if (error) return toast(error.message);
  inquiries = data || [];
  renderInquiries();
}

async function loadServices() {
  const { data, error } = await supabase.from("service_notes").select("*").order("created_at", { ascending: false });
  if (error) return;
  services = data || [];
  renderServices();
}

async function loadReviews() {
  const { data, error } = await supabase
    .from("production_reviews")
    .select("id,product_slug,rating,reviewer_name,comment,approved,created_at,reviewed_at")
    .order("created_at", { ascending: false });
  if (error) return toast(error.message);
  reviews = data || [];
  renderReviews();
}

function registerRealtime() {
  supabase.channel("admin-live-feed")
    .on("postgres_changes", { event: "*", schema: "public", table: "productions" }, loadProductions)
    .on("postgres_changes", { event: "*", schema: "public", table: "inquiries" }, loadInquiries)
    .on("postgres_changes", { event: "*", schema: "public", table: "service_notes" }, loadServices)
    .on("postgres_changes", { event: "*", schema: "public", table: "production_reviews" }, loadReviews)
    .subscribe();
}

function renderDashboard() {
  const completed = productions.filter(p => p.status === "Completed").length;
  const active = productions.filter(p => p.status === "In Progress").length;
  const publicCount = productions.filter(p => p.is_public).length;
  const pendingReviews = reviews.filter(review => !review.approved).length;
  const rate = productions.length ? Math.round((completed / productions.length) * 100) : 0;
  qs("#dashboardSummary").textContent = `${productions.length} production records, ${active} active, ${completed} completed, ${inquiries.length} inquiries, and ${pendingReviews} reviews waiting in the system.`;
  qs("#completionRate").textContent = `${rate}%`;
  qs("#completionRing").style.setProperty("--meter", `${rate}%`);
  qs("#adminStats").innerHTML = [
    ["Records", productions.length],
    ["Active", active],
    ["Public", publicCount],
    ["Inquiries", inquiries.length],
    ["Pending Reviews", pendingReviews]
  ].map(([label, value]) => `<div class="stat-card"><strong>${value}</strong><span>${label}</span></div>`).join("");
  qs("#recentRows").innerHTML = productions.slice(0, 10).map(row => `
    <tr>
      <td>${previewButton(row, "table-thumb")}</td>
      <td>${esc(row.title)}</td>
      <td>${esc(row.category)}</td>
      <td>${formatQuantity(productionQuantity(row))}</td>
      <td><span class="status-pill ${statusClass(row.status)}">${esc(row.status)}</span></td>
      <td>${formatDate(row.production_date)}</td>
      <td>${row.is_public ? "Yes" : "No"}</td>
    </tr>
  `).join("") || `<tr><td colspan="7">No production entries yet.</td></tr>`;
  bindPreviewButtons();
  hydrateSecureMedia();
  window.lucide?.createIcons();
}

function renderAdminGallery() {
  const term = qs("#adminSearch")?.value?.toLowerCase?.() || "";
  const filters = getRecordFilters();
  const items = productions.filter(item => {
    const blob = [item.title, item.category, item.material, item.thickness, productionQuantity(item), item.customer_name, item.status, item.description, ...(item.tags || [])].join(" ").toLowerCase();
    const itemDate = item.production_date || "";
    const hasMedia = (item.media || []).length > 0;
    return (!term || blob.includes(term))
      && (filters.category === "all" || item.category === filters.category)
      && (filters.status === "all" || item.status === filters.status)
      && (filters.visibility === "all" || (filters.visibility === "public" ? item.is_public : !item.is_public))
      && (filters.media === "all" || (filters.media === "with" ? hasMedia : !hasMedia))
      && (!filters.from || itemDate >= filters.from)
      && (!filters.to || itemDate <= filters.to);
  });
  qs("#adminGallery").innerHTML = items.map(item => {
    const mediaCount = (item.media || []).length;
    return `<tr>
      <td>${previewButton(item, "table-thumb")}${mediaCount > 1 ? `<em class="media-count-badge">${mediaCount}</em>` : ""}</td>
      <td><strong>${esc(item.title)}</strong>${item.customer_name ? `<br><small>${esc(item.customer_name)}</small>` : ""}</td>
      <td>${esc(item.category)}</td>
      <td>${esc(item.material || "—")}</td>
      <td>${formatQuantity(productionQuantity(item))}</td>
      <td><span class="status-pill ${statusClass(item.status)}">${esc(item.status)}</span></td>
      <td>${formatDate(item.production_date)}</td>
      <td>${item.is_public ? "Yes" : "No"}</td>
      <td>
        ${isFullAdmin() ? `<div class="entry-actions">
          <button class="btn btn-small btn-outline" data-edit="${item.id}"><i data-lucide="pencil"></i> Edit</button>
          <button class="btn btn-small btn-outline" data-toggle="${item.id}"><i data-lucide="${item.is_public ? "eye-off" : "eye"}"></i> ${item.is_public ? "Hide" : "Show"}</button>
          <button class="btn btn-small btn-outline danger" data-delete="${item.id}"><i data-lucide="trash-2"></i> Delete</button>
        </div>` : `<span class="readonly-note">View only</span>`}
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="9">No entries found.</td></tr>`;
  qsa("[data-edit]").forEach(btn => btn.addEventListener("click", () => editProduction(btn.dataset.edit)));
  qsa("[data-toggle]").forEach(btn => btn.addEventListener("click", () => togglePublic(btn.dataset.toggle)));
  qsa("[data-delete]").forEach(btn => btn.addEventListener("click", () => deleteProduction(btn.dataset.delete)));
  bindPreviewButtons();
  hydrateSecureMedia();
  window.lucide?.createIcons();
}

function bindMediaUpload() {
  qsa("[data-media-zone]").forEach(zone => {
    const form = zone.closest("form");
    const input = qs("[data-media-input]", zone);
    qs("[data-pick-media]", zone)?.addEventListener("click", () => input.click());
    input?.addEventListener("change", event => selectFiles(event.target.files, form));
    ["dragover", "dragleave", "drop"].forEach(type => zone.addEventListener(type, event => {
      event.preventDefault();
      zone.classList.toggle("drag-over", type === "dragover");
      if (type === "drop") selectFiles(event.dataTransfer.files, form);
    }));
  });
}

function bindUploadActions() {
  qsa("[data-clear-media]").forEach(button => {
    button.addEventListener("click", () => clearSelectedMedia(button.closest("form")));
  });
  qsa("[data-remove-current]").forEach(button => {
    button.addEventListener("click", () => removeCurrentProduction(button.closest("form"), button));
  });
}

function selectFiles(fileList, form) {
  if (mediaForm !== form) uploadedMedia = [];
  mediaForm = form;
  selectedMedia = [...fileList].filter(file => {
    if (!allowedTypes.has(file.type)) {
      toast(`${file.name} rejected: unsupported file type.`);
      return false;
    }
    if (file.size > maxBytes) {
      toast(`${file.name} rejected: file is larger than ${cfg.maxUploadMb || 20} MB.`);
      return false;
    }
    return true;
  }).slice(0, 20);
  renderSelectedMedia(form);
}

function renderSelectedMedia(form) {
  const preview = qs("[data-media-preview]", form);
  if (!preview) return;
  preview.innerHTML = selectedMedia.map(file => {
    const url = URL.createObjectURL(file);
    return file.type.startsWith("video/")
      ? `<video src="${url}" muted playsinline></video>`
      : `<img src="${url}" alt="${esc(file.name)}">`;
  }).join("");
}

async function uploadSelectedMedia(form) {
  if (!selectedMedia.length) return [];
  const progress = qs("[data-upload-progress]", form);
  const output = [];
  const isPrivate = form?.dataset.entryMode === "daily";
  const bucket = isPrivate ? privateBucket : publicBucket;
  for (let index = 0; index < selectedMedia.length; index += 1) {
    const file = selectedMedia[index];
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/-+/g, "-").slice(0, 90);
    const path = `${currentUser.id}/${Date.now()}-${index}-${safeName}`;
    progress.style.width = `${Math.round((index / selectedMedia.length) * 85)}%`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
    if (error) throw error;
    output.push({ path, bucket, private: isPrivate, type: file.type.startsWith("video/") ? "video" : "image", alt: file.name, size: file.size });
  }
  progress.style.width = "100%";
  return output;
}

async function persistProduction(payload, id) {
  if (id && !isFullAdmin()) throw new Error("Standard users can upload new productions only.");
  const save = data => id
    ? supabase.from("productions").update(data).eq("id", id)
    : supabase.from("productions").insert(data);
  let { error } = await save(payload);
  if (!error) return { usedQuantityFallback: false };

  if (isMissingColumnError(error, "quantity")) {
    const fallbackPayload = { ...payload, tags: withQuantityTag(payload.tags, payload.quantity) };
    delete fallbackPayload.quantity;
    const retry = await save(fallbackPayload);
    if (!retry.error) return { usedQuantityFallback: true };
    error = retry.error;
  }
  throw error;
}

async function saveProduction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const isMarketing = form.dataset.entryMode === "marketing";
  const isCustomised = form.dataset.entryMode === "customised";
  const statusId = isCustomised ? "#customisedStatus" : (isMarketing ? "#marketingStatus" : "#dailyStatus");
  const status = qs(statusId);
  const values = Object.fromEntries(new FormData(form).entries());
  status.textContent = "Saving entry...";
  loading(true);
  try {
    const existing = productions.find(item => item.id === values.id);
    const hasNewMedia = mediaForm === form && selectedMedia.length;
    const baseMedia = values.id ? (mediaForm === form ? uploadedMedia : (existing?.media || [])) : [];
    let media = hasNewMedia ? [...baseMedia, ...await uploadSelectedMedia(form)] : baseMedia;
    const material = values.material === "Others" ? values.material_other.trim() : values.material;
    const thickness = values.thickness === "Others" ? values.thickness_other.trim() : values.thickness;
    const quantity = Math.max(1, Number.parseInt(values.quantity, 10) || 1);
    const isPublic = (isMarketing || isCustomised) ? values.is_public === "on" || values.featured === "on" : false;
    const rawTags = values.tags ? stripQuantityTags(values.tags.split(",").map(tag => tag.trim()).filter(Boolean)) : [];
    const designType = String(values.design_type || "").trim();
    const tags = isCustomised
      ? [...new Set(["customised-design", "custom-design", designType, ...rawTags].filter(Boolean))].slice(0, 12)
      : rawTags.slice(0, 12);
    if (isPublic && media.some(isPrivateMedia)) {
      status.textContent = "Preparing public media...";
      media = await ensurePublicMedia(media);
    }
    const payload = {
      title: values.title.trim(),
      customer_name: values.customer_name.trim(),
      category: values.category.trim(),
      material,
      thickness,
      quantity,
      status: values.status,
      production_date: values.production_date,
      description: values.description.trim(),
      tags,
      is_public: isPublic,
      featured: (isMarketing || isCustomised) ? values.featured === "on" : false,
      media: media.length ? media : (existing?.media || [])
    };
    const { usedQuantityFallback } = await persistProduction(payload, values.id);
    form.reset();
    resetMedia(form);
    syncOtherFields(form);
    setDefaultDate(form);
    if (form.elements.quantity) form.elements.quantity.value = "1";
    const successMsg = usedQuantityFallback ? "Entry saved. Run the quantity database migration to store quantity as a real column." : isCustomised ? "Customised design published to the gallery." : isMarketing ? "Marketing entry published." : "Daily record saved with media.";
    const toastMsg = usedQuantityFallback ? "Saved with quantity fallback because the database column is missing." : isCustomised ? "Customised design synced to the public gallery." : isMarketing ? "Marketing entry synced to the public website." : "Daily production record saved privately.";
    status.textContent = successMsg;
    toast(toastMsg);
    showSection("production");
    await loadProductions();
  } catch (error) {
    status.textContent = error.message;
  } finally {
    loading(false);
  }
}

function editProduction(id) {
  if (!isFullAdmin()) return toast("Standard users can upload new productions only.");
  const item = productions.find(row => row.id === id);
  if (!item) return;
  const isCustomised = item.category === "Customised Designs";
  const section = isCustomised ? "customised" : (item.is_public ? "marketing" : "daily");
  const formId = isCustomised ? "#customisedForm" : (item.is_public ? "#marketingForm" : "#dailyForm");
  showSection(section);
  const form = qs(formId);
  ["id", "title", "customer_name", "status", "production_date", "description"].forEach(name => { form.elements[name].value = item[name] || ""; });
  if (form.elements.category) form.elements.category.value = item.category || "";
  if (form.elements.design_type) {
    const designTypeOptions = ["Custom Fabrication","Custom Rack","Custom Bracket","Custom Panel","Custom Enclosure","Others"];
    form.elements.design_type.value = item.design_type || item.tags?.find(t => designTypeOptions.includes(t)) || "Custom Fabrication";
  }
  if (form.elements.quantity) form.elements.quantity.value = productionQuantity(item);
  setSelectOrOther(form.elements.material, item.material, form.elements.material_other);
  setSelectOrOther(form.elements.thickness, item.thickness, form.elements.thickness_other);
  const internalTags = ["customised-design", "custom-design"];
  form.elements.tags.value = stripQuantityTags(item.tags || []).filter(t => !internalTags.includes(t)).join(", ");
  if (form.elements.is_public?.type === "checkbox") form.elements.is_public.checked = Boolean(item.is_public);
  if (form.elements.featured?.type === "checkbox") form.elements.featured.checked = Boolean(item.featured);
  uploadedMedia = item.media || [];
  selectedMedia = [];
  mediaForm = form;
  renderUploadedMedia(form, item);
  syncOtherFields(form);
}

async function togglePublic(id) {
  if (!isFullAdmin()) return toast("Standard users cannot edit production records.");
  const item = productions.find(row => row.id === id);
  if (!item) return;
  const nextPublic = !item.is_public;
  let media = item.media || [];
  if (nextPublic && media.some(isPrivateMedia)) {
    toast("Preparing media for the public gallery...");
    try {
      media = await ensurePublicMedia(media);
    } catch (error) {
      return toast(`Could not make media public: ${error.message || error}`);
    }
  }
  const { error } = await supabase.from("productions").update({ is_public: nextPublic, media }).eq("id", id);
  if (error) return toast(error.message);
  await loadProductions();
}

async function deleteProduction(id) {
  if (!isFullAdmin()) return toast("Standard users cannot delete production records.");
  if (!confirm("Delete this production entry?")) return;
  const { error } = await supabase.from("productions").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Production entry deleted.");
  await loadProductions();
}

function formStatus(form) {
  return qs(".form-status", form) || qs(`#${form?.dataset?.entryMode || ""}Status`);
}

function setFormStatus(form, message) {
  const status = formStatus(form);
  if (status) status.textContent = message;
}

function clearSelectedMedia(form) {
  if (!form) return;
  if (mediaForm === form) selectedMedia = [];
  qsa("[data-media-input]", form).forEach(input => { input.value = ""; });
  qsa("[data-upload-progress]", form).forEach(progress => { progress.style.width = "0%"; });
  if (mediaForm === form && uploadedMedia.length) {
    renderUploadedMedia(form, { title: form.elements.title?.value || "Production media" });
  } else {
    qsa("[data-media-preview]", form).forEach(preview => { preview.innerHTML = ""; });
  }
  setFormStatus(form, uploadedMedia.length && mediaForm === form ? "New media selection removed. Saved media will stay attached." : "Media selection removed.");
}

async function removeCurrentProduction(form, button) {
  if (!form) return;
  if (!isFullAdmin()) return toast("Standard users cannot delete production records.");
  const id = form.elements.id?.value;
  if (!id) {
    form.reset();
    resetMedia(form);
    syncOtherFields(form);
    setDefaultDate(form);
    if (form.elements.quantity) form.elements.quantity.value = "1";
    setFormStatus(form, "Ready to add a new entry.");
    return;
  }
  if (!confirm("Delete this production entry?")) return;
  button.disabled = true;
  setFormStatus(form, "Deleting entry...");
  const { error } = await supabase.from("productions").delete().eq("id", id);
  button.disabled = false;
  if (error) {
    setFormStatus(form, error.message);
    return toast(error.message);
  }
  form.reset();
  resetMedia(form);
  syncOtherFields(form);
  setDefaultDate(form);
  if (form.elements.quantity) form.elements.quantity.value = "1";
  setFormStatus(form, "Entry deleted.");
  toast("Production entry deleted.");
  showSection("production");
  await loadProductions();
}

function resetMedia(form) {
  if (!form || mediaForm === form) {
    selectedMedia = [];
    uploadedMedia = [];
    mediaForm = null;
  }
  qsa(form ? "[data-media-preview]" : "[data-media-preview]", form || document).forEach(preview => { preview.innerHTML = ""; });
  qsa(form ? "[data-upload-progress]" : "[data-upload-progress]", form || document).forEach(progress => { progress.style.width = "0%"; });
  qsa(form ? "[data-media-input]" : "[data-media-input]", form || document).forEach(input => { input.value = ""; });
}

function renderUploadedMedia(form, item) {
  const preview = qs("[data-media-preview]", form);
  if (!preview) return;
  preview.innerHTML = uploadedMedia.map(media => secureMediaElement(media, media.alt || item.title)).join("");
  hydrateSecureMedia(preview);
}

function renderFilterOptions() {
  const category = qs("#filterCategory");
  const status = qs("#filterStatus");
  if (!category || !status) return;
  const currentCategory = category.value || "all";
  const currentStatus = status.value || "all";
  category.innerHTML = `<option value="all">All categories</option>${uniqueOptions(productions.map(item => item.category)).map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
  status.innerHTML = `<option value="all">All status</option>${uniqueOptions(productions.map(item => item.status)).map(value => `<option value="${esc(value)}">${esc(value)}</option>`).join("")}`;
  category.value = [...category.options].some(option => option.value === currentCategory) ? currentCategory : "all";
  status.value = [...status.options].some(option => option.value === currentStatus) ? currentStatus : "all";
}

function uniqueOptions(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getRecordFilters() {
  return {
    category: qs("#filterCategory")?.value || "all",
    status: qs("#filterStatus")?.value || "all",
    visibility: qs("#filterVisibility")?.value || "all",
    media: qs("#filterMedia")?.value || "all",
    from: qs("#filterFrom")?.value || "",
    to: qs("#filterTo")?.value || ""
  };
}

function clearRecordFilters() {
  qsa("#recordFilters select").forEach(select => { select.value = "all"; });
  qsa("#recordFilters input").forEach(input => { input.value = ""; });
  if (qs("#adminSearch")) qs("#adminSearch").value = "";
  renderAdminGallery();
}

function bindConditionalFields() {
  qsa("[data-other-toggle]").forEach(select => {
    select.addEventListener("change", () => syncOtherFields(select.form));
  });
}

function syncOtherFields(form = document) {
  qsa("[data-other-toggle]", form).forEach(select => {
    const field = qs(`[data-other-field="${select.dataset.otherToggle}"]`, form);
    const input = field?.querySelector("input");
    const show = select.value === "Others";
    field?.classList.toggle("show", show);
    if (input) {
      input.required = show;
      if (!show) input.value = "";
    }
  });
}

function setDefaultDate(form) {
  if (form?.elements?.production_date && !form.elements.production_date.value) {
    form.elements.production_date.value = new Date().toISOString().slice(0, 10);
  }
}

function setSelectOrOther(select, value, otherInput) {
  const values = [...select.options].map(option => option.value);
  if (values.includes(value)) {
    select.value = value;
    otherInput.value = "";
    return;
  }
  select.value = "Others";
  otherInput.value = value || "";
}

function previewButton(item, className = "") {
  const media = (item.media || [])[0] || {};
  if (!media.path && !media.url) return `<span class="table-thumb empty"><i data-lucide="image-off"></i></span>`;
  return `<button class="${className}" type="button" data-preview-media="${item.id}" aria-label="Open preview for ${esc(item.title)}">${secureMediaElement(media, item.title)}<i data-lucide="maximize-2"></i></button>`;
}

function bindPreviewButtons() {
  qsa("[data-preview-media]").forEach(button => {
    if (button.dataset.previewBound) return;
    button.dataset.previewBound = "true";
    button.addEventListener("click", () => openMediaPreview(button.dataset.previewMedia));
  });
}

function bindLightbox() {
  qs("#lightboxClose")?.addEventListener("click", closeMediaPreview);
  qs("#lightboxPrev")?.addEventListener("click", () => showLightboxItem(lightboxIndex - 1));
  qs("#lightboxNext")?.addEventListener("click", () => showLightboxItem(lightboxIndex + 1));
  qs("#mediaLightbox")?.addEventListener("click", event => {
    if (event.target.id === "mediaLightbox") closeMediaPreview();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMediaPreview();
    if (qs("#mediaLightbox")?.classList.contains("show") && event.key === "ArrowLeft") showLightboxItem(lightboxIndex - 1);
    if (qs("#mediaLightbox")?.classList.contains("show") && event.key === "ArrowRight") showLightboxItem(lightboxIndex + 1);
  });
}

async function openMediaPreview(id) {
  const item = productions.find(row => row.id === id);
  const mediaList = (item?.media || []).filter(media => media?.path || media?.url);
  if (!item || !mediaList.length) return toast("No media preview available for this record.");
  lightboxItems = mediaList.map(media => ({ media, title: item.title }));
  lightboxIndex = 0;
  qs("#mediaLightbox").classList.add("show");
  qs("#mediaLightbox").setAttribute("aria-hidden", "false");
  await showLightboxItem(0);
}

async function showLightboxItem(index) {
  if (!lightboxItems.length) return;
  lightboxIndex = (index + lightboxItems.length) % lightboxItems.length;
  const { media, title } = lightboxItems[lightboxIndex];
  const stage = qs("#lightboxStage");
  stage.innerHTML = `<div class="lightbox-loading">Loading media...</div>`;
  try {
    const src = await getMediaUrl(media, { expiresIn: 900 });
    if (!src) throw new Error("No media URL was available.");
    const content = media.type === "video"
      ? `<video src="${esc(src)}" controls autoplay playsinline></video>`
      : `<img src="${esc(src)}" alt="${esc(media.alt || title)}">`;
    stage.innerHTML = `<figure>${content}<figcaption>${esc(title)}${lightboxItems.length > 1 ? ` <span>${lightboxIndex + 1} of ${lightboxItems.length}</span>` : ""}</figcaption></figure>`;
    qs("img, video", stage)?.addEventListener("error", () => {
      stage.innerHTML = `<div class="lightbox-error"><strong>Media could not load.</strong><span>Check the storage bucket access or re-upload this production media.</span></div>`;
    }, { once: true });
    qsa("[data-lightbox-nav]").forEach(button => { button.hidden = lightboxItems.length < 2; });
  } catch (error) {
    stage.innerHTML = `<div class="lightbox-error"><strong>Media preview unavailable.</strong><span>${esc(error.message || "Check the storage bucket access.")}</span></div>`;
    qsa("[data-lightbox-nav]").forEach(button => { button.hidden = true; });
    toast("Media preview unavailable. Check bucket access or re-upload the media.");
  }
}

function closeMediaPreview() {
  const lightbox = qs("#mediaLightbox");
  if (!lightbox?.classList.contains("show")) return;
  lightbox.classList.remove("show");
  lightbox.setAttribute("aria-hidden", "true");
  qs("#lightboxStage").innerHTML = "";
  lightboxItems = [];
  lightboxIndex = 0;
}

async function saveService(event) {
  event.preventDefault();
  if (!isFullAdmin()) return toast("Standard users cannot edit showcase notes.");
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  const { error } = await supabase.from("service_notes").insert(payload);
  if (error) return toast(error.message);
  event.currentTarget.reset();
  await loadServices();
}

async function deleteService(id) {
  if (!isFullAdmin()) return toast("Standard users cannot delete showcase notes.");
  if (!confirm("Delete this marketing showcase note?")) return;
  const { error } = await supabase.from("service_notes").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Marketing showcase note deleted.");
  await loadServices();
}

function renderServices() {
  qs("#serviceList").innerHTML = services.map(item => {
    const related = productions.find(row => row.category === item.category && (row.media || []).length) || productions.find(row => row.is_public && (row.media || []).length);
    return `<tr>
      <td>${related ? previewButton(related, "table-thumb") : `<span class="table-thumb empty"><i data-lucide="image-off"></i></span>`}</td>
      <td><strong>${esc(item.title)}</strong></td>
      <td>${esc(item.category)}</td>
      <td>${esc(item.description)}</td>
      <td>${isFullAdmin() ? `<button class="btn btn-small btn-outline danger" data-delete-service="${item.id}"><i data-lucide="trash-2"></i> Delete</button>` : `<span class="readonly-note">View only</span>`}</td>
    </tr>`;
  }).join("") || `<tr><td colspan="5">No service notes yet.</td></tr>`;
  qsa("[data-delete-service]").forEach(btn => btn.addEventListener("click", () => deleteService(btn.dataset.deleteService)));
  bindPreviewButtons();
  hydrateSecureMedia();
  window.lucide?.createIcons();
}

function inquiryProductUrl(item) {
  const direct = String(item?.product_url || "").trim();
  if (direct) return direct;
  const match = String(item?.message || "").match(/Product URL:\s*(https?:\/\/\S+)/i);
  return match ? match[1] : "";
}

function inquiryProductSlug(item) {
  const url = inquiryProductUrl(item);
  if (!url) return "";
  try {
    const parsed = new URL(url, location.origin);
    const productPath = parsed.pathname.match(/\/products\/([^/?#]+)/i);
    if (productPath) return decodeURIComponent(productPath[1]);
    const productParam = parsed.searchParams.get("product");
    if (productParam) return productParam;
  } catch (error) {}
  return "";
}

function inquiryProduct(item) {
  const slug = inquiryProductSlug(item);
  const service = String(item?.service || "").trim().toLowerCase();
  return productions.find(product => slug && productReviewKey(product) === slug)
    || productions.find(product => service && String(product.title || "").trim().toLowerCase() === service)
    || null;
}

function inquiryMessage(item, isGalleryQuote) {
  const lines = String(item?.message || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line =>
      line &&
      !/^Product URL:/i.test(line) &&
      !/^Product Image:/i.test(line) &&
      !/^Contact details were not collected/i.test(line)
    );
  if (!isGalleryQuote) return lines.join(" ").slice(0, 260);
  const product = lines.find(line => /^Product:/i.test(line))?.replace(/^Product:\s*/i, "");
  const category = lines.find(line => /^Category:/i.test(line))?.replace(/^Category:\s*/i, "");
  const material = lines.find(line => /^Material:/i.test(line))?.replace(/^Material:\s*/i, "");
  const summary = [
    product ? `Quote requested for ${product}` : "Quote requested from production gallery",
    category ? `Category: ${category}` : "",
    material ? `Material: ${material}` : ""
  ].filter(Boolean).join(". ");
  return summary.slice(0, 260);
}

function renderInquiries() {
  qs("#inquiryRows").innerHTML = inquiries.map(item => {
    const isGalleryQuote = ["production-gallery", "gallery-quote-click", "quote-click"].includes(item.source);
    const sourceLabel = isGalleryQuote ? "Production Gallery" : "Contact Section";
    const productUrl = inquiryProductUrl(item);
    const product = inquiryProduct(item);
    const message = inquiryMessage(item, isGalleryQuote);
    const contactMeta = [
      item.company_name,
      isGalleryQuote ? "Phone not collected" : item.phone,
      item.email
    ].filter(Boolean).map(esc).join("<br>");

    const previewCell = product ? previewButton(product, "table-thumb") : `<span class="table-thumb empty"><i data-lucide="image-off"></i></span>`;
    const linkCell = productUrl
      ? `<a href="${esc(productUrl)}" target="_blank" rel="noopener noreferrer">Open Product</a>`
      : `<span class="readonly-note">-</span>`;

    return `
    <tr>
      <td>${previewCell}</td>
      <td><strong>${esc(item.contact_name)}</strong>${isGalleryQuote ? `<br><span class="status-pill queued">Product quote click</span>` : ""}${contactMeta ? `<br>${contactMeta}` : ""}</td>
      <td>${esc(sourceLabel)}</td>
      <td>${esc(item.service)}</td>
      <td>${linkCell}</td>
      <td>${esc(message)}</td>
      <td>${formatDate(item.created_at || item.updated_at)}</td>
      <td><span class="status-pill ${statusClass(item.status || "New")}">${esc(item.status || "New")}</span></td>
      <td>
        ${isFullAdmin() ? `<div class="inquiry-actions">
          <button class="btn btn-small btn-outline" data-inquiry="${item.id}"><i data-lucide="check"></i> Mark Contacted</button>
          <button class="btn btn-small btn-outline danger" data-delete-inquiry="${item.id}"><i data-lucide="trash-2"></i> Delete</button>
        </div>` : `<span class="readonly-note">View only</span>`}
      </td>
    </tr>
  `;
  }).join("") || `<tr><td colspan="9">No inquiries yet.</td></tr>`;
  qsa("[data-inquiry]").forEach(btn => btn.addEventListener("click", () => markInquiry(btn.dataset.inquiry)));
  qsa("[data-delete-inquiry]").forEach(btn => btn.addEventListener("click", () => deleteInquiry(btn.dataset.deleteInquiry)));
  bindPreviewButtons();
  hydrateSecureMedia();
  renderDashboard();
  window.lucide?.createIcons();
}

async function markInquiry(id) {
  if (!isFullAdmin()) return toast("Standard users cannot edit inquiries.");
  const { error } = await supabase.from("inquiries").update({ status: "Contacted" }).eq("id", id);
  if (error) return toast(error.message);
  await loadInquiries();
}

async function deleteInquiry(id) {
  if (!isFullAdmin()) return toast("Standard users cannot delete inquiries.");
  if (!confirm("Delete this inquiry?")) return;
  const { error } = await supabase.from("inquiries").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Inquiry deleted.");
  await loadInquiries();
}

function reviewProductName(review) {
  const product = productions.find(item => productReviewKey(item) === review.product_slug);
  return product?.title || review.product_slug;
}

function reviewProduct(review) {
  return productions.find(item => productReviewKey(item) === review.product_slug) || null;
}

function productLiveUrl(slug) {
  const value = String(slug || "").trim();
  if (!value) return "";
  if (location.protocol === "file:") return `${location.href.split(/[?#]/)[0].replace(/\/admin\/[^/]*$/i, "/index.html")}?product=${encodeURIComponent(value)}`;
  const path = location.pathname || "/";
  const adminIndex = path.toLowerCase().indexOf("/admin/");
  const base = adminIndex >= 0 ? path.slice(0, adminIndex) : path.replace(/\/(?:admin\/?)?$/i, "");
  const cleanBase = (base || "").replace(/\/$/, "");
  return `${location.origin}${cleanBase}/products/${encodeURIComponent(value)}`;
}

function reviewProductLink(review, product) {
  const slug = review.product_slug || (product ? productReviewKey(product) : "");
  const url = productLiveUrl(slug);
  if (!url) return "";
  return `<a class="review-product-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><i data-lucide="external-link"></i> Live product</a>`;
}

function reviewStars(value) {
  const rating = Math.max(1, Math.min(5, Number(value) || 0));
  return `${"★".repeat(rating)}${"☆".repeat(5 - rating)}`;
}

function renderReviews() {
  const rows = [...reviews].sort((a, b) => Number(a.approved) - Number(b.approved) || new Date(b.created_at) - new Date(a.created_at));
  const table = qs("#reviewRows");
  if (!table) return;
  table.innerHTML = rows.map(item => {
    const product = reviewProduct(item);
    return `
    <tr>
      <td>${product ? previewButton(product, "table-thumb") : `<span class="table-thumb empty"><i data-lucide="image-off"></i></span>`}</td>
      <td class="review-product-cell"><strong>${esc(product?.title || reviewProductName(item))}</strong><br><small>${esc(item.product_slug)}</small>${reviewProductLink(item, product)}</td>
      <td>${esc(item.reviewer_name)}<br><small>${formatDate(item.created_at)}</small></td>
      <td><span class="review-stars-admin">${reviewStars(item.rating)}</span></td>
      <td>${esc(item.comment)}</td>
      <td><span class="status-pill ${item.approved ? "completed" : "queued"}">${item.approved ? "Approved" : "Pending"}</span></td>
      <td>
        ${isFullAdmin() ? `<div class="review-actions">
          ${item.approved ? "" : `<button class="btn btn-small" data-approve-review="${item.id}"><i data-lucide="check"></i> Approve</button>`}
          <button class="btn btn-small btn-outline danger" data-delete-review="${item.id}"><i data-lucide="trash-2"></i> Delete</button>
        </div>` : `<span class="readonly-note">View only</span>`}
      </td>
    </tr>
  `;
  }).join("") || `<tr><td colspan="7">No customer reviews yet.</td></tr>`;
  bindPreviewButtons();
  hydrateSecureMedia();
  qsa("[data-approve-review]").forEach(btn => btn.addEventListener("click", () => approveReview(btn.dataset.approveReview)));
  qsa("[data-delete-review]").forEach(btn => btn.addEventListener("click", () => deleteReview(btn.dataset.deleteReview)));
  renderDashboard();
  window.lucide?.createIcons();
}

async function approveReview(id) {
  if (!isFullAdmin()) return toast("Standard users cannot edit reviews.");
  const { error } = await supabase
    .from("production_reviews")
    .update({ approved: true, reviewed_by: currentUser.id, reviewed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return toast(error.message);
  toast("Review approved for public display.");
  await loadReviews();
}

async function deleteReview(id) {
  if (!isFullAdmin()) return toast("Standard users cannot delete reviews.");
  if (!confirm("Delete this customer review?")) return;
  const { error } = await supabase.from("production_reviews").delete().eq("id", id);
  if (error) return toast(error.message);
  toast("Review deleted.");
  await loadReviews();
}

function statusClass(status = "") {
  return status.toLowerCase().replace(/\s+/g, "-");
}

function formatDate(value) {
  if (!value) return "Date TBC";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}




