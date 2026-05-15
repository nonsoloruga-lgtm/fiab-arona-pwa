const STORAGE_KEY = "fiab_arona_pwa_state_v1";

const clone = (value) => {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
};

const DEFAULT_STATE = {
  maps: [
    {
      title: "Mappa percorsi (esempio)",
      url: "https://www.openstreetmap.org",
      description: "Sostituisci con la tua mappa QGIS/qgis2web o un link utile.",
      embedUrl: ""
    }
  ],
  links: [
    { title: "FIAB Arona (sito)", url: "https://sites.google.com/view/fiab-arona/home", group: "FIAB" },
    { title: "FIAB (sito nazionale)", url: "https://www.fiabitalia.it", group: "FIAB" },
    { title: "Bicitalia", url: "https://www.bicitalia.org", group: "Ciclovie" },
    { title: "Albergabici", url: "https://www.albergabici.it/it/", group: "Ciclovie" }
  ],
  stations: []
};

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (err) {
    return { ok: false, error: err };
  }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return clone(DEFAULT_STATE);
  const parsed = safeJsonParse(raw);
  if (!parsed.ok || typeof parsed.value !== "object" || !parsed.value) return clone(DEFAULT_STATE);
  return {
    maps: Array.isArray(parsed.value.maps) ? parsed.value.maps : clone(DEFAULT_STATE.maps),
    links: Array.isArray(parsed.value.links) ? parsed.value.links : clone(DEFAULT_STATE.links),
    stations: Array.isArray(parsed.value.stations) ? parsed.value.stations : []
  };
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function $(sel) {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function normalizeUrl(url) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u}`;
}

function navTo(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("view--active"));
  $(`#view-${view}`).classList.add("view--active");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("tab--active", t.dataset.nav === view));
  window.scrollTo({ top: 0, behavior: "auto" });
}

function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function formatStationMeta(st) {
  const parts = [];
  if (st.area) parts.push(st.area);
  if (st.lat && st.lon) parts.push(`${st.lat}, ${st.lon}`);
  if (st.notes) parts.push(st.notes);
  return parts.join(" · ");
}

function isValidLatLon(lat, lon) {
  if (lat === "" || lon === "") return false;
  const la = Number(lat);
  const lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180;
}

function stationMapsLink(st) {
  if (st.url) return normalizeUrl(st.url);
  if (isValidLatLon(st.lat, st.lon)) return `https://www.google.com/maps?q=${encodeURIComponent(`${st.lat},${st.lon}`)}`;
  return "";
}

let state = loadState();

function renderMaps() {
  const list = $("#mapsList");
  list.innerHTML = "";
  const empty = $("#mapsEmpty");
  empty.classList.toggle("hidden", state.maps.length !== 0);

  state.maps.forEach((m, idx) => {
    const url = normalizeUrl(m.url);
    const embedUrl = normalizeUrl(m.embedUrl || "");
    const description = String(m.description || "").trim();
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="item__title">${escapeHtml(m.title || `Mappa ${idx + 1}`)}</div>
      <div class="item__meta">${escapeHtml([description, url].filter(Boolean).join(" · ") || "—")}</div>
      <div class="item__actions">
        ${url ? `<a class="btn btn--primary" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Apri</a>` : ""}
        ${embedUrl ? `<button class="btn" data-embed="${escapeHtml(embedUrl)}">Mostra qui</button>` : ""}
      </div>
      ${embedUrl ? `<div class="embed hidden" data-embedbox="${idx}"><iframe title="mappa" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe></div>` : ""}
    `;
    list.appendChild(item);

    const embedBtn = item.querySelector("button[data-embed]");
    if (embedBtn) {
      embedBtn.addEventListener("click", () => {
        const box = item.querySelector(`[data-embedbox="${idx}"]`);
        const iframe = box.querySelector("iframe");
        iframe.src = embedUrl;
        box.classList.toggle("hidden");
        embedBtn.textContent = box.classList.contains("hidden") ? "Mostra qui" : "Nascondi";
      });
    }
  });
}

function renderLinks() {
  const list = $("#linksList");
  list.innerHTML = "";
  const empty = $("#linksEmpty");
  empty.classList.toggle("hidden", state.links.length !== 0);

  const byGroup = new Map();
  state.links.forEach((l) => {
    const group = String(l.group || "Altro").trim() || "Altro";
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(l);
  });

  [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0], "it")).forEach(([group, links]) => {
    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `<div class="item__title">${escapeHtml(group)}</div>`;
    const actions = document.createElement("div");
    actions.className = "item__actions";
    links
      .slice()
      .sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "it"))
      .forEach((l) => {
        const a = document.createElement("a");
        a.className = "btn btn--primary";
        a.href = normalizeUrl(l.url);
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = l.title || l.url;
        actions.appendChild(a);
      });
    item.appendChild(actions);
    list.appendChild(item);
  });
}

function renderStations() {
  const list = $("#stationsList");
  list.innerHTML = "";
  const empty = $("#stationsEmpty");
  empty.classList.toggle("hidden", state.stations.length !== 0);

  state.stations.forEach((st, idx) => {
    const item = document.createElement("div");
    item.className = "item";
    const meta = formatStationMeta(st);
    const maps = stationMapsLink(st);
    item.innerHTML = `
      <div class="item__title">${escapeHtml(st.name || `Punto ${idx + 1}`)}</div>
      <div class="item__meta">${escapeHtml(meta || "—")}</div>
      <div class="item__actions">
        ${maps ? `<a class="btn btn--primary" href="${escapeHtml(maps)}" target="_blank" rel="noopener noreferrer">Apri mappa</a>` : ""}
        <button class="btn btn--danger" data-del="${idx}">Elimina</button>
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.del);
      if (!Number.isFinite(idx)) return;
      state.stations.splice(idx, 1);
      saveState(state);
      renderStations();
    });
  });
}

function refreshSettingsEditors() {
  $("#mapsJson").value = JSON.stringify(state.maps, null, 2);
  $("#linksJson").value = JSON.stringify(state.links, null, 2);
}

function initNav() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navTo(el.dataset.nav));
  });
}

function initStations() {
  $("#stationForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    if (!name) return;
    const st = {
      name,
      area: String(fd.get("area") || "").trim(),
      notes: String(fd.get("notes") || "").trim(),
      lat: String(fd.get("lat") || "").trim(),
      lon: String(fd.get("lon") || "").trim(),
      url: String(fd.get("url") || "").trim()
    };
    state.stations.unshift(st);
    saveState(state);
    e.currentTarget.reset();
    renderStations();
  });

  $("#btnStationsClear").addEventListener("click", () => {
    if (!confirm("Vuoi davvero svuotare la lista colonnine su questo dispositivo?")) return;
    state.stations = [];
    saveState(state);
    renderStations();
  });
}

function initSettings() {
  $("#btnSaveMaps").addEventListener("click", () => {
    const parsed = safeJsonParse($("#mapsJson").value);
    if (!parsed.ok || !Array.isArray(parsed.value)) return alert("JSON mappe non valido: deve essere un array.");
    state.maps = parsed.value;
    saveState(state);
    renderMaps();
    alert("Mappe salvate.");
  });

  $("#btnResetMaps").addEventListener("click", () => {
    state.maps = clone(DEFAULT_STATE.maps);
    saveState(state);
    renderMaps();
    refreshSettingsEditors();
  });

  $("#btnSaveLinks").addEventListener("click", () => {
    const parsed = safeJsonParse($("#linksJson").value);
    if (!parsed.ok || !Array.isArray(parsed.value)) return alert("JSON link non valido: deve essere un array.");
    state.links = parsed.value;
    saveState(state);
    renderLinks();
    alert("Link salvati.");
  });

  $("#btnResetLinks").addEventListener("click", () => {
    state.links = clone(DEFAULT_STATE.links);
    saveState(state);
    renderLinks();
    refreshSettingsEditors();
  });

  $("#btnDownloadBackup").addEventListener("click", () => {
    downloadJson("fiab-arona-backup.json", { version: 1, exportedAt: new Date().toISOString(), state });
  });

  $("#backupFile").addEventListener("change", async (e) => {
    const file = e.currentTarget.files && e.currentTarget.files[0];
    if (!file) return;
    const text = await file.text();
    const parsed = safeJsonParse(text);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object") return alert("File non valido.");
    const next = parsed.value.state || parsed.value;
    if (!next || typeof next !== "object") return alert("File non valido.");
    state = {
      maps: Array.isArray(next.maps) ? next.maps : clone(DEFAULT_STATE.maps),
      links: Array.isArray(next.links) ? next.links : clone(DEFAULT_STATE.links),
      stations: Array.isArray(next.stations) ? next.stations : []
    };
    saveState(state);
    renderMaps();
    renderLinks();
    renderStations();
    refreshSettingsEditors();
    alert("Import completato.");
    e.currentTarget.value = "";
  });
}

function initTopbar() {
  $("#btnShare").addEventListener("click", async () => {
    const url = location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title, url });
        return;
      } catch (_) {}
    }
    await navigator.clipboard.writeText(url);
    alert("Link copiato negli appunti.");
  });

  $("#btnExport").addEventListener("click", () => navTo("settings"));
}

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      reg.update().catch(() => {});
      setInterval(() => reg.update().catch(() => {}), 60_000);
    })
    .catch(() => {});

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

function injectEmbedStyles() {
  const style = document.createElement("style");
  style.textContent = `
    .embed { margin-top: 10px; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12); }
    .embed iframe { width: 100%; height: 420px; border: 0; background: rgba(0,0,0,0.2); }
  `;
  document.head.appendChild(style);
}

function boot() {
  injectEmbedStyles();
  initServiceWorker();
  initNav();
  initTopbar();
  initStations();
  initSettings();

  renderMaps();
  renderLinks();
  renderStations();
  refreshSettingsEditors();

  const hash = (location.hash || "").replace(/^#/, "");
  if (hash && document.querySelector(`#view-${hash}`)) navTo(hash);

  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (h && document.querySelector(`#view-${h}`)) navTo(h);
  });
}

boot();
