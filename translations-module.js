/**
 * Translations & Lexicons Module
 * Browser-only translation loader for GitHub Pages.
 *
 * It first tries bundled normalized files such as translations/kjv.json. If
 * those files are absent, it fetches the remote public-domain Scrollmapper JSON
 * source listed in translations-index.json and normalizes it in the browser.
 */

const TranslationsModule = (() => {
  const STORAGE_KEY = "basileian.reader.v4.translations";
  const CACHE_EXPIRY = 30 * 24 * 60 * 60 * 1000;

  let translationsCache = {};
  let translationLoadPromises = {};
  let strongsCache = {};
  let translationsMetadata = null;
  let initPromise = null;

  const BOOK_MAP = {
    "genesis":"genesis","gen":"genesis","gn":"genesis","1":"genesis",
    "exodus":"exodus","exo":"exodus","ex":"exodus","2":"exodus",
    "leviticus":"leviticus","lev":"leviticus","lv":"leviticus","3":"leviticus",
    "numbers":"numbers","num":"numbers","nu":"numbers","4":"numbers",
    "deuteronomy":"deuteronomy","deut":"deuteronomy","dt":"deuteronomy","5":"deuteronomy",
    "joshua":"joshua","josh":"joshua","jos":"joshua","6":"joshua",
    "judges":"judges","jdg":"judges","judg":"judges","7":"judges",
    "ruth":"ruth","rut":"ruth","8":"ruth",
    "1 samuel":"1samuel","1samuel":"1samuel","1 sam":"1samuel","1sa":"1samuel","9":"1samuel",
    "2 samuel":"2samuel","2samuel":"2samuel","2 sam":"2samuel","2sa":"2samuel","10":"2samuel",
    "1 kings":"1kings","1kings":"1kings","1 kgs":"1kings","1ki":"1kings","11":"1kings",
    "2 kings":"2kings","2kings":"2kings","2 kgs":"2kings","2ki":"2kings","12":"2kings",
    "1 chronicles":"1chronicles","1chronicles":"1chronicles","1 chr":"1chronicles","1ch":"1chronicles","13":"1chronicles",
    "2 chronicles":"2chronicles","2chronicles":"2chronicles","2 chr":"2chronicles","2ch":"2chronicles","14":"2chronicles",
    "ezra":"ezra","ezr":"ezra","15":"ezra",
    "nehemiah":"nehemiah","neh":"nehemiah","16":"nehemiah",
    "esther":"esther","est":"esther","17":"esther",
    "job":"job","18":"job",
    "psalms":"psalms","psalm":"psalms","ps":"psalms","psa":"psalms","19":"psalms",
    "proverbs":"proverbs","prov":"proverbs","pro":"proverbs","pr":"proverbs","20":"proverbs",
    "ecclesiastes":"ecclesiastes","eccl":"ecclesiastes","ecc":"ecclesiastes","21":"ecclesiastes",
    "song of solomon":"songofsolomon","songofsolomon":"songofsolomon","song":"songofsolomon","sng":"songofsolomon","22":"songofsolomon",
    "isaiah":"isaiah","isa":"isaiah","is":"isaiah","23":"isaiah",
    "jeremiah":"jeremiah","jer":"jeremiah","24":"jeremiah",
    "lamentations":"lamentations","lam":"lamentations","25":"lamentations",
    "ezekiel":"ezekiel","ezek":"ezekiel","eze":"ezekiel","ezk":"ezekiel","26":"ezekiel",
    "daniel":"daniel","dan":"daniel","27":"daniel",
    "hosea":"hosea","hos":"hosea","28":"hosea",
    "joel":"joel","jol":"joel","29":"joel",
    "amos":"amos","amo":"amos","30":"amos",
    "obadiah":"obadiah","oba":"obadiah","31":"obadiah",
    "jonah":"jonah","jon":"jonah","32":"jonah",
    "micah":"micah","mic":"micah","33":"micah",
    "nahum":"nahum","nah":"nahum","34":"nahum",
    "habakkuk":"habakkuk","hab":"habakkuk","35":"habakkuk",
    "zephaniah":"zephaniah","zep":"zephaniah","36":"zephaniah",
    "haggai":"haggai","hag":"haggai","37":"haggai",
    "zechariah":"zechariah","zec":"zechariah","38":"zechariah",
    "malachi":"malachi","mal":"malachi","39":"malachi",
    "matthew":"matthew","mat":"matthew","matt":"matthew","mt":"matthew","40":"matthew",
    "mark":"mark","mrk":"mark","mk":"mark","mar":"mark","41":"mark",
    "luke":"luke","luk":"luke","lk":"luke","42":"luke",
    "john":"john","jhn":"john","jn":"john","joh":"john","43":"john",
    "acts":"acts","act":"acts","ac":"acts","44":"acts",
    "romans":"romans","rom":"romans","45":"romans",
    "1 corinthians":"1corinthians","1corinthians":"1corinthians","1 cor":"1corinthians","1co":"1corinthians","46":"1corinthians",
    "2 corinthians":"2corinthians","2corinthians":"2corinthians","2 cor":"2corinthians","2co":"2corinthians","47":"2corinthians",
    "galatians":"galatians","gal":"galatians","48":"galatians",
    "ephesians":"ephesians","eph":"ephesians","49":"ephesians",
    "philippians":"philippians","php":"philippians","phil":"philippians","50":"philippians",
    "colossians":"colossians","col":"colossians","51":"colossians",
    "1 thessalonians":"1thessalonians","1thessalonians":"1thessalonians","1 thess":"1thessalonians","1th":"1thessalonians","52":"1thessalonians",
    "2 thessalonians":"2thessalonians","2thessalonians":"2thessalonians","2 thess":"2thessalonians","2th":"2thessalonians","53":"2thessalonians",
    "1 timothy":"1timothy","1timothy":"1timothy","1 tim":"1timothy","1ti":"1timothy","54":"1timothy",
    "2 timothy":"2timothy","2timothy":"2timothy","2 tim":"2timothy","2ti":"2timothy","55":"2timothy",
    "titus":"titus","tit":"titus","56":"titus",
    "philemon":"philemon","phm":"philemon","57":"philemon",
    "hebrews":"hebrews","heb":"hebrews","58":"hebrews",
    "james":"james","jas":"james","jam":"james","59":"james",
    "1 peter":"1peter","1peter":"1peter","1 pet":"1peter","1pe":"1peter","60":"1peter",
    "2 peter":"2peter","2peter":"2peter","2 pet":"2peter","2pe":"2peter","61":"2peter",
    "1 john":"1john","1john":"1john","1 jn":"1john","1jn":"1john","62":"1john",
    "2 john":"2john","2john":"2john","2 jn":"2john","2jn":"2john","63":"2john",
    "3 john":"3john","3john":"3john","3 jn":"3john","3jn":"3john","64":"3john",
    "jude":"jude","jud":"jude","65":"jude",
    "revelation":"revelation","rev":"revelation","re":"revelation","66":"revelation"
  };

  async function init() {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        translationsMetadata = await fetchJSON("translations-index.json?v=20260520-net");
        loadFromCache();
      } catch (error) {
        console.warn("Translations module init failed:", error);
        translationsMetadata = { translations: [] };
      }
      return translationsMetadata;
    })();
    return initPromise;
  }

  async function fetchJSON(url) {
    const response = await fetch(url, { cache: "default" });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    return response.json();
  }

  function getAvailableTranslations() {
    return translationsMetadata?.translations || [];
  }

  async function loadTranslation(translationId) {
    await init();
    if (translationsCache[translationId]) return translationsCache[translationId];
    if (translationLoadPromises[translationId]) return translationLoadPromises[translationId];

    const meta = getAvailableTranslations().find(t => t.id === translationId);
    if (!meta) throw new Error(`Translation not found: ${translationId}`);

    const loadPromise = (async () => {
      const urls = [meta.file, meta.source_url, ...(meta.fallback_urls || [])].filter(Boolean);
      const errors = [];
      for (const url of urls) {
        try {
          console.log(`Loading translation ${translationId} from ${url}`);
          const raw = await fetchJSON(url);
          const normalized = normalizeTranslationData(raw, meta);
          if (!normalized || Object.keys(normalized).length === 0) {
            throw new Error("No verses found after normalization");
          }
          translationsCache[translationId] = normalized;
          saveToCache(translationId, normalized);
          console.log(`Loaded ${translationId}: ${Object.keys(normalized).length} verses`);
          return normalized;
        } catch (error) {
          errors.push(`${url}: ${error.message}`);
          console.warn(`Could not load ${translationId} from ${url}:`, error);
        }
      }
      throw new Error(`All sources failed for ${translationId}: ${errors.join(" | ")}`);
    })();

    translationLoadPromises[translationId] = loadPromise;
    try {
      return await loadPromise;
    } finally {
      delete translationLoadPromises[translationId];
    }
  }

  async function getVerseText(verseId, translationId) {
    if (translationId === "basileia") return null;
    const trans = await loadTranslation(translationId);
    return trans[normalizeVerseId(verseId)] || null;
  }

  function normalizeTranslationData(raw, meta = {}) {
    if (!raw) return {};

    if (!Array.isArray(raw) && typeof raw === "object") {
      const keys = Object.keys(raw);
      const sampleKey = keys.find(k => /^[1-3]?[a-z]+\.\d+\.\d+[a-z]?$/.test(k));
      if (sampleKey) {
        const out = {};
        for (const [key, value] of Object.entries(raw)) {
          if (typeof value === "string") out[normalizeVerseId(key)] = cleanVerseText(value);
        }
        return out;
      }
    }

    const structured = normalizeStructuredBooks(raw);
    if (Object.keys(structured).length) return structured;

    const tableData = extractBookAndVerseTables(raw, meta);
    if (tableData.books.length && tableData.verses.length) {
      const bookById = new Map();
      for (const book of tableData.books) {
        const id = pick(book, ["id", "book_id", "bookId", "number"]);
        const name = pick(book, ["name", "book", "title", "book_name", "bookName"]);
        if (id !== undefined && name !== undefined) bookById.set(String(id), normalizeBook(name));
      }
      const out = {};
      for (const row of tableData.verses) {
        const chapter = pick(row, ["chapter", "c", "chap"]);
        const verse = pick(row, ["verse", "v", "verse_start"]);
        const text = pick(row, ["text", "t", "verse_text", "content"]);
        let book = pick(row, ["book", "book_name", "bookName"]);
        const bookId = pick(row, ["book_id", "bookId", "bookid", "b"]);
        if (!book && bookId !== undefined) book = bookById.get(String(bookId));
        if (book && chapter !== undefined && verse !== undefined && text !== undefined) {
          out[toVerseId(book, chapter, verse)] = cleanVerseText(String(text));
        }
      }
      return out;
    }

    const resultsetRows = raw?.resultset?.row || raw?.resultSet?.row || raw?.rows;
    if (Array.isArray(resultsetRows)) {
      const out = {};
      for (const row of resultsetRows) {
        const fields = Array.isArray(row.field) ? row.field : null;
        if (fields && fields.length >= 5) {
          out[toVerseId(fields[1], fields[2], fields[3])] = cleanVerseText(String(fields[4] ?? ""));
        }
      }
      return out;
    }

    if (Array.isArray(raw)) return normalizeRows(raw);

    if (typeof raw === "object") {
      for (const value of Object.values(raw)) {
        if (Array.isArray(value)) {
          const out = normalizeRows(value);
          if (Object.keys(out).length) return out;
        }
      }
    }

    return {};
  }

  function normalizeStructuredBooks(raw) {
    const books = raw?.books || raw?.Books || raw?.translation?.books;
    if (!Array.isArray(books)) return {};

    const out = {};
    for (let bookIndex = 0; bookIndex < books.length; bookIndex++) {
      const book = books[bookIndex];
      if (!book || typeof book !== "object") continue;
      const bookName = pick(book, ["name", "book", "title", "book_name", "bookName", "abbrev", "abbr"]) || String(bookIndex + 1);
      const chapters = book.chapters || book.Chapters || book.c || book.chapter;
      if (!Array.isArray(chapters)) continue;

      for (let chapterIndex = 0; chapterIndex < chapters.length; chapterIndex++) {
        const chapterObj = chapters[chapterIndex];
        if (!chapterObj) continue;
        const chapterNumber = pick(chapterObj, ["chapter", "number", "chapter_number", "chapterNumber", "id", "c"]) || (chapterIndex + 1);
        const verses = Array.isArray(chapterObj)
          ? chapterObj
          : (chapterObj.verses || chapterObj.Verses || chapterObj.v || chapterObj.verse);
        if (!Array.isArray(verses)) continue;

        for (let verseIndex = 0; verseIndex < verses.length; verseIndex++) {
          const verseObj = verses[verseIndex];
          if (verseObj === null || verseObj === undefined) continue;
          let verseNumber = verseIndex + 1;
          let text = "";
          if (typeof verseObj === "string") {
            text = verseObj;
          } else if (typeof verseObj === "object") {
            verseNumber = pick(verseObj, ["verse", "number", "verse_number", "verseNumber", "id", "v"]) || verseNumber;
            text = pick(verseObj, ["text", "t", "verse_text", "content", "paragraph", "words"]);
            if (Array.isArray(text)) text = text.map(item => typeof item === "string" ? item : (item?.text || item?.word || "")).join(" ");
          }
          if (text !== undefined && text !== null && String(text).trim()) {
            out[toVerseId(bookName, chapterNumber, verseNumber)] = cleanVerseText(String(text));
          }
        }
      }
    }
    return out;
  }

  function extractBookAndVerseTables(raw, meta) {
    const out = { books: [], verses: [] };
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    const keys = Object.keys(raw);
    const lowerId = String(meta.id || "").toLowerCase();
    const booksKey = keys.find(k => k.toLowerCase() === "books") ||
      keys.find(k => k.toLowerCase().endsWith("_books") && (!lowerId || k.toLowerCase().startsWith(lowerId))) ||
      keys.find(k => k.toLowerCase().endsWith("books"));
    const versesKey = keys.find(k => k.toLowerCase() === "verses") ||
      keys.find(k => k.toLowerCase().endsWith("_verses") && (!lowerId || k.toLowerCase().startsWith(lowerId))) ||
      keys.find(k => k.toLowerCase().endsWith("verses"));
    if (booksKey && Array.isArray(raw[booksKey])) out.books = raw[booksKey];
    if (versesKey && Array.isArray(raw[versesKey])) out.verses = raw[versesKey];
    return out;
  }

  function normalizeRows(rows) {
    const out = {};
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const book = pick(row, ["book", "b", "book_name", "bookName"]);
      const chapter = pick(row, ["chapter", "c", "chap"]);
      const verse = pick(row, ["verse", "v"]);
      const text = pick(row, ["text", "t", "verse_text", "content"]);
      if (book && chapter !== undefined && verse !== undefined && text !== undefined) {
        out[toVerseId(book, chapter, verse)] = cleanVerseText(String(text));
      }
    }
    return out;
  }

  function pick(obj, names) {
    for (const name of names) {
      if (obj && Object.prototype.hasOwnProperty.call(obj, name) && obj[name] !== null && obj[name] !== "") return obj[name];
    }
    return undefined;
  }

  function normalizeBook(raw) {
    if (raw === undefined || raw === null) return "";
    const cleaned = String(raw).trim().replace(/_/g, " ").replace(/\s+/g, " ");
    const key = cleaned.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
    return BOOK_MAP[key] || BOOK_MAP[key.replace(/\s+/g, "")] || key.replace(/[^a-z0-9]/g, "");
  }

  function toVerseId(book, chapter, verse) {
    return `${normalizeBook(book)}.${String(chapter).trim()}.${String(verse).trim().toLowerCase()}`;
  }

  function normalizeVerseId(verseId) {
    const parts = String(verseId).split(".");
    if (parts.length < 3) return verseId;
    return `${normalizeBook(parts[0])}.${parts[1]}.${parts.slice(2).join(".").toLowerCase()}`;
  }

  function cleanVerseText(text) {
    return String(text)
      .replace(/<[^>]+>/g, "")
      .replace(/\{[^}]+\}/g, "")
      .replace(/\[[A-Z0-9]+:[^\]]+\]/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function saveToCache(translationId, data) {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      cache[translationId] = { data, timestamp: Date.now() };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    } catch (e) { console.warn("Failed to save translation to cache:", e); }
  }

  function loadFromCache() {
    try {
      const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      for (const [id, entry] of Object.entries(cache)) {
        if (entry?.data && Date.now() - entry.timestamp < CACHE_EXPIRY) translationsCache[id] = entry.data;
      }
    } catch (e) { console.warn("Failed to load translations from cache:", e); }
  }

  async function loadStrongs(language = "grc") {
    if (strongsCache[language]) return strongsCache[language];
    const file = language === "grc" ? "lexicons/strongs-grc.json" : "lexicons/strongs-cop.json";
    try {
      const data = await fetchJSON(file);
      strongsCache[language] = data;
      return data;
    } catch (error) {
      console.warn(`Strong's index not available for ${language}:`, error);
      return {};
    }
  }

  async function getStrongs(word, language = "grc") {
    const index = await loadStrongs(language);
    return index[word] || index[String(word).toLowerCase()] || null;
  }

  async function getStrongsDefinition(strongsNum) {
    try {
      const index = await fetchJSON("lexicons/strongs-index.json");
      if (index[strongsNum]) return index[strongsNum];
    } catch (e) {}
    return {
      number: strongsNum,
      definition: `Look up ${strongsNum} on BlueLetterBible.org`,
      url: `https://www.blueletterbible.org/lexicon/${encodeURIComponent(strongsNum)}/`
    };
  }

  function isLoaded(translationId) { return !!translationsCache[translationId]; }
  function getLoadedTranslations() { return Object.keys(translationsCache); }

  // ---------------------------------------------------------------------------
  // NET Bible footnote loading (per-book lazy loading)
  // ---------------------------------------------------------------------------

  const netNotesCache = {};

  async function loadNetNotes(bookKey) {
    if (netNotesCache[bookKey]) return netNotesCache[bookKey];
    const resp = await fetch(`translations/net-notes/${encodeURIComponent(bookKey)}.json`);
    if (!resp.ok) throw new Error(`${resp.status}: net-notes/${bookKey}.json`);
    const notes = await resp.json();
    netNotesCache[bookKey] = notes;
    return notes;
  }

  async function getNetNote(noteId, bookKey) {
    const notes = await loadNetNotes(bookKey);
    return notes[noteId] ?? null;
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
    getLoadedTranslations,
    normalizeTranslationData,
    normalizeBook,
    toVerseId,
    loadNetNotes,
    getNetNote
  };
})();

window.TranslationsModule = TranslationsModule;
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => TranslationsModule.init());
} else {
  TranslationsModule.init();
}
