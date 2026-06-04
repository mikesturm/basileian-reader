// Cross-device sync for Basileian Reader, backed by a single private GitHub Gist.
//
// Single user, last-writer-wins per item. The gist holds one JSON file
// (basileian-reader-sync.json) shaped like:
//
//   {
//     "schema": 1,
//     "highlights": [ { id, sectionId, ..., createdAt, updatedAt } ],
//     "tombstones": [ { id, deletedAt } ],
//     "lastPosition": { book, chapter, currentSectionId, chapterMode, updatedAt },
//     "settings": { theme, activeTranslation, crossRefEnabled, activeCommentary, updatedAt }
//   }
//
// All times are epoch ms. Highlights with a matching tombstone (deletedAt >=
// updatedAt) are dropped at merge time. The merge is symmetric so it works
// from either direction.

(function () {
  const CONFIG_KEY = "basileian.reader.sync.config";       // { token, gistId, filename }
  const TOMBSTONES_KEY = "basileian.reader.sync.tombstones"; // [{id, deletedAt}]
  const META_KEY = "basileian.reader.sync.meta";             // { lastPulledAt, lastPushedAt, lastError }

  const STORAGE_HIGHLIGHTS = "basileian.reader.v2.highlights";
  const STORAGE_THEME = "basileian.reader.v2.theme";
  const STORAGE_TRANSLATION = "basileian.reader.v2.activeTranslation";
  const STORAGE_BOOKMARK = "basileian.reader.v2.lastPosition";
  const STORAGE_CROSSREF = "basileian.reader.v2.crossRef";
  const STORAGE_COMMENTARY = "basileian.reader.v2.commentary";
  // updatedAt timestamps for the non-array stores (which don't naturally carry their own)
  const STORAGE_BOOKMARK_TS = "basileian.reader.v2.lastPosition.updatedAt";
  const STORAGE_SETTINGS_TS = "basileian.reader.v2.settings.updatedAt";

  const GIST_FILENAME = "basileian-reader-sync.json";
  const PUSH_DEBOUNCE_MS = 3000;
  const PERIODIC_PULL_MS = 5 * 60 * 1000;

  let _onRemoteApplied = null;
  let _pushTimer = null;
  let _inFlight = null;
  let _periodicTimer = null;
  let _initialSyncDone = false;

  function readConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (!raw) return null;
      const cfg = JSON.parse(raw);
      if (!cfg || !cfg.token || !cfg.gistId) return null;
      return cfg;
    } catch { return null; }
  }

  function writeConfig(cfg) {
    if (!cfg) { localStorage.removeItem(CONFIG_KEY); return; }
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  }

  function readMeta() {
    try { return JSON.parse(localStorage.getItem(META_KEY)) || {}; }
    catch { return {}; }
  }
  function writeMeta(patch) {
    const m = { ...readMeta(), ...patch };
    localStorage.setItem(META_KEY, JSON.stringify(m));
  }

  function readTombstones() {
    try { return JSON.parse(localStorage.getItem(TOMBSTONES_KEY)) || []; }
    catch { return []; }
  }
  function writeTombstones(list) {
    localStorage.setItem(TOMBSTONES_KEY, JSON.stringify(list));
  }
  function recordTombstone(id) {
    const list = readTombstones().filter(t => t.id !== id);
    list.push({ id, deletedAt: Date.now() });
    writeTombstones(list);
    scheduleSync();
  }

  function readHighlights() {
    try { return JSON.parse(localStorage.getItem(STORAGE_HIGHLIGHTS) || "[]") || []; }
    catch { return []; }
  }

  function readLocalSettings() {
    return {
      theme: localStorage.getItem(STORAGE_THEME) || null,
      activeTranslation: localStorage.getItem(STORAGE_TRANSLATION) || null,
      crossRefEnabled: localStorage.getItem(STORAGE_CROSSREF) ? "1" : "",
      activeCommentary: localStorage.getItem(STORAGE_COMMENTARY) || null,
      updatedAt: Number(localStorage.getItem(STORAGE_SETTINGS_TS)) || 0
    };
  }

  function readLocalPosition() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_BOOKMARK) || "null");
      if (!stored) return null;
      stored.updatedAt = Number(localStorage.getItem(STORAGE_BOOKMARK_TS)) || stored.updatedAt || 0;
      return stored;
    } catch { return null; }
  }

  function buildLocalSnapshot() {
    return {
      schema: 1,
      highlights: readHighlights(),
      tombstones: readTombstones(),
      lastPosition: readLocalPosition(),
      settings: readLocalSettings()
    };
  }

  function mergeHighlights(localList, remoteList, tombstones) {
    const byId = new Map();
    for (const h of localList || []) byId.set(h.id, h);
    for (const h of remoteList || []) {
      const cur = byId.get(h.id);
      if (!cur) byId.set(h.id, h);
      else if ((h.updatedAt || 0) > (cur.updatedAt || 0)) byId.set(h.id, h);
    }
    const tombById = new Map((tombstones || []).map(t => [t.id, t.deletedAt || 0]));
    const out = [];
    for (const h of byId.values()) {
      const dt = tombById.get(h.id) || 0;
      if (dt && dt >= (h.updatedAt || 0)) continue; // deleted wins
      out.push(h);
    }
    return out;
  }

  function mergeTombstones(local, remote) {
    const byId = new Map();
    for (const t of local || []) byId.set(t.id, t);
    for (const t of remote || []) {
      const cur = byId.get(t.id);
      if (!cur || (t.deletedAt || 0) > (cur.deletedAt || 0)) byId.set(t.id, t);
    }
    // GC: drop tombstones older than 180 days
    const cutoff = Date.now() - 180 * 24 * 3600 * 1000;
    return Array.from(byId.values()).filter(t => (t.deletedAt || 0) >= cutoff);
  }

  function pickNewer(a, b) {
    const at = (a && a.updatedAt) || 0;
    const bt = (b && b.updatedAt) || 0;
    return bt > at ? b : a;
  }

  async function gistGet(cfg) {
    const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json"
      }
    });
    if (!res.ok) throw new Error(`Gist GET failed: ${res.status}`);
    const json = await res.json();
    const file = json.files && json.files[GIST_FILENAME];
    if (!file) return null;
    // Large files can be truncated; fall back to raw_url
    let content = file.content;
    if (file.truncated && file.raw_url) {
      const raw = await fetch(file.raw_url);
      if (raw.ok) content = await raw.text();
    }
    try { return JSON.parse(content); }
    catch { return null; }
  }

  async function gistPatch(cfg, payload) {
    const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        files: { [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) } }
      })
    });
    if (!res.ok) throw new Error(`Gist PATCH failed: ${res.status}`);
    return res.json();
  }

  function applyRemoteToLocal(merged) {
    // Highlights
    localStorage.setItem(STORAGE_HIGHLIGHTS, JSON.stringify(merged.highlights || []));
    writeTombstones(merged.tombstones || []);

    // Position
    if (merged.lastPosition) {
      const { updatedAt, ...rest } = merged.lastPosition;
      localStorage.setItem(STORAGE_BOOKMARK, JSON.stringify(rest));
      if (updatedAt) localStorage.setItem(STORAGE_BOOKMARK_TS, String(updatedAt));
    }

    // Settings
    if (merged.settings) {
      const s = merged.settings;
      if (s.theme) {
        localStorage.setItem(STORAGE_THEME, s.theme);
        document.documentElement.dataset.theme = s.theme;
      }
      if (s.activeTranslation) localStorage.setItem(STORAGE_TRANSLATION, s.activeTranslation);
      if (s.activeCommentary) localStorage.setItem(STORAGE_COMMENTARY, s.activeCommentary);
      localStorage.setItem(STORAGE_CROSSREF, s.crossRefEnabled ? "1" : "");
      if (s.updatedAt) localStorage.setItem(STORAGE_SETTINGS_TS, String(s.updatedAt));
    }
  }

  // Run a pull + merge + (conditional) push. Returns the merged snapshot.
  async function syncNow() {
    const cfg = readConfig();
    if (!cfg) return null;
    if (_inFlight) return _inFlight;

    _inFlight = (async () => {
      try {
        const remote = await gistGet(cfg);
        const local = buildLocalSnapshot();

        const tombstones = mergeTombstones(local.tombstones, remote && remote.tombstones);
        const highlights = mergeHighlights(
          local.highlights,
          remote && remote.highlights,
          tombstones
        );
        const lastPosition = pickNewer(local.lastPosition, remote && remote.lastPosition);
        const settings = pickNewer(local.settings, remote && remote.settings);

        const merged = { schema: 1, highlights, tombstones, lastPosition, settings };

        // Apply merged result locally
        applyRemoteToLocal(merged);

        // Push if the merge produced something different from remote.
        const remoteStr = remote ? JSON.stringify({
          schema: 1,
          highlights: remote.highlights || [],
          tombstones: remote.tombstones || [],
          lastPosition: remote.lastPosition || null,
          settings: remote.settings || null
        }) : "";
        const mergedStr = JSON.stringify(merged);
        if (mergedStr !== remoteStr) {
          await gistPatch(cfg, merged);
          writeMeta({ lastPushedAt: Date.now() });
        }
        writeMeta({ lastPulledAt: Date.now(), lastError: null });

        if (_onRemoteApplied) {
          try { _onRemoteApplied(merged, { isInitial: !_initialSyncDone }); } catch {}
        }
        _initialSyncDone = true;
        return merged;
      } catch (err) {
        writeMeta({ lastError: String(err && err.message || err) });
        throw err;
      } finally {
        _inFlight = null;
      }
    })();

    return _inFlight;
  }

  function scheduleSync() {
    if (!readConfig()) return;
    clearTimeout(_pushTimer);
    _pushTimer = setTimeout(() => {
      syncNow().catch(() => {});
      // Best-effort Background Sync: covers desktop Chrome/Edge & Android when tab closes
      // before push completes. Safari (iOS/macOS) does not implement it.
      if ("serviceWorker" in navigator && "SyncManager" in window) {
        navigator.serviceWorker.ready
          .then(reg => reg.sync.register("basileian-sync"))
          .catch(() => {});
      }
    }, PUSH_DEBOUNCE_MS);
  }

  // ---- Per-area save hooks called from app.js ----

  function notePositionChanged() {
    localStorage.setItem(STORAGE_BOOKMARK_TS, String(Date.now()));
    scheduleSync();
  }
  function noteSettingsChanged() {
    localStorage.setItem(STORAGE_SETTINGS_TS, String(Date.now()));
    scheduleSync();
  }
  function noteHighlightsChanged() {
    scheduleSync();
  }
  function noteHighlightDeleted(id) {
    recordTombstone(id);
  }

  // ---- Init + lifecycle ----

  function init(onRemoteApplied) {
    _onRemoteApplied = onRemoteApplied || null;
    const cfg = readConfig();
    if (!cfg) return;

    // Initial pull/merge/push
    syncNow().catch(() => {});

    // Periodic pull while tab is open (covers desktop & iPhone home-screen PWA)
    clearInterval(_periodicTimer);
    _periodicTimer = setInterval(() => {
      if (document.visibilityState === "visible") syncNow().catch(() => {});
    }, PERIODIC_PULL_MS);

    // Sync on focus / online — iOS Safari's substitute for Background Sync
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") syncNow().catch(() => {});
    });
    window.addEventListener("online", () => { syncNow().catch(() => {}); });

    // SW background sync wakes us with a postMessage when a registered tag fires
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", event => {
        if (event.data && event.data.type === "sync-request") {
          syncNow().catch(() => {});
        }
      });
    }

    // Try to enable periodic background sync (Chrome/Edge desktop & Android only)
    if ("serviceWorker" in navigator && "PeriodicSyncManager" in window) {
      navigator.serviceWorker.ready.then(async reg => {
        try {
          const status = await navigator.permissions.query({ name: "periodic-background-sync" });
          if (status.state === "granted") {
            await reg.periodicSync.register("basileian-periodic-sync", {
              minInterval: 60 * 60 * 1000 // 1 hour minimum
            });
          }
        } catch {}
      }).catch(() => {});
    }
  }

  function status() {
    const cfg = readConfig();
    const meta = readMeta();
    return {
      configured: !!cfg,
      gistId: cfg ? cfg.gistId : null,
      lastPulledAt: meta.lastPulledAt || null,
      lastPushedAt: meta.lastPushedAt || null,
      lastError: meta.lastError || null,
      backgroundSyncSupported: "SyncManager" in window,
      periodicSyncSupported: "PeriodicSyncManager" in window
    };
  }

  // Verify token + gist by attempting a GET.
  async function validate(token, gistId) {
    const res = await fetch(`https://api.github.com/gists/${gistId}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" }
    });
    if (!res.ok) throw new Error(`Validation failed: ${res.status} ${res.statusText}`);
    return await res.json();
  }

  async function configure(token, gistId) {
    await validate(token, gistId);
    writeConfig({ token, gistId });
    return syncNow();
  }

  function disconnect() {
    writeConfig(null);
    localStorage.removeItem(META_KEY);
    clearInterval(_periodicTimer);
    clearTimeout(_pushTimer);
  }

  window.SyncModule = {
    init,
    status,
    configure,
    disconnect,
    syncNow,
    notePositionChanged,
    noteSettingsChanged,
    noteHighlightsChanged,
    noteHighlightDeleted,
    GIST_FILENAME
  };
})();
