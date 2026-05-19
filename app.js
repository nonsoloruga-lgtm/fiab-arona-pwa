const STORAGE_KEY = "fiab_arona_pwa_state_v1";
const PUBLIC_STATIONS_URL = "./public-stations.json";
// Email to receive proposals (admins will then add to public-stations.json).
// Leave empty to hide the "Proponi" button.
const PROPOSAL_EMAIL = "soloruga@libero.it";

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
    },
    {
      title: "Komoot · Raccolta tour (Draisina)",
      url: "https://www.komoot.com/it-it/collection/2179370/-tourist-tour-for-draisina?t_s=referral&t_cid=collection_share&t_ref_username=728887370039",
      description: "Raccolta Komoot condivisa (apre nell’app/sito Komoot).",
      embedUrl: ""
    }
  ],
  links: [
    { title: "FIAB Arona (sito)", url: "https://sites.google.com/view/fiab-arona/home", group: "FIAB" },
    { title: "FIAB (sito nazionale)", url: "https://www.fiabitalia.it", group: "FIAB" },
    { title: "Bicitalia", url: "https://bicitalia.it/", group: "Ciclovie" },
    { title: "Albergabici", url: "https://www.albergabici.it/it/", group: "Ciclovie" },
    {
      title: "Calendario eventi Arona",
      url: "https://www.andiamoinbici.it/search.php?start_date=19%2F05%2F2026&end_date=&q=&dove=&assid=228&tag_1=&tag_2=&tag_3=&tag_4=&tag_5=&tag_6=&btnClick=Cerca",
      group: "Calendario eventi Arona"
    }
  ],
  stations: []
};

function keyOfLink(x) {
  return `${String(x?.group || "")}::${String(x?.title || "")}`;
}

const DEFAULT_LINK_RANK = new Map(DEFAULT_STATE.links.map((l, i) => [keyOfLink(l), i]));

function mergeDefaultsByKey(current, defaults) {
  const currentList = Array.isArray(current) ? current : [];
  const defaultsList = Array.isArray(defaults) ? defaults : [];

  const seen = new Set(currentList.map(keyOfLink));
  const merged = currentList.slice();

  defaultsList.forEach((d) => {
    const key = keyOfLink(d);
    if (seen.has(key)) return;
    merged.push(d);
    seen.add(key);
  });

  return merged;
}

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
  const maps = mergeDefaultsByKey(
    Array.isArray(parsed.value.maps) ? parsed.value.maps : clone(DEFAULT_STATE.maps),
    DEFAULT_STATE.maps,
  );
  const links = mergeDefaultsByKey(
    Array.isArray(parsed.value.links) ? parsed.value.links : clone(DEFAULT_STATE.links),
    DEFAULT_STATE.links,
  );
  const stations = Array.isArray(parsed.value.stations) ? parsed.value.stations : [];
  return { maps, links, stations };
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
  if (view === "settings") view = "home";
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

function stationNavLink(st) {
  if (!isValidLatLon(st.lat, st.lon)) return "";
  const dest = `${st.lat},${st.lon}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}

let state = loadState();
let editingStationIndex = null;
let publicStations = [];
let stationsFilter = "all"; // all | public | mine
let stationsQuery = "";

function setStationEditing(idx) {
  editingStationIndex = typeof idx === "number" ? idx : null;
  const submitBtn = document.querySelector("#btnStationSubmit");
  const cancelBtn = document.querySelector("#btnStationCancel");
  if (submitBtn) submitBtn.textContent = editingStationIndex === null ? "Aggiungi" : "Salva modifiche";
  if (cancelBtn) cancelBtn.classList.toggle("hidden", editingStationIndex === null);
}

async function fetchPublicStations() {
  try {
    const res = await fetch(`${PUBLIC_STATIONS_URL}?v=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = Array.isArray(data?.stations) ? data.stations : [];
    publicStations = list;
    return true;
  } catch (_) {
    return false;
  }
}

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
      .sort((a, b) => {
        const ra = DEFAULT_LINK_RANK.get(keyOfLink(a));
        const rb = DEFAULT_LINK_RANK.get(keyOfLink(b));
        if (typeof ra === "number" && typeof rb === "number" && ra !== rb) return ra - rb;
        if (typeof ra === "number" && typeof rb !== "number") return -1;
        if (typeof ra !== "number" && typeof rb === "number") return 1;
        return String(a.title || "").localeCompare(String(b.title || ""), "it");
      })
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
  const merged = [];

  if (stationsFilter === "all" || stationsFilter === "public") {
    publicStations.forEach((st) => merged.push({ ...st, _source: "public" }));
  }
  if (stationsFilter === "all" || stationsFilter === "mine") {
    state.stations.forEach((st, mineIndex) => merged.push({ ...st, _source: "mine", _mineIndex: mineIndex }));
  }

  // Filter by search query and sort alphabetically by name.
  const q = stationsQuery.trim().toLocaleLowerCase("it");
  const filtered = merged
    .filter((st) => {
      if (!q) return true;
      const name = String(st.name || "").toLocaleLowerCase("it");
      return name.includes(q);
    })
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" }));

  empty.classList.toggle("hidden", filtered.length !== 0);

  filtered.forEach((st, idx) => {
    const item = document.createElement("div");
    item.className = "item";
    const meta = formatStationMeta(st);
    const maps = stationMapsLink(st);
    const pill =
      st._source === "public"
        ? `<span class="pill pill--public">Pubblica</span>`
        : `<span class="pill pill--mine">Mia</span>`;
    const canEdit = st._source === "mine";

    item.innerHTML = `
      <div class="item__title">${escapeHtml(st.name || `Punto ${idx + 1}`)} ${pill}</div>
      <div class="item__meta">${escapeHtml(meta || "—")}</div>
      <div class="item__actions">
        ${maps ? `<a class="btn btn--primary" href="${escapeHtml(maps)}" target="_blank" rel="noopener noreferrer">Apri mappa</a>` : ""}
        ${canEdit ? `<button class="btn" data-edit="${idx}">Modifica</button>` : ""}
        ${canEdit ? `<button class="btn btn--danger" data-del="${idx}">Elimina</button>` : ""}
      </div>
    `;
    list.appendChild(item);
  });

  list.querySelectorAll("button[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.del);
      if (!Number.isFinite(idx)) return;
      const mineIdx = filtered[idx]?._mineIndex;
      if (!Number.isFinite(mineIdx)) return;
      state.stations.splice(mineIdx, 1);
      saveState(state);
      if (editingStationIndex === mineIdx) setStationEditing(null);
      renderStations();
    });
  });

  list.querySelectorAll("button[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.edit);
      if (!Number.isFinite(idx)) return;
      const stMerged = filtered[idx];
      if (!stMerged || stMerged._source !== "mine") return;
      const mineIdx = stMerged._mineIndex;
      const st = state.stations[mineIdx];
      if (!st) return;
      setStationEditing(mineIdx);
      const form = $("#stationForm");
      form.elements.namedItem("name").value = st.name || "";
      form.elements.namedItem("area").value = st.area || "";
      form.elements.namedItem("notes").value = st.notes || "";
      form.elements.namedItem("lat").value = st.lat || "";
      form.elements.namedItem("lon").value = st.lon || "";
      form.elements.namedItem("url").value = st.url || "";
      navTo("stations");
      form.elements.namedItem("name").focus();
    });
  });
}

function initNav() {
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", () => navTo(el.dataset.nav));
  });
}

function initStations() {
  const cancelBtn = $("#btnStationCancel");
  setStationEditing(null);

  const searchInput = $("#stationsSearch");
  const searchClear = $("#stationsSearchClear");
  const applySearchUi = () => {
    const has = stationsQuery.trim().length > 0;
    searchClear.classList.toggle("hidden", !has);
  };

  searchInput.addEventListener("input", () => {
    stationsQuery = searchInput.value || "";
    applySearchUi();
    renderStations();
  });

  searchClear.addEventListener("click", () => {
    stationsQuery = "";
    searchInput.value = "";
    applySearchUi();
    renderStations();
    searchInput.focus();
  });

  applySearchUi();

  const setFilter = (next) => {
    stationsFilter = next;
    $("#chipStationsPublic").classList.toggle("chip--active", next === "public");
    $("#stationsFormWrap").classList.toggle("hidden", next !== "mine");
    renderStations();
  };

  $("#chipStationsPublic").addEventListener("click", () => setFilter("public"));

  $("#btnStationsRefreshPublic").addEventListener("click", async () => {
    const ok = await fetchPublicStations();
    renderStations();
    alert(ok ? "Colonnine pubbliche aggiornate." : "Non riesco ad aggiornare (serve connessione).");
  });

  const proposeBtn = $("#btnStationsPropose");
  const proposalModal = $("#proposalModal");
  const closeModal = () => proposalModal.classList.add("hidden");
  const openModal = () => proposalModal.classList.remove("hidden");

  if (!PROPOSAL_EMAIL) {
    proposeBtn.classList.add("hidden");
  } else {
    proposeBtn.addEventListener("click", () => {
      // Show the personal form (Mie) where the user can add/edit and export.
      setFilter("mine");
      const formWrap = $("#stationsFormWrap");
      formWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      openModal();
    });
  }

  $("#btnProposalClose").addEventListener("click", closeModal);
  proposalModal.querySelectorAll("[data-close]").forEach((el) => el.addEventListener("click", closeModal));

  const mailtoHref = (() => {
    const subject = "Proposta colonnina FIAB Arona";
    const body =
      "Ciao! Vorrei proporre una colonnina/punto ricarica per l’elenco pubblico.%0D%0A%0D%0A" +
      "Nome:%0D%0A" +
      "Comune/Zona:%0D%0A" +
      "Indirizzo/Note:%0D%0A" +
      "Lat:%0D%0A" +
      "Lon:%0D%0A" +
      "Link (opzionale):%0D%0A%0D%0A" +
      "Grazie!";
    return `mailto:${encodeURIComponent(PROPOSAL_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${body}`;
  })();

  $("#btnProposalEmail").addEventListener("click", () => {
    closeModal();
    location.href = mailtoHref;
  });

  $("#btnProposalLocation").addEventListener("click", () => {
    closeModal();
    if (!navigator.geolocation) return alert("Geolocalizzazione non supportata dal browser.");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = String(pos.coords.latitude.toFixed(6));
        const lon = String(pos.coords.longitude.toFixed(6));
        const mapsUrl = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lon}`)}`;
        const text = `Proposta colonnina FIAB Arona — posizione: ${lat}, ${lon}`;
        if (navigator.share) {
          try {
            await navigator.share({ title: "Posizione colonnina", text, url: mapsUrl });
            return;
          } catch (_) {}
        }
        try {
          await navigator.clipboard.writeText(`${text}\n${mapsUrl}`);
          alert("Posizione copiata negli appunti.");
        } catch (_) {
          alert(mapsUrl);
        }
      },
      () => alert("Non riesco a leggere la posizione. Controlla i permessi del browser."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });

  // Map modal (Leaflet)
  const stationsMapModal = $("#stationsMapModal");
  const closeMap = () => stationsMapModal.classList.add("hidden");
  const openMap = () => stationsMapModal.classList.remove("hidden");
  stationsMapModal.querySelectorAll("[data-close='map']").forEach((el) => el.addEventListener("click", closeMap));
  $("#btnMapClose").addEventListener("click", closeMap);

  let map = null;
  let markersLayer = null;
  let myPosMarker = null;

  const buildMapPoints = () => {
    const points = [];
    publicStations.forEach((st) => points.push({ ...st, _source: "public" }));
    state.stations.forEach((st) => points.push({ ...st, _source: "mine" }));
    return points.filter((st) => isValidLatLon(st.lat, st.lon));
  };

  const ensureMap = () => {
    if (map) return true;
    if (!window.L) {
      alert("La mappa non è ancora pronta (manca connessione o caricamento). Riprova tra qualche secondo.");
      return false;
    }
    map = window.L.map("stationsMap", { zoomControl: true, scrollWheelZoom: false });
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);
    markersLayer = window.L.layerGroup().addTo(map);
    map.setView([45.8, 8.6], 11);
    return true;
  };

  const renderMapMarkers = () => {
    if (!ensureMap()) return;
    markersLayer.clearLayers();

    const points = buildMapPoints()
      .filter((st) => {
        const q = stationsQuery.trim().toLocaleLowerCase("it");
        if (!q) return true;
        return String(st.name || "").toLocaleLowerCase("it").includes(q);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" }));

    const bounds = [];
    points.forEach((st) => {
      const lat = Number(st.lat);
      const lon = Number(st.lon);
      const nav = stationNavLink(st);
      const srcLabel = st._source === "public" ? "Pubblica" : "Mia";
      const popup = `
        <div style="font-weight:900;margin-bottom:4px;">${escapeHtml(st.name || "")}</div>
        <div style="font-size:12px;color:#335b6c;margin-bottom:8px;">${escapeHtml(srcLabel)} · ${escapeHtml(formatStationMeta(st) || "")}</div>
        ${nav ? `<a href="${escapeHtml(nav)}" target="_blank" rel="noopener noreferrer">Naviga</a>` : ""}
      `;
      const m = window.L.marker([lat, lon]).bindPopup(popup);
      markersLayer.addLayer(m);
      bounds.push([lat, lon]);
    });

    if (bounds.length) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }

    setTimeout(() => map.invalidateSize(), 0);
  };

  $("#btnStationsMap").addEventListener("click", () => {
    openMap();
    renderMapMarkers();
  });

  $("#btnMapMyPos").addEventListener("click", () => {
    if (!ensureMap()) return;
    if (!navigator.geolocation) return alert("Geolocalizzazione non supportata dal browser.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        if (myPosMarker) myPosMarker.remove();
        myPosMarker = window.L.circleMarker([lat, lon], {
          radius: 7,
          color: "#006aa7",
          weight: 3,
          fillColor: "#fcde4c",
          fillOpacity: 0.9
        }).addTo(map);
        map.setView([lat, lon], Math.max(map.getZoom(), 14));
      },
      () => alert("Non riesco a leggere la posizione. Controlla i permessi del browser."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
    );
  });

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
    if (editingStationIndex !== null && state.stations[editingStationIndex]) {
      state.stations[editingStationIndex] = st;
      setStationEditing(null);
    } else {
      state.stations.unshift(st);
    }
    saveState(state);
    e.currentTarget.reset();
    renderStations();
    if (!stationsMapModal.classList.contains("hidden")) renderMapMarkers();
  });

  cancelBtn.addEventListener("click", () => {
    setStationEditing(null);
    $("#stationForm").reset();
  });

  $("#btnStationsClear").addEventListener("click", () => {
    if (!confirm("Vuoi davvero svuotare la lista colonnine su questo dispositivo?")) return;
    state.stations = [];
    setStationEditing(null);
    saveState(state);
    renderStations();
    if (!stationsMapModal.classList.contains("hidden")) renderMapMarkers();
  });

  $("#btnStationsExport").addEventListener("click", async () => {
    const payload = { version: 1, exportedAt: new Date().toISOString(), stations: state.stations };
    if (navigator.share) {
      try {
        const file = new File([JSON.stringify(payload, null, 2)], "fiab-arona-colonnine.json", { type: "application/json" });
        await navigator.share({ title: "Colonnine FIAB Arona", files: [file] });
        return;
      } catch (_) {}
    }
    downloadJson("fiab-arona-colonnine.json", payload);
    alert("File esportato. Puoi inviarlo su WhatsApp/email a chi gestisce l’elenco pubblico.");
  });

  // Default: show list-first, insertion only under "Mie".
  setFilter("public");
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
}

function isStandaloneMode() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function isIos() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function initInstallUi() {
  const btnInstall = document.querySelector("#btnInstall");
  const installModal = document.querySelector("#installModal");
  const btnInstallClose = document.querySelector("#btnInstallClose");
  const btnInstallNow = document.querySelector("#btnInstallNow");

  if (!btnInstall || !installModal || !btnInstallClose || !btnInstallNow) return;
  if (isStandaloneMode()) return;

  let deferredPrompt = null;

  const open = () => installModal.classList.remove("hidden");
  const close = () => installModal.classList.add("hidden");

  btnInstallClose.addEventListener("click", close);
  installModal.querySelectorAll("[data-close='install']").forEach((el) => el.addEventListener("click", close));

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove("hidden");
    btnInstallNow.classList.remove("hidden");
  });

  btnInstall.addEventListener("click", () => {
    // If we have the native prompt (Android/Chrome), show it; otherwise show instructions (iOS).
    open();
  });

  btnInstallNow.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    close();
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } catch (_) {}
    deferredPrompt = null;
    btnInstallNow.classList.add("hidden");
  });

  // iOS: show instructions button even without native prompt.
  if (isIos()) {
    btnInstall.classList.remove("hidden");
  }
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
  initInstallUi();
  initStations();

  fetchPublicStations().finally(() => {
    renderStations();
  });

  renderMaps();
  renderLinks();

  const hash = (location.hash || "").replace(/^#/, "");
  if (hash && document.querySelector(`#view-${hash}`)) navTo(hash);

  window.addEventListener("hashchange", () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (h && document.querySelector(`#view-${h}`)) navTo(h);
  });
}

boot();
