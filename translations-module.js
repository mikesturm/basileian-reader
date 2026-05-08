/**
 * Translations & Lexicons Module
 * Handles:
 * - Loading public-domain Bible translations
 * - Fallback loading directly from public source URLs when local translations/*.json files are not present
 * - Caching translations in memory and localStorage
 * - Optional Strong's/concordance lookups for Greek/Coptic words
 */

const TranslationsModule = (() => {
  const STORAGE_KEY = "basileian.reader.v2.translations";
  const CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

  let translationsCache = {};
  let strongsCache = {};
  let strongsDefinitionsCache = null;
  let wordIndexCache = null;
  let translationsMetadata = null;
  let initPromise = null;

  const NUMERIC_BOOKS = {
    1: "genesis", 2: "exodus", 3: "leviticus", 4: "numbers", 5: "deuteronomy",
    6: "joshua", 7: "judges", 8: "ruth", 9: "1samuel", 10: "2samuel",
    11: "1kings", 12: "2kings", 13: "1chronicles", 14: "2chronicles", 15: "ezra",
    16: "nehemiah", 17: "esther", 18: "job", 19: "psalms", 20: "proverbs",
    21: "ecclesiastes", 22: "songofsolomon", 23: "isaiah", 24: "jeremiah",
    25: "lamentations", 26: "ezekiel", 27: "daniel", 28: "hosea", 29: "joel",
    30: "amos", 31: "obadiah", 32: "jonah", 33: "micah", 34: "nahum",
    35: "habakkuk", 36: "zephaniah", 37: "haggai", 38: "zechariah", 39: "malachi",
    40: "matthew", 41: "mark", 42: "luke", 43: "john", 44: "acts", 45: "romans",
    46: "1corinthians", 47: "2corinthians", 48: "galatians", 49: "ephesians",
    50: "philippians", 51: "colossians", 52: "1thessalonians",
    53: "2thessalonians", 54: "1timothy", 55: "2timothy", 56: "titus",
    57: "philemon", 58: "hebrews", 59: "james", 60: "1peter", 61: "2peter",
    62: "1john", 63: "2john", 64: "3john", 65: "jude", 66: "revelation"
  };

  const BOOK_MAP = {
    "GEN": "genesis", "Genesis": "genesis", "Gen": "genesis",
    "EXO": "exodus", "Exodus": "exodus", "Exo": "exodus",
    "LEV": "leviticus", "Leviticus": "leviticus", "Lev": "leviticus",
    "NUM": "numbers", "Numbers": "numbers", "Num": "numbers",
    "DEU": "deuteronomy", "Deuteronomy": "deuteronomy", "Deut": "deuteronomy",
    "JOS": "joshua", "Joshua": "joshua", "Josh": "joshua",
    "JDG": "judges", "Judges": "judges", "Jdg": "judges",
    "RUT": "ruth", "Ruth": "ruth",
    "1SA": "1samuel", "1 Samuel": "1samuel", "1 Sam": "1samuel", "1Sam": "1samuel",
    "2SA": "2samuel", "2 Samuel": "2samuel", "2 Sam": "2samuel", "2Sam": "2samuel",
    "1KI": "1kings", "1 Kings": "1kings", "1 Kgs": "1kings",
    "2KI": "2kings", "2 Kings": "2kings", "2 Kgs": "2kings",
    "1CH": "1chronicles", "1 Chronicles": "1chronicles", "1 Chr": "1chronicles",
    "2CH": "2chronicles", "2 Chronicles": "2chronicles", "2 Chr": "2chronicles",
    "EZR": "ezra", "Ezra": "ezra",
    "NEH": "nehemiah", "Nehemiah": "nehemiah",
    "EST": "esther", "Esther": "esther",
    "JOB": "job", "Job": "job",
    "PSA": "psalms", "Psalms": "psalms", "Psalm": "psalms", "Ps": "psalms",
    "PRO": "proverbs", "Proverbs": "proverbs", "Prov": "proverbs",
    "ECC": "ecclesiastes", "Ecclesiastes": "ecclesiastes", "Ecc": "ecclesiastes",
    "SNG": "songofsolomon", "Song of Solomon": "songofsolomon", "Song": "songofsolomon",
    "ISA": "isaiah", "Isaiah": "isaiah", "Isa": "isaiah",
    "JER": "jeremiah", "Jeremiah": "jeremiah", "Jer": "jeremiah",
    "LAM": "lamentations", "Lamentations": "lamentations", "Lam": "lamentations",
    "EZK": "ezekiel", "Ezekiel": "ezekiel", "Eze": "ezekiel",
    "DAN": "daniel", "Daniel": "daniel", "Dan": "daniel",
    "HOS": "hosea", "Hosea": "hosea", "Hos": "hosea",
    "JOL": "joel", "Joel": "joel",
    "AMO": "amos", "Amos": "amos",
    "OBA": "obadiah", "Obadiah": "obadiah",
    "JON": "jonah", "Jonah": "jonah",
    "MIC": "micah", "Micah": "micah",
    "NAM": "nahum", "Nahum": "nahum",
    "HAB": "habakkuk", "Habakkuk": "habakkuk",
    "ZEP": "zephaniah", "Zephaniah": "zephaniah",
    "HAG": "haggai", "Haggai": "haggai",
    "ZEC": "zechariah", "Zechariah": "zechariah",
    "MAL": "malachi", "Malachi": "malachi",
    "MAT": "matthew", "Matthew": "matthew", "Mat": "matthew", "Matt": "matthew", "Mt": "matthew",
    "MRK": "mark", "Mark": "mark", "Mar": "mark", "Mrk": "mark", "Mk": "mark",
    "LUK": "luke", "Luke": "luke", "Luk": "luke", "Lk": "luke",
    "JHN": "john", "John": "john", "Joh": "john", "Jn": "john",
    "ACT": "acts", "Acts": "acts", "Act": "acts",
    "1CO": "1corinthians", "1 Corinthians": "1corinthians", "1 Cor": "1corinthians", "1Cor": "1corinthians",
    "2CO": "2corinthians", "2 Corinthians": "2corinthians", "2 Cor": "2corinthians", "2Cor": "2corinthians",
    "GAL": "galatians", "Galatians": "galatians", "Gal": "galatians"
  };

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        translationsMetadata = await fetchJSON("translations-index.json");
        loadFromCache();
      } catch (error) {
        console.warn("Translations module init failed:", error);
        translationsMetadata = { translations: [] };
      }
      return translationsMetadata;
    })();
    return initPromise;
  }

  function fetchJSON(url) {
    return fetch(url).then(r => {
      if (!r.ok) throw new Error(`${r.status}: ${url}`);
      return r.json();
    });
  }

  function getAvailableTranslations() {
    if (!translationsMetadata) return [];
    return translationsMetadata.translations || [];
  }

  async function loadTranslation(translationId) {
    if (translationId === "basileia") return null;
    if (translationsCache[translationId]) return translationsCache[translationId];

    await init();
    const meta = (translationsMetadata?.translations || []).find(t => t.id === translationId);
    if (!meta) throw new Error(`Translation not found: ${translationId}`);

    let data = null;
    let lastError = null;

    if (meta.file) {
      try {
        data = await fetchJSON(meta.file);
      } catch (error) {
        lastError = error;
        console.warn(`Local translation file unavailable (${meta.file}); trying source_url if available.`);
      }
    }

    if (!data && meta.source_url) {
      try {
        const raw = await fetchJSON(meta.source_url);
        data = normalizeRemoteTranslation(raw, meta);
      } catch (error) {
        lastError = error;
      }
    }

    if (!data) throw lastError || new Error(`Could not load ${translationId}`);

    translationsCache[translationId] = data;
    saveToCache(translationId, data);
    return data;
  }

  async function getVerseText(verseId, translationId) {
    if (translationId === "basileia") return null;
    const trans = await loadTranslation(translationId);
    return trans[verseId] || null;
  }

  function getCachedVerseText(verseId, translationId) {
    if (translationId === "basileia") return null;
    return translationsCache[translationId]?.[verseId] || null;
  }

  function normalizeRemoteTranslation(raw, meta = {}) {
    // Already in app-native format: { "mark.1.1": "..." }
    if (raw && !Array.isArray(raw) && Object.keys(raw).some(k => /^[a-z0-9]+?\.\d+\.\d+[a-z]?$/i.test(k))) {
      return raw;
    }

    if (meta.id === "kjv" || looksOpenBibleData(raw)) return parseOpenBibleData(raw);
    return parseScrollmapper(raw);
  }

  function looksOpenBibleData(raw) {
    return raw && !Array.isArray(raw) && Object.keys(raw).some(k => /^[1-9A-Z]{1,3}\s+\d+:\d+[a-z]?$/i.test(k));
  }

  function parseOpenBibleData(raw) {
    const result = {};
    for (const [key, text] of Object.entries(raw || {})) {
      const m = key.match(/^([1-9A-Z]{1,3})\s+(\d+):(\d+[a-z]?)$/i);
      if (!m) continue;
      result[toVerseId(m[1], m[2], m[3])] = normalizeVerseText(text);
    }
    return result;
  }

  function parseScrollmapper(raw) {
    const result = {};
    let rows = null;

    if (Array.isArray(raw)) rows = raw;
    else if (raw?.resultset && Array.isArray(raw.resultset.row)) {
      rows = raw.resultset.row.map(r => {
        if (Array.isArray(r.field)) {
          return { b: r.field[1], c: r.field[2], v: r.field[3], t: r.field[4] };
        }
        return r;
      });
    }

    if (!rows) return result;

    for (const row of rows) {
      if (!row) continue;
      if (typeof row.book === "string" && row.chapter !== undefined) {
        result[toVerseId(row.book, row.chapter, row.verse)] = normalizeVerseText(row.text || row.t || "");
      } else if (row.b !== undefined) {
        result[toVerseId(row.b, row.c, row.v)] = normalizeVerseText(row.t || row.text || "");
      } else if (row.book_id !== undefined) {
        result[toVerseId(row.book_id, row.chapter, row.verse)] = normalizeVerseText(row.text || "");
      }
    }
    return result;
  }

  function normalizeBook(raw) {
    if (raw == null) return "unknown";
    const asString = String(raw).trim();
    if (/^\d+$/.test(asString) && NUMERIC_BOOKS[Number(asString)]) return NUMERIC_BOOKS[Number(asString)];
    if (BOOK_MAP[asString]) return BOOK_MAP[asString];
    const lower = asString.toLowerCase();
    for (const [key, value] of Object.entries(BOOK_MAP)) {
      if (key.toLowerCase() === lower) return value;
    }
    return lower.replace(/[^a-z0-9]/g, "");
  }

  function toVerseId(book, chapter, verse) {
    return `${normalizeBook(book)}.${chapter}.${verse}`;
  }

  function normalizeVerseText(text) {
    if (text == null) return "";
    if (typeof text === "string") return text;
    if (typeof text === "object" && "text" in text) return String(text.text || "");
    return String(text);
  }

  async function loadStrongs(language = "grc") {
    if (strongsCache[language]) return strongsCache[language];
    const file = language === "grc" ? "lexicons/strongs-grc.json" : "lexicons/strongs-cop.json";
    try {
      const data = await fetchJSON(file);
      strongsCache[language] = data;
      return data;
    } catch (error) {
      strongsCache[language] = {};
      return {};
    }
  }

  async function getStrongs(word, language = "grc") {
    const index = await loadStrongs(language);
    return index[word] || index[normaliseLookupKey(word)] || null;
  }

  async function getStrongsDefinition(strongsNum) {
    if (!strongsDefinitionsCache) {
      try {
        strongsDefinitionsCache = await fetchJSON("lexicons/strongs-index.json");
      } catch (e) {
        strongsDefinitionsCache = {};
      }
    }

    if (strongsDefinitionsCache[strongsNum]) return strongsDefinitionsCache[strongsNum];

    return {
      number: strongsNum,
      definition: `No local definition file is available for ${strongsNum}.`,
      url: `https://www.blueletterbible.org/lexicon/${strongsNum}/`
    };
  }

  async function getWordEntry(word, language = "grc") {
    const key = normaliseLookupKey(word);
    if (!wordIndexCache) {
      try {
        wordIndexCache = await fetchJSON("lexicons/word-index.json");
      } catch (e) {
        wordIndexCache = {};
      }
    }

    const direct = wordIndexCache[key] || wordIndexCache[word];
    if (direct) return direct;

    const strongs = await getStrongs(key, language);
    if (strongs) {
      const entry = await getStrongsDefinition(strongs);
      return {
        selected: word,
        source: entry.lemma || word,
        transliteration: entry.transliteration || "",
        strongs,
        youngs: entry.youngs || entry.young || "",
        definition: entry.definition || ""
      };
    }
    return null;
  }

  function normaliseLookupKey(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}µ]+/gu, "")
      .toLowerCase();
  }

  function saveToCache(translationId, data) {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      cache[translationId] = { data, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) {
      // localStorage quota may be too small for multiple full translations; memory cache still works.
      console.warn("Failed to save translation to localStorage:", e);
    }
  }

  function loadFromCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      for (const [id, entry] of Object.entries(cache)) {
        if (entry && Date.now() - entry.timestamp < CACHE_EXPIRY) translationsCache[id] = entry.data;
      }
    } catch (e) {
      console.warn("Failed to load translations from cache:", e);
    }
  }

  function isLoaded(translationId) {
    return !!translationsCache[translationId];
  }

  function getLoadedTranslations() {
    return Object.keys(translationsCache);
  }

  return {
    init,
    getAvailableTranslations,
    loadTranslation,
    getVerseText,
    getCachedVerseText,
    loadStrongs,
    getStrongs,
    getStrongsDefinition,
    getWordEntry,
    isLoaded,
    getLoadedTranslations
  };
})();

window.TranslationsModule = TranslationsModule;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => TranslationsModule.init());
} else {
  TranslationsModule.init();
}
