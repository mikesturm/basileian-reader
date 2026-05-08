/**
 * Translations & Lexicons Module
 * Handles:
 * - Loading public-domain Bible translations
 * - Caching translations in memory and localStorage (IndexedDB-ready)
 * - Strong's concordance lookups for Greek/Coptic words
 * - Fetching word definitions
 */

const TranslationsModule = (() => {
  const STORAGE_KEY = "basileian.reader.v2.translations";
  const STORAGE_STRONGS_KEY = "basileian.reader.v2.strongs";
  const CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

  let translationsCache = {};
  let strongsCache = {};
  let translationsMetadata = null;
  let initPromise = null;

  /**
   * Initialize: Load metadata and cached translations
   */
  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        // Load translations metadata
        translationsMetadata = await fetchJSON("translations-index.json");
        console.log("✓ Translations index loaded");

        // Load cached translations from localStorage
        loadFromCache();

        // Preload the default translation (basileia, if needed) and first alt translation
        // Don't block on this, but do it in background
        preloadDefaultTranslations();
      } catch (error) {
        console.warn("Translations module init failed:", error);
      }
      return translationsMetadata;
    })();
    return initPromise;
  }

  /**
   * Fetch JSON file (works with GitHub Pages)
   */
  function fetchJSON(url) {
    return fetch(url).then(r => {
      if (!r.ok) throw new Error(`${r.status}: ${url}`);
      return r.json();
    });
  }

  /**
   * Preload commonly-used translations in background
   */
  function preloadDefaultTranslations() {
    if (!translationsMetadata) return;
    // Preload KJV and ASV
    const toPreload = ["kjv", "asv"];
    for (const id of toPreload) {
      if (!translationsCache[id]) {
        loadTranslation(id).catch(e => console.warn(`Failed to preload ${id}:`, e));
      }
    }
  }

  /**
   * Get available translations
   */
  function getAvailableTranslations() {
    if (!translationsMetadata) return [];
    return translationsMetadata.translations || [];
  }

  /**
   * Load a single translation (cached, on-demand)
   */
  async function loadTranslation(translationId) {
    // Already loaded
    if (translationsCache[translationId]) {
      return translationsCache[translationId];
    }

    const meta = (translationsMetadata?.translations || []).find(
      t => t.id === translationId
    );
    if (!meta) throw new Error(`Translation not found: ${translationId}`);

    try {
      console.log(`⏳ Loading translation: ${translationId}`);
      const data = await fetchJSON(meta.file);
      translationsCache[translationId] = data;

      // Save to localStorage cache
      saveToCache(translationId, data);

      console.log(`✓ Loaded ${translationId}`);
      return data;
    } catch (error) {
      console.error(`Error loading translation ${translationId}:`, error);
      throw error;
    }
  }

  /**
   * Get verse text in specified translation
   * @param {string} verseId - verse_id format: "mark.1.1"
   * @param {string} translationId - "kjv", "asv", "web", etc.
   * @returns {Promise<string>} - verse text, or null if not found
   */
  async function getVerseText(verseId, translationId) {
    if (translationId === "basileia") return null; // Source text is not stored here

    const trans = await loadTranslation(translationId);
    return trans[verseId] || null;
  }

  /**
   * Load Strong's concordance data (Greek lemma → Strong's number)
   */
  async function loadStrongs(language = "grc") {
    if (strongsCache[language]) {
      return strongsCache[language];
    }

    const file = language === "grc" ? "lexicons/strongs-grc.json" : "lexicons/strongs-cop.json";
    try {
      console.log(`⏳ Loading Strong's index: ${language}`);
      const data = await fetchJSON(file);
      strongsCache[language] = data;
      console.log(`✓ Loaded Strong's ${language} (${Object.keys(data).length} lemmas)`);
      return data;
    } catch (error) {
      console.warn(`Strong's index not available for ${language}:`, error);
      return {};
    }
  }

  /**
   * Get Strong's number for a Greek or Coptic word
   * @param {string} word - Greek or Coptic word
   * @param {string} language - "grc" or "cop"
   * @returns {Promise<string|null>} - Strong's number (e.g., "G3056")
   */
  async function getStrongs(word, language = "grc") {
    const index = await loadStrongs(language);
    return index[word] || null;
  }

  /**
   * Get Strong's definition (from embedded data or external service)
   * @param {string} strongsNum - Strong's number (e.g., "G3056")
   * @returns {Promise<Object>} - {number, lemma, definition}
   */
  async function getStrongsDefinition(strongsNum) {
    try {
      // Try to load pre-built Strong's index
      const index = await fetchJSON("lexicons/strongs-index.json");
      if (index[strongsNum]) {
        return index[strongsNum];
      }
    } catch (e) {
      // Index not available yet
    }

    // Fallback: return basic object
    return {
      number: strongsNum,
      definition: `Look up ${strongsNum} on BlueLetterBible.org`,
      url: `https://www.blueletterbible.org/lexicon/${strongsNum}/`
    };
  }

  /**
   * Cache management: Save to localStorage
   */
  function saveToCache(translationId, data) {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      cache[translationId] = {
        data: data,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
      console.warn("Failed to save translation to cache:", e);
    }
  }

  /**
   * Cache management: Load from localStorage
   */
  function loadFromCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      for (const [id, entry] of Object.entries(cache)) {
        // Check if expired
        if (Date.now() - entry.timestamp < CACHE_EXPIRY) {
          translationsCache[id] = entry.data;
        }
      }
      console.log(`✓ Loaded ${Object.keys(translationsCache).length} translations from cache`);
    } catch (e) {
      console.warn("Failed to load translations from cache:", e);
    }
  }

  /**
   * Check if a translation is loaded
   */
  function isLoaded(translationId) {
    return !!translationsCache[translationId];
  }

  /**
   * Get all loaded translation IDs
   */
  function getLoadedTranslations() {
    return Object.keys(translationsCache);
  }

  return {
    init,
    getAvailableTranslations,
    loadTranslation,
    getVerseText,
    loadStrongs,
    getStrongs,
    getStrongsDefinition,
    isLoaded,
    getLoadedTranslations
  };
})();

window.TranslationsModule = TranslationsModule;

// Initialize on page load if available
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => TranslationsModule.init());
} else {
  TranslationsModule.init();
}
