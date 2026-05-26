
(() => {
  const DATA = window.BASILEIAN_DATA;
  if (!DATA) {
    document.body.innerHTML = "<p>Reader data failed to load. Make sure data.js is present in the same folder as index.html.</p>";
    return;
  }

  const STORAGE_HIGHLIGHTS = "basileian.reader.v2.highlights";
  const STORAGE_THEME = "basileian.reader.v2.theme";
  const STORAGE_TRANSLATION = "basileian.reader.v2.activeTranslation";
  const STORAGE_BOOKMARK = "basileian.reader.v2.lastPosition";
  const STORAGE_CROSSREF = "basileian.reader.v2.crossRef";
  const STORAGE_COMMENTARY = "basileian.reader.v2.commentary";

  const sections = DATA.sections;
  const books = DATA.books;
  const sectionById = new Map(sections.map(section => [section.id, section]));
  const bookByName = new Map(books.map(book => [book.name, book]));

  const OT_BOOK_KEYS = [
    'genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth',
    '1samuel','2samuel','1kings','2kings','1chronicles','2chronicles','ezra',
    'nehemiah','esther','job','psalms','proverbs','ecclesiastes','songofsolomon',
    'isaiah','jeremiah','lamentations','ezekiel','daniel','hosea','joel','amos',
    'obadiah','jonah','micah','nahum','habakkuk','zephaniah','haggai','zechariah','malachi'
  ];

  const OT_CHAPTER_COUNTS = {
    genesis:50,exodus:40,leviticus:27,numbers:36,deuteronomy:34,
    joshua:24,judges:21,ruth:4,'1samuel':31,'2samuel':24,
    '1kings':22,'2kings':25,'1chronicles':29,'2chronicles':36,
    ezra:10,nehemiah:13,esther:10,job:42,psalms:150,
    proverbs:31,ecclesiastes:12,songofsolomon:8,
    isaiah:66,jeremiah:52,lamentations:5,ezekiel:48,daniel:12,
    hosea:14,joel:3,amos:9,obadiah:1,jonah:4,micah:7,
    nahum:3,habakkuk:3,zephaniah:3,haggai:2,zechariah:14,malachi:4
  };

  const state = {
    tab: "reader",
    book: books[0]?.name || "",
    chapter: books[0]?.chapters?.[0] || "All",
    currentSectionId: books[0]?.sectionIds?.[0] || null,
    chapterMode: true,
    activeSearchTerm: "",
    highlights: loadHighlights(),
    activeTranslation: "basileia", // "basileia" | "kjv" | "asv" | etc.
    translationsLoading: {}, // Track which translations are loading
    translationRenderRequest: 0,
    verseWords: null,     // lazy-loaded from lexicons/verse-words.json; null = not yet attempted
    ntConcordance: null,  // lazy-loaded from lexicons/strongs-nt-concordance.json
    otConcordance: null,  // lazy-loaded from lexicons/strongs-ot-concordance.json
    otVerseStrongs: null, // lazy-loaded from lexicons/ot-verse-strongs.json
    otBook: null,         // active OT book key, or null when in corpus mode
    otChapter: 1,
    lastGreekVerses: null,
    crossRefEnabled: false,
    activeCommentary: 'jfb'
  };

  const els = {
    docSubtitle: document.getElementById("docSubtitle"),
    navToggle: document.getElementById("navToggle"),
    closeSidebar: document.getElementById("closeSidebar"),
    sidebar: document.getElementById("sidebar"),
    bookSelect: document.getElementById("bookSelect"),
    chapterList: document.getElementById("chapterList"),
    passageList: document.getElementById("passageList"),
    verseList: document.getElementById("verseList"),
    gotoInput: document.getElementById("gotoInput"),
    gotoBtn: document.getElementById("gotoBtn"),
    gotoMessage: document.getElementById("gotoMessage"),
    readerContent: document.getElementById("readerContent"),
    notesList: document.getElementById("notesList"),
    sourceText: document.getElementById("sourceText"),
    searchInput: document.getElementById("searchInput"),
    clearSearch: document.getElementById("clearSearch"),
    searchSummary: document.getElementById("searchSummary"),
    searchResults: document.getElementById("searchResults"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    chapterModeBtn: document.getElementById("chapterModeBtn"),
    selectionMenu: document.getElementById("selectionMenu"),
    selectionHeader: document.getElementById("selectionHeader"),
    selectionRangeLabel: document.getElementById("selectionRangeLabel"),
    menuInterlinearBtn: document.getElementById("menuInterlinearBtn"),
    menuBibleVersesBtn: document.getElementById("menuBibleVersesBtn"),
    menuCommentaryBtn: document.getElementById("menuCommentaryBtn"),
    menuHighlightBtn: document.getElementById("menuHighlightBtn"),
    menuNoteBtn: document.getElementById("menuNoteBtn"),
    selectionCloseBtn: document.getElementById("selectionCloseBtn"),
    modalBackdrop: document.getElementById("modalBackdrop"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modalTitle"),
    modalBody: document.getElementById("modalBody"),
    modalActions: document.getElementById("modalActions"),
    modalClose: document.getElementById("modalClose"),
    themeToggle: document.getElementById("themeToggle"),
    translationSelect: document.getElementById("translationSelect"),
    translationStatus: document.getElementById("translationStatus"),
    crossRefBtn: document.getElementById("crossRefBtn")
  };

  function init() {
    els.docSubtitle.textContent = DATA.subtitle || DATA.title;
    applyStoredTheme();
    bindEvents();
    renderBookSelect();
    restoreTranslationPreference();
    restoreCrossRefPreference();
    renderTranslationSelector();
    restoreLastPosition();
    restoreFromHash();
    setCurrentSectionIfMissing();
    renderAll();
    loadVerseWords(); // async: re-renders when lexicons/verse-words.json is ready

    // Translation metadata loads asynchronously from translations-index.json.
    // Render once immediately, then refresh the selector when metadata finishes loading.
    if (window.TranslationsModule && typeof TranslationsModule.init === "function") {
      Promise.resolve(TranslationsModule.init()).then(() => {
        renderTranslationSelector();
        els.translationSelect.value = state.activeTranslation;
        if (state.activeTranslation !== "basileia") renderReader();
      }).catch(error => {
        console.warn("Translations module did not finish initializing:", error);
      });
    }

    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
      navigator.serviceWorker.register("sw.js?v=20260508-fix4").catch(() => {});
    }
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach(button => {
      button.addEventListener("click", () => setTab(button.dataset.tab));
    });

    els.navToggle.addEventListener("click", () => els.sidebar.classList.add("open"));
    els.closeSidebar.addEventListener("click", () => els.sidebar.classList.remove("open"));

    els.bookSelect.addEventListener("change", () => {
      const val = els.bookSelect.value;
      if (val.startsWith("__ot__")) {
        state.otBook = val.slice(6);
        state.otChapter = 1;
        updateHash();
        renderAll();
        closeSidebarOnMobile();
        return;
      }
      state.otBook = null;
      state.book = val;
      state.chapter = getBook(state.book)?.chapters?.[0] || "All";
      state.chapterMode = true;
      state.currentSectionId = getSectionsInChapter(state.book, state.chapter)[0]?.id || getBook(state.book)?.sectionIds?.[0] || null;
      updateHash();
      renderAll();
      closeSidebarOnMobile();
    });

    els.gotoBtn.addEventListener("click", goToReference);
    els.gotoInput.addEventListener("keydown", event => {
      if (event.key === "Enter") goToReference();
    });

    els.searchInput.addEventListener("input", debounce(() => {
      state.activeSearchTerm = els.searchInput.value.trim();
      renderSearch();
      if (state.activeSearchTerm.length === 0) renderReader();
    }, 150));

    els.clearSearch.addEventListener("click", () => {
      els.searchInput.value = "";
      state.activeSearchTerm = "";
      renderSearch();
      renderReader();
    });

    els.prevBtn.addEventListener("click", goPrevious);
    els.nextBtn.addEventListener("click", goNext);
    els.chapterModeBtn.addEventListener("click", () => {
      state.chapterMode = !state.chapterMode;
      renderAll();
    });

    if (els.crossRefBtn) {
      els.crossRefBtn.addEventListener("click", () => {
        state.crossRefEnabled = !state.crossRefEnabled;
        localStorage.setItem(STORAGE_CROSSREF, state.crossRefEnabled ? "1" : "");
        updateCrossRefButton();
        renderReader();
      });
    }

    // Translation selector
    els.translationSelect.addEventListener("change", () => {
      state.activeTranslation = els.translationSelect.value;
      localStorage.setItem(STORAGE_TRANSLATION, state.activeTranslation);
      updateTranslationStatus("");
      renderReader(); // Re-render with new translation
    });

    els.menuHighlightBtn.addEventListener("click", () => commitHighlight(false));
    els.menuNoteBtn.addEventListener("click", () => commitHighlight(true));
    els.menuInterlinearBtn.addEventListener("click", () => { const verses = _menuSelectionVerses.slice(); hideSelectionMenu(); if (verses.length) openInterlinearModal(verses); });
    els.menuBibleVersesBtn.addEventListener("click", () => { const verses = _menuSelectionVerses.slice(); hideSelectionMenu(); if (verses.length) showBibleVersesForVerses(verses); });
    els.menuCommentaryBtn.addEventListener("click", () => { const verses = _menuSelectionVerses.slice(); hideSelectionMenu(); if (verses.length) showCommentaryForVerses(verses); });

    // Close button restores selection and enables native Safari callout menu.
    els.selectionCloseBtn.addEventListener("click", () => hideSelectionMenu(true));

    // selectionchange fires on every text selection change (drag, double-tap, etc.).
    // When the menu is open and selection is cleared (e.g. outside tap), restore the
    // saved range so the menu can still act on it. When a new non-empty selection
    // settles, show/update our menu instead of the system callout.
    document.addEventListener('selectionchange', () => {
      if (_programmaticSelection) return;
      const menuVisible = !els.selectionMenu.classList.contains('hidden');
      const sel = window.getSelection();

      if (menuVisible && (!sel || sel.isCollapsed)) {
        if (_savedSelectionRange) {
          _programmaticSelection = true;
          sel.removeAllRanges();
          sel.addRange(_savedSelectionRange.cloneRange());
          setTimeout(() => { _programmaticSelection = false; }, 0);
        }
        return;
      }

      if (!sel || sel.isCollapsed || !sel.toString().trim()) return;

      clearTimeout(_selectionDebounceTimer);
      _selectionDebounceTimer = setTimeout(updateSelectionMenu, 350);
    });

    els.modalClose.addEventListener("click", closeModal);
    els.modalBackdrop.addEventListener("click", closeModal);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { closeModal(); hideSelectionMenu(); }
    });

    // Delegated handler for NET Bible footnote buttons (added to DOM asynchronously)
    els.readerContent.addEventListener("click", event => {
      const btn = event.target.closest(".net-note-link");
      if (btn) {
        event.preventDefault();
        openNetNote(btn.dataset.netNote, btn.dataset.bookKey);
      }
    });

    els.themeToggle.addEventListener("click", toggleTheme);

    window.addEventListener("hashchange", () => {
      restoreFromHash();
      renderAll();
    });
  }

  function renderTranslationSelector() {
    const translations = window.TranslationsModule && typeof TranslationsModule.getAvailableTranslations === "function"
      ? TranslationsModule.getAvailableTranslations()
      : [];
    
    // Always include basileia
    const options = [
      { id: "basileia", name: "Basileia (Original Languages)" },
      ...translations.map(t => ({ id: t.id, name: t.name }))
    ];

    els.translationSelect.innerHTML = options
      .map(opt => `<option value="${escapeAttr(opt.id)}">${escapeHTML(opt.name)}</option>`)
      .join("");

    if (!options.some(opt => opt.id === state.activeTranslation)) {
      state.activeTranslation = "basileia";
      localStorage.setItem(STORAGE_TRANSLATION, state.activeTranslation);
    }

    els.translationSelect.value = state.activeTranslation;
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tab").forEach(button => button.classList.toggle("active", button.dataset.tab === tab));
    document.querySelectorAll(".tab-panel").forEach(panel => panel.classList.toggle("active", panel.id === `${tab}Tab`));
    if (tab === "notes") renderNotes();
    if (tab === "source") renderSource();
  }

  function renderAll() {
    renderNav();
    if (state.otBook) {
      renderOTChapter(state.otBook, state.otChapter);
    } else {
      renderReader();
    }
    renderSearch();
    renderNotes();
  }

  function renderBookSelect() {
    const corpusOptions = books.map(book =>
      `<option value="${escapeAttr(book.name)}">${escapeHTML(book.name)}</option>`
    ).join("");
    const otOptions = OT_BOOK_KEYS.map(key => {
      const display = BOOK_DISPLAY_NAMES[key] || key;
      return `<option value="__ot__${escapeAttr(key)}">${escapeHTML(display)}</option>`;
    }).join("");
    els.bookSelect.innerHTML =
      `<optgroup label="Basileian Canon">${corpusOptions}</optgroup>` +
      `<optgroup label="Old Testament (NET)">${otOptions}</optgroup>`;
  }

  function renderOTNav() {
    els.bookSelect.value = `__ot__${state.otBook}`;

    const maxCh = OT_CHAPTER_COUNTS[state.otBook] || 1;
    els.chapterList.innerHTML = Array.from({ length: maxCh }, (_, i) => {
      const ch = i + 1;
      const active = ch === state.otChapter;
      return `<button class="chip${active ? " active" : ""}" data-ot-chapter="${ch}">${ch}</button>`;
    }).join("");

    els.chapterList.querySelectorAll("[data-ot-chapter]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.otChapter = parseInt(btn.dataset.otChapter, 10);
        renderAll();
        closeSidebarOnMobile();
      });
    });

    els.passageList.innerHTML = "";
    els.verseList.innerHTML = "";
  }

  function renderNav() {
    if (state.otBook) {
      renderOTNav();
      return;
    }
    const book = getBook(state.book);
    if (!book) return;

    els.bookSelect.value = state.book;

    els.chapterList.innerHTML = book.chapters.map(chapter => {
      const active = String(chapter) === String(state.chapter);
      return `<button class="chip ${active ? "active" : ""}" data-chapter="${escapeAttr(chapter)}">${escapeHTML(chapterLabel(state.book, chapter))}</button>`;
    }).join("");

    els.chapterList.querySelectorAll("[data-chapter]").forEach(button => {
      button.addEventListener("click", () => {
        state.chapter = button.dataset.chapter;
        state.chapterMode = true;
        state.currentSectionId = getSectionsInChapter(state.book, state.chapter)[0]?.id || state.currentSectionId;
        updateHash();
        renderAll();
        closeSidebarOnMobile();
      });
    });

    const visibleSections = getVisibleSections();
    els.passageList.innerHTML = visibleSections.map(section => {
      const active = section.id === state.currentSectionId;
      return `<button class="passage-item ${active ? "active" : ""}" data-section-id="${escapeAttr(section.id)}">
        <strong>${escapeHTML(displayRef(section))}</strong>
        <span>${escapeHTML(section.title || section.heading)}</span>
      </button>`;
    }).join("");

    els.passageList.querySelectorAll("[data-section-id]").forEach(button => {
      button.addEventListener("click", () => {
        const section = sectionById.get(button.dataset.sectionId);
        if (!section) return;
        state.book = section.book;
        state.chapter = section.startChapter || "All";
        state.currentSectionId = section.id;
        state.chapterMode = false;
        updateHash();
        renderAll();
        scrollToSection(section.id);
        closeSidebarOnMobile();
      });
    });

    const verseMarkers = getVisibleSections().flatMap(section => {
      return (section.verseMarkers || []).filter(v => state.chapter === "All" || String(v.chapter) === String(state.chapter))
        .map(v => ({...v, sectionId: section.id}));
    });

    els.verseList.innerHTML = verseMarkers.map(marker => {
      return `<button class="chip" data-section-id="${escapeAttr(marker.sectionId)}" data-anchor="${escapeAttr(marker.anchor)}">${escapeHTML(marker.verse)}</button>`;
    }).join("");

    els.verseList.querySelectorAll("[data-anchor]").forEach(button => {
      button.addEventListener("click", () => {
        state.currentSectionId = button.dataset.sectionId;
        state.chapterMode = false;
        updateHash(button.dataset.anchor);
        renderAll();
        setTimeout(() => scrollToAnchor(button.dataset.anchor), 50);
        closeSidebarOnMobile();
      });
    });
  }

  function renderReader() {
    const visibleSections = getVisibleSections();
    if (!visibleSections.length) {
      els.readerContent.innerHTML = `<div class="chapter-heading"><span class="eyebrow">No passages</span><h2>${escapeHTML(state.book || "Reader")}</h2></div>`;
      return;
    }

    const currentSection = sectionById.get(state.currentSectionId) || visibleSections[0];
    if (!state.currentSectionId || !visibleSections.some(s => s.id === state.currentSectionId)) {
      state.currentSectionId = currentSection.id;
    }

    const book = getBook(state.book);
    const title = state.chapterMode
      ? `${state.book}${state.chapter !== "All" ? " " + chapterLabel(state.book, state.chapter) : ""}`
      : displayRef(currentSection);

    const subtitle = state.chapterMode
      ? `${visibleSections.length} passage${visibleSections.length === 1 ? "" : "s"}`
      : (currentSection.title || currentSection.heading);

    const heading = `<header class="${state.chapterMode ? "chapter-heading" : "section-heading"}">
      <span class="eyebrow">${escapeHTML(state.chapterMode ? "Chapter view" : "Passage view")}</span>
      <h2>${escapeHTML(title)}</h2>
      <p class="muted">${escapeHTML(subtitle)}</p>
    </header>`;

    const sectionsToRender = state.chapterMode ? visibleSections : [currentSection];

    els.readerContent.innerHTML = heading + sectionsToRender.map(section => renderPassage(section)).join("");
    els.chapterModeBtn.textContent = state.chapterMode ? "Passage view" : "Chapter view";

    attachDynamicReaderEvents();
    applyVisibleHighlights();
    if (state.activeSearchTerm.length >= 2) applySearchHighlight(els.readerContent, state.activeSearchTerm);

    if (state.activeTranslation !== "basileia") {
      hydrateTranslatedPassages();
    } else {
      updateTranslationStatus("");
    }

    if (state.crossRefEnabled) {
      hydrateCrossRefPanels();
    }
  }

  function renderPassage(section) {
    let html;
    if (state.activeTranslation !== "basileia" && canTranslateSection(section)) {
      html = renderTranslatedPassage(section);
    } else {
      html = renderOriginalPassage(section, state.activeTranslation !== "basileia");
    }
    if (state.crossRefEnabled && canTranslateSection(section)) {
      html += renderCrossRefPanel(section);
    }
    return html;
  }

  function renderOriginalPassage(section, withNotice = false) {
    const source = section.source ? `<span class="source-pill">${escapeHTML(section.source)}</span>` : "";
    const tier = section.tier ? `<span class="source-pill">${escapeHTML(section.tier.replace(/^Tier /, "Tier "))}</span>` : "";
    const paragraphs = section.paragraphs.map(p => `<p>${formatParagraph(p, section)}</p>`).join("");
    const notice = withNotice
      ? `<p class="translation-notice">This passage does not map cleanly to a standard Bible translation, so the Basileian text is shown.</p>`
      : "";
    return `<section class="passage" id="${escapeAttr(section.id)}" data-section-id="${escapeAttr(section.id)}">
      <h3>${escapeHTML(displayRef(section))}${section.title ? ` — ${escapeHTML(section.title)}` : ""}</h3>
      <div class="passage-meta">${source}${tier}</div>
      ${notice}
      <div class="passage-body" data-section-id="${escapeAttr(section.id)}">${paragraphs}</div>
    </section>`;
  }

  // ---------------------------------------------------------------------------
  // Greek-with-Strong's lookup
  //
  // lexicons/verse-words.json maps verse_id → [{text, strongs?}] for every
  // Greek verse in the corpus (generated by scripts/build-lexicons.js).
  // We lazy-load it once on init. When the user selects English text and
  // clicks "Show Greek", we figure out which verses the selection covers and
  // open a modal that renders each verse's Greek word-by-word, with each word
  // clickable for a full Strong's definition.
  // ---------------------------------------------------------------------------

  async function loadVerseWords() {
    if (state.verseWords !== null) return; // already loaded or attempted
    state.verseWords = {}; // mark as attempted; empty object is safe to read
    try {
      const resp = await fetch("lexicons/verse-words.json");
      if (!resp.ok) return;
      state.verseWords = await resp.json();
      // Re-evaluate the toolbar in case a selection is already active.
      updateSelectionToolbar();
    } catch {
      // silently ignore — the Show Greek button just won't appear
    }
  }

  async function loadNtConcordance() {
    if (state.ntConcordance !== null) return state.ntConcordance;
    state.ntConcordance = {};
    try {
      const resp = await fetch("lexicons/strongs-nt-concordance.json", { cache: "default" });
      if (resp.ok) state.ntConcordance = await resp.json();
    } catch {
      // file not yet generated; Bible button will show a graceful message
    }
    return state.ntConcordance;
  }

  async function loadOtConcordance() {
    if (state.otConcordance !== null) return state.otConcordance;
    state.otConcordance = {};
    try {
      const resp = await fetch("lexicons/strongs-ot-concordance.json", { cache: "default" });
      if (resp.ok) state.otConcordance = await resp.json();
    } catch { }
    return state.otConcordance;
  }

  async function loadOtVerseStrongs() {
    if (state.otVerseStrongs !== null) return state.otVerseStrongs;
    state.otVerseStrongs = {};
    try {
      const resp = await fetch("lexicons/ot-verse-strongs.json", { cache: "default" });
      if (resp.ok) state.otVerseStrongs = await resp.json();
    } catch { }
    return state.otVerseStrongs;
  }

  // Convert a runtime section.book name to the dot-delimited prefix used in
  // verse_id values (e.g. "Mark" → "mark", "1 Corinthians" → "1corinthians").
  function bookToVerseIdPrefix(bookName) {
    return (bookName || "").toLowerCase().replace(/\s+/g, "");
  }

  // Walk every .verse-number marker inside the section body and return the
  // verses (in order) that fall inside the given selection range.
  function findVersesInSelection(range) {
    const body = closestPassageBody(range.commonAncestorContainer);
    if (!body) return [];
    const section = sectionById.get(body.dataset.sectionId);
    if (!section) return [];

    const markers = [...body.querySelectorAll(".verse-number[data-chapter][data-verse]")];
    if (!markers.length) return [];

    let startIdx = -1;
    let endIdx = -1;
    for (let i = 0; i < markers.length; i++) {
      const r = document.createRange();
      r.selectNode(markers[i]);
      // marker.start <= range.start → candidate for startIdx
      if (range.compareBoundaryPoints(Range.START_TO_START, r) >= 0) startIdx = i;
      // marker.start < range.end → marker falls inside selection on its leading edge
      if (range.compareBoundaryPoints(Range.END_TO_START, r) > 0) endIdx = i;
    }
    if (startIdx < 0) startIdx = 0;
    if (endIdx < startIdx) endIdx = startIdx;

    const verses = [];
    const seen = new Set();
    for (let i = startIdx; i <= endIdx; i++) {
      const m = markers[i];
      const ch = m.dataset.chapter;
      const v = m.dataset.verse;
      const verseId = `${bookToVerseIdPrefix(section.book)}.${ch}.${v}`;
      if (seen.has(verseId)) continue;
      seen.add(verseId);
      verses.push({
        verseId,
        reference: `${section.book} ${ch}:${v}`
      });
    }
    return verses;
  }

  // True if any verse in `verses` has loaded Greek word data.
  function anyVerseHasGreek(verses) {
    if (!state.verseWords) return false;
    return verses.some(v => Array.isArray(state.verseWords[v.verseId]) && state.verseWords[v.verseId].length > 0);
  }

  function formatVerseWordsHTML(verseWords) {
    if (!Array.isArray(verseWords) || verseWords.length === 0) return "";
    return verseWords.map(w => {
      if (!w || !w.text) return "";
      const greek = `<span class="sw-greek">${escapeHTML(w.text)}</span>`;
      const gloss = w.gloss ? `<span class="sw-gloss">${escapeHTML(w.gloss)}</span>` : `<span class="sw-gloss"></span>`;
      return w.strongs
        ? `<span class="source-word" data-strongs="${escapeAttr(w.strongs)}">${greek}${gloss}</span>`
        : `<span class="source-word">${greek}${gloss}</span>`;
    }).filter(Boolean).join(" ");
  }

  function transliterateGreek(text) {
    if (!text) return '';
    const map = {
      'α':'a','β':'b','γ':'g','δ':'d','ε':'e','ζ':'z','η':'ē','θ':'th',
      'ι':'i','κ':'k','λ':'l','μ':'m','ν':'n','ξ':'x','ο':'o','π':'p',
      'ρ':'r','σ':'s','ς':'s','τ':'t','υ':'y','φ':'ph','χ':'ch','ψ':'ps','ω':'ō',
    };
    return text.normalize('NFD')
      .replace(/[̀-ͯ᷀-᷿⃐-⃿︠-︯]/g, '')
      .toLowerCase()
      .replace(/[α-ωϲ]/gu, c => map[c] || c);
  }

  function buildInterlinearWordHTML(w) {
    if (!w || !w.text) return "";
    const greek = `<span class="iw-greek">${escapeHTML(w.text)}</span>`;
    const gloss = `<span class="iw-gloss">${escapeHTML(w.gloss || "")}</span>`;
    const translit = `<span class="iw-translit">${escapeHTML(transliterateGreek(w.text))}</span>`;
    const badge = w.strongs
      ? `<button class="iw-strongs" data-strongs="${escapeAttr(w.strongs)}">${escapeHTML(w.strongs)}</button>`
      : "";
    return `<span class="interlinear-word">${greek}${gloss}${translit}${badge}</span>`;
  }

  function openInterlinearModal(verses) {
    state.lastGreekVerses = verses;
    const body = verses.map(v => {
      const words = state.verseWords ? state.verseWords[v.verseId] : null;
      const wordsHTML = Array.isArray(words) && words.length
        ? `<div class="interlinear-words">${words.map(buildInterlinearWordHTML).filter(Boolean).join("")}</div>`
        : `<p class="interlinear-no-data">No interlinear data available for this passage.</p>`;
      return `<div class="interlinear-verse">
        <h4 class="interlinear-ref">${escapeHTML(v.reference)}</h4>
        ${wordsHTML}
      </div>`;
    }).join("");

    openModal("Interlinear", body, [
      { label: "Close", className: "button", onClick: closeModal }
    ]);

    els.modalBody.querySelectorAll(".iw-strongs[data-strongs]").forEach(badge => {
      badge.addEventListener("click", event => {
        event.stopPropagation();
        openStrongsModal(badge.dataset.strongs, verses);
      });
    });
  }

  // Back-compat alias used by openStrongsModal's back button.
  const openGreekVersesModal = (verses) => openInterlinearModal(verses);

  function showInterlinearForCurrentSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    const verses = findVersesInSelection(sel.getRangeAt(0));
    if (!verses.length) return;
    _savedSelectionRange = null;
    sel.removeAllRanges();
    hideSelectionMenu();
    openInterlinearModal(verses);
  }

  function showBibleVersesForCurrentSelection() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    const verses = findVersesInSelection(sel.getRangeAt(0));
    _savedSelectionRange = null;
    sel.removeAllRanges();
    hideSelectionMenu();
    if (verses.length) openBibleVersesModal(verses);
  }

  function showCommentaryForCurrentSelection() {
    const verses = _menuSelectionVerses;
    hideSelectionMenu();
    if (verses.length) openCommentaryModal(verses);
  }

  function showBibleVersesForVerses(verses) {
    if (verses.length) openBibleVersesModal(verses);
  }

  function showCommentaryForVerses(verses) {
    if (verses.length) openCommentaryModal(verses);
  }

  async function openCommentaryModal(verses) {
    const placeholderHTML = verses.map(v =>
      `<div class="commentary-entry">
        <p class="commentary-ref">${escapeHTML(v.reference)}</p>
        <p class="commentary-text loading" data-verse-id="${escapeAttr(v.verseId)}">Loading…</p>
      </div>`
    ).join("");

    openModal("Commentary (JFB)", placeholderHTML, [
      { label: "Close", className: "button", onClick: closeModal }
    ]);

    for (const v of verses) {
      const el = els.modalBody.querySelector(`.commentary-text[data-verse-id="${CSS.escape(v.verseId)}"]`);
      if (!el) continue;
      const text = await CommentaryModule.getVerseComment(v.verseId, "jfb").catch(() => null);
      el.textContent = text || "(No commentary found for this reference)";
      el.classList.remove("loading");
    }
  }

  async function openBibleVersesModal(verses) {
    const bodyId = "bibleVersesBody";
    const placeholderHTML = verses.map(v =>
      `<div class="bible-verse-entry">
        <p class="bible-verse-ref">${escapeHTML(v.reference)}</p>
        <p class="bible-verse-text loading" data-verse-id="${escapeAttr(v.verseId)}">Loading KJV…</p>
      </div>`
    ).join("");

    openModal("Bible Verses (KJV)", `<div id="${bodyId}">${placeholderHTML}</div>`, [
      { label: "Close", className: "button", onClick: closeModal }
    ]);

    for (const v of verses) {
      const el = els.modalBody.querySelector(`.bible-verse-text[data-verse-id="${CSS.escape(v.verseId)}"]`);
      if (!el) continue;
      try {
        const text = await TranslationsModule.getVerseText(v.verseId, "kjv");
        if (text) {
          el.textContent = text;
          el.classList.remove("loading");
        } else {
          el.textContent = "(No KJV text found for this reference)";
          el.classList.remove("loading");
        }
      } catch {
        el.textContent = "(Could not load verse text)";
        el.classList.remove("loading");
      }
    }
  }

  function findSectionByVerseId(verseId) {
    for (const [, section] of sectionById) {
      if (!Array.isArray(section.verseMarkers)) continue;
      for (const marker of section.verseMarkers) {
        const vid = translationVerseId(section, marker);
        if (vid === verseId) return section;
      }
    }
    return null;
  }

  async function openCorpusConcordance(strongsNum, backVerses) {
    if (!state.verseWords) {
      openModal("Corpus Concordance", "<p>Lexical data not loaded.</p>", [
        { label: "Close", className: "button", onClick: closeModal }
      ]);
      return;
    }

    const matches = [];
    for (const [verseId, words] of Object.entries(state.verseWords)) {
      if (!Array.isArray(words)) continue;
      if (words.some(w => w.strongs === strongsNum)) {
        matches.push({ verseId, words });
      }
    }

    if (matches.length === 0) {
      const body = `<p class="cc-no-results">No occurrences of ${escapeHTML(strongsNum)} found in this corpus.</p>`;
      const actions = [];
      if (backVerses) actions.push({ label: "← Back", className: "button secondary", onClick: () => openInterlinearModal(backVerses) });
      actions.push({ label: "Close", className: "button", onClick: closeModal });
      openModal(`Corpus: ${strongsNum}`, body, actions);
      return;
    }

    const rows = matches.map(({ verseId, words }) => {
      const section = findSectionByVerseId(verseId);
      const ref = section ? displayRef(section) : verseId;
      const wordsHTML = words.map(w =>
        `<span class="cc-word${w.strongs === strongsNum ? " target" : ""}">${escapeHTML(w.text || "")}</span>`
      ).join(" ");
      return `<button class="cc-result" data-verse-id="${escapeAttr(verseId)}">
        <span class="cc-ref">${escapeHTML(ref)}</span>
        <span class="cc-words">${wordsHTML}</span>
        <span class="cc-kjv loading" data-verse-id="${escapeAttr(verseId)}">Loading KJV…</span>
      </button>`;
    }).join("");

    const body = `<div class="concordance-results">${rows}</div>`;
    const actions = [];
    if (backVerses) actions.push({ label: "← Back", className: "button secondary", onClick: () => openInterlinearModal(backVerses) });
    actions.push({ label: "Close", className: "button", onClick: closeModal });

    openModal(`Corpus: ${strongsNum} (${matches.length})`, body, actions);

    els.modalBody.querySelectorAll(".cc-result[data-verse-id]").forEach(btn => {
      btn.addEventListener("click", () => {
        const vid = btn.dataset.verseId;
        const section = findSectionByVerseId(vid);
        if (section) {
          closeModal();
          state.book = section.book;
          state.chapter = section.startChapter || "All";
          state.currentSectionId = section.id;
          state.chapterMode = false;
          updateHash();
          renderAll();
          setTimeout(() => scrollToSection(section.id), 50);
        }
      });
    });

    for (const { verseId } of matches) {
      const el = els.modalBody.querySelector(`.cc-kjv[data-verse-id="${CSS.escape(verseId)}"]`);
      if (!el) continue;
      try {
        const text = await TranslationsModule.getVerseText(verseId, "kjv");
        if (text) { el.textContent = text; el.classList.remove("loading"); }
        else el.remove();
      } catch { el.remove(); }
    }
  }

  const BOOK_DISPLAY_NAMES = {
    genesis:'Genesis',exodus:'Exodus',leviticus:'Leviticus',numbers:'Numbers',
    deuteronomy:'Deuteronomy',joshua:'Joshua',judges:'Judges',ruth:'Ruth',
    '1samuel':'1 Samuel','2samuel':'2 Samuel','1kings':'1 Kings','2kings':'2 Kings',
    '1chronicles':'1 Chronicles','2chronicles':'2 Chronicles',ezra:'Ezra',
    nehemiah:'Nehemiah',esther:'Esther',job:'Job',psalms:'Psalms',
    proverbs:'Proverbs',ecclesiastes:'Ecclesiastes',songofsolomon:'Song of Solomon',
    isaiah:'Isaiah',jeremiah:'Jeremiah',lamentations:'Lamentations',
    ezekiel:'Ezekiel',daniel:'Daniel',hosea:'Hosea',joel:'Joel',amos:'Amos',
    obadiah:'Obadiah',jonah:'Jonah',micah:'Micah',nahum:'Nahum',
    habakkuk:'Habakkuk',zephaniah:'Zephaniah',haggai:'Haggai',
    zechariah:'Zechariah',malachi:'Malachi',
    matthew:'Matthew',mark:'Mark',luke:'Luke',john:'John',acts:'Acts',
    romans:'Romans','1corinthians':'1 Corinthians','2corinthians':'2 Corinthians',
    galatians:'Galatians',ephesians:'Ephesians',philippians:'Philippians',
    colossians:'Colossians','1thessalonians':'1 Thessalonians','2thessalonians':'2 Thessalonians',
    '1timothy':'1 Timothy','2timothy':'2 Timothy',titus:'Titus',philemon:'Philemon',
    hebrews:'Hebrews',james:'James','1peter':'1 Peter','2peter':'2 Peter',
    '1john':'1 John','2john':'2 John','3john':'3 John',jude:'Jude',revelation:'Revelation'
  };

  function verseIdToRef(verseId) {
    const [book, ch, v] = verseId.split('.');
    return `${BOOK_DISPLAY_NAMES[book] || book} ${ch}:${v}`;
  }

  async function openBibleConcordance(strongsNum, backVerses) {
    const backAction = backVerses
      ? [{ label: "← Back", className: "button secondary", onClick: () => openInterlinearModal(backVerses) }]
      : [];
    const closeAction = [{ label: "Close", className: "button", onClick: closeModal }];

    openModal(`Bible: ${strongsNum}`, `<p class="cc-no-results">Loading…</p>`, [...backAction, ...closeAction]);

    // H-prefix → OT Hebrew concordance
    if (strongsNum.startsWith("H")) {
      const concordance = await loadOtConcordance();
      const verseIds = concordance[strongsNum] || [];

      if (verseIds.length === 0) {
        openModal(
          `Bible: ${strongsNum}`,
          `<p class="cc-no-results">No OT occurrences of ${escapeHTML(strongsNum)} in index.</p>`,
          [...backAction, ...closeAction]
        );
        return;
      }

      const MAX = 250;
      const shown = verseIds.slice(0, MAX);
      const footer = verseIds.length > MAX
        ? `<p class="cc-no-results">Showing ${MAX} of ${verseIds.length} occurrences.</p>` : "";

      const rows = shown.map(verseId => {
        const ref = verseIdToRef(verseId);
        return `<button class="cc-result" data-verse-id="${escapeAttr(verseId)}" style="cursor:default">
          <span class="cc-ref">${escapeHTML(ref)}</span>
          <span class="cc-kjv loading" data-verse-id="${escapeAttr(verseId)}">Loading…</span>
        </button>`;
      }).join("");

      openModal(
        `Bible: ${strongsNum} (${verseIds.length})`,
        `<div class="concordance-results">${rows}${footer}</div>`,
        [...backAction, ...closeAction]
      );

      for (const verseId of shown) {
        const el = els.modalBody.querySelector(`.cc-kjv[data-verse-id="${CSS.escape(verseId)}"]`);
        if (!el) continue;
        try {
          const text = await TranslationsModule.getVerseText(verseId, "net");
          if (text) { el.textContent = text; el.classList.remove("loading"); }
          else el.remove();
        } catch { el.remove(); }
      }
      return;
    }

    // G-prefix → NT concordance
    const concordance = await loadNtConcordance();
    const verseIds = concordance[strongsNum] || [];

    if (verseIds.length === 0) {
      openModal(
        `Bible: ${strongsNum}`,
        `<p class="cc-no-results">No NT occurrences of ${escapeHTML(strongsNum)} in index.</p>`,
        [...backAction, ...closeAction]
      );
      return;
    }

    const MAX = 250;
    const shown = verseIds.slice(0, MAX);

    const rows = shown.map(verseId => {
      const ref = verseIdToRef(verseId);
      const inCorpus = findSectionByVerseId(verseId) !== null;
      return `<button class="cc-result" data-verse-id="${escapeAttr(verseId)}"${!inCorpus ? ' style="cursor:default"' : ''}>
        <span class="cc-ref">${escapeHTML(ref)}</span>
        <span class="cc-kjv loading" data-verse-id="${escapeAttr(verseId)}">Loading…</span>
      </button>`;
    }).join("");

    const footer = verseIds.length > MAX
      ? `<p class="cc-no-results">Showing ${MAX} of ${verseIds.length} occurrences.</p>` : "";

    openModal(
      `Bible: ${strongsNum} (${verseIds.length})`,
      `<div class="concordance-results">${rows}${footer}</div>`,
      [...backAction, ...closeAction]
    );

    // Click to navigate for corpus verses
    els.modalBody.querySelectorAll(".cc-result[data-verse-id]").forEach(btn => {
      const vid = btn.dataset.verseId;
      const section = findSectionByVerseId(vid);
      if (!section) return;
      btn.addEventListener("click", () => {
        closeModal();
        state.book = section.book;
        state.chapter = section.startChapter || "All";
        state.currentSectionId = section.id;
        state.chapterMode = false;
        updateHash();
        renderAll();
        setTimeout(() => scrollToSection(section.id), 50);
      });
    });

    // Async hydrate KJV text
    for (const verseId of shown) {
      const el = els.modalBody.querySelector(`.cc-kjv[data-verse-id="${CSS.escape(verseId)}"]`);
      if (!el) continue;
      try {
        const text = await TranslationsModule.getVerseText(verseId, "kjv");
        if (text) { el.textContent = text; el.classList.remove("loading"); }
        else el.remove();
      } catch { el.remove(); }
    }
  }

  async function renderOTChapter(book, chapter) {
    const bookDisplay = BOOK_DISPLAY_NAMES[book] || book;
    const heading = `<header class="chapter-heading">
      <span class="eyebrow">Old Testament — NET Bible</span>
      <h2>${escapeHTML(bookDisplay)} ${escapeHTML(String(chapter))}</h2>
      <p class="muted">Loading…</p>
    </header>`;
    els.readerContent.innerHTML = heading;
    els.chapterModeBtn.textContent = "Chapter view";

    if (!window.TranslationsModule) return;

    const verseTexts = [];
    for (let v = 1; v <= 200; v++) {
      const verseId = `${book}.${chapter}.${v}`;
      const text = await TranslationsModule.getVerseText(verseId, "net");
      if (!text) break;
      verseTexts.push({ v, verseId, text });
    }

    if (state.otBook !== book || state.otChapter !== chapter) return; // stale render

    if (!verseTexts.length) {
      els.readerContent.innerHTML = `<header class="chapter-heading">
        <span class="eyebrow">Old Testament — NET Bible</span>
        <h2>${escapeHTML(bookDisplay)} ${escapeHTML(String(chapter))}</h2>
        <p class="muted">No verses found.</p>
      </header>`;
      return;
    }

    const versesHTML = verseTexts.map(({ v, verseId, text }) => {
      const rendered = text.includes("⟦") ? renderNetVerseText(text, verseId) : escapeHTML(text);
      return `<p class="ot-verse" data-verse-id="${escapeAttr(verseId)}">
        <span class="verse-number ot-verse-num">${v}</span>
        <span class="ot-verse-text">${rendered}</span>
        <button class="ot-study-btn" data-verse-id="${escapeAttr(verseId)}" title="Hebrew word study">Study</button>
      </p>`;
    }).join("");

    const subtitle = `${verseTexts.length} verse${verseTexts.length === 1 ? "" : "s"} · NET Bible`;
    els.readerContent.innerHTML = `<header class="chapter-heading">
      <span class="eyebrow">Old Testament — NET Bible</span>
      <h2>${escapeHTML(bookDisplay)} ${escapeHTML(String(chapter))}</h2>
      <p class="muted">${subtitle}</p>
    </header>
    <section class="passage ot-chapter-passage">
      <div class="passage-body ot-chapter-body">${versesHTML}</div>
    </section>`;

    els.readerContent.querySelectorAll(".net-note-link").forEach(btn => {
      btn.addEventListener("click", event => {
        event.preventDefault();
        openNetNote(btn.dataset.netNote, btn.dataset.bookKey);
      });
    });

    els.readerContent.querySelectorAll(".ot-study-btn").forEach(btn => {
      btn.addEventListener("click", () => openOTVerseStudy(btn.dataset.verseId));
    });
  }

  async function openOTVerseStudy(verseId) {
    const ref = verseIdToRef(verseId);
    const closeAction = { label: "Close", className: "button", onClick: closeModal };

    openModal(`Hebrew Words: ${ref}`, `<p class="cc-no-results">Loading…</p>`, [closeAction]);

    const verseStrongs = await loadOtVerseStrongs();
    const strongsList = verseStrongs[verseId] || [];

    if (!strongsList.length) {
      openModal(`Hebrew Words: ${ref}`, `<p class="cc-no-results">No Hebrew word data for this verse.</p>`, [closeAction]);
      return;
    }

    const rows = strongsList.map(sn =>
      `<button class="cc-result" data-strongs="${escapeAttr(sn)}">
        <span class="cc-ref">${escapeHTML(sn)}</span>
      </button>`
    ).join("");

    openModal(`Hebrew Words: ${ref}`, `<div class="concordance-results">${rows}</div>`, [closeAction]);

    els.modalBody.querySelectorAll(".cc-result[data-strongs]").forEach(btn => {
      btn.addEventListener("click", () => openStrongsModal(btn.dataset.strongs));
    });
  }

  function renderTranslatedPassage(section) {
    const source = section.source ? `<span class="source-pill">${escapeHTML(section.source)}</span>` : "";
    const tier = section.tier ? `<span class="source-pill">${escapeHTML(section.tier.replace(/^Tier /, "Tier "))}</span>` : "";
    const markers = uniqueVerseMarkers(section);
    const verses = markers.map(marker => {
      const verseId = translationVerseId(section, marker);
      const label = marker.label || `${marker.chapter}:${marker.verse}`;
      const anchor = marker.anchor || `v-${section.id}-${marker.chapter}-${marker.verse}`.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
      return `<p id="${escapeAttr(anchor)}" class="translated-verse" data-verse-id="${escapeAttr(verseId)}">
        <span class="verse-number" data-chapter="${escapeAttr(marker.chapter)}" data-verse="${escapeAttr(marker.verse)}">${escapeHTML(label)}</span>
        <span class="translated-verse-text muted">Loading ${escapeHTML(state.activeTranslation.toUpperCase())}...</span>
      </p>`;
    }).join("");

    return `<section class="passage translated-passage" id="${escapeAttr(section.id)}" data-section-id="${escapeAttr(section.id)}">
      <h3>${escapeHTML(displayRef(section))}${section.title ? ` — ${escapeHTML(section.title)}` : ""}</h3>
      <div class="passage-meta">${source}${tier}<span class="source-pill">${escapeHTML(state.activeTranslation.toUpperCase())}</span></div>
      <div class="passage-body translated-body" data-section-id="${escapeAttr(section.id)}">${verses}</div>
    </section>`;
  }

  function canTranslateSection(section) {
    return !!translationBookKey(section.book) && Array.isArray(section.verseMarkers) && section.verseMarkers.length > 0;
  }

  function uniqueVerseMarkers(section) {
    const seen = new Set();
    const out = [];
    for (const marker of section.verseMarkers || []) {
      const key = `${marker.chapter}:${String(marker.verse).toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(marker);
    }
    return out;
  }

  function translationBookKey(bookName) {
    const map = {
      "Mark": "mark",
      "Matthew": "matthew",
      "Luke": "luke",
      "John": "john",
      "Acts": "acts",
      "1 Corinthians": "1corinthians",
      "Galatians": "galatians"
    };
    return map[bookName] || null;
  }

  function translationVerseId(section, marker) {
    const chapter = marker.chapter || section.startChapter;
    const verseMatch = String(marker.verse || "").match(/\d+/);
    const verse = verseMatch ? verseMatch[0] : marker.verse;
    if (window.TranslationsModule && typeof TranslationsModule.toVerseId === "function") {
      return TranslationsModule.toVerseId(section.book, chapter, verse);
    }
    const bookKey = translationBookKey(section.book);
    return `${bookKey}.${chapter}.${String(verse).toLowerCase()}`;
  }

  async function hydrateTranslatedPassages() {
    const requestId = ++state.translationRenderRequest;
    const translationId = state.activeTranslation;
    const verseEls = [...els.readerContent.querySelectorAll(".translated-verse[data-verse-id]")];
    if (!verseEls.length) {
      updateTranslationStatus("");
      return;
    }

    try {
      updateTranslationStatus("loading");
      await Promise.all(verseEls.map(async verseEl => {
        const verseId = verseEl.dataset.verseId;
        const textEl = verseEl.querySelector(".translated-verse-text");
        try {
          const text = await TranslationsModule.getVerseText(verseId, translationId);
          if (requestId !== state.translationRenderRequest || translationId !== state.activeTranslation) return;
          if (text) {
            textEl.classList.remove("muted");
            if (translationId === "net" && text.includes("⟦")) {
              textEl.innerHTML = renderNetVerseText(text, verseId);
            } else {
              textEl.textContent = text;
            }
          } else {
            textEl.classList.add("muted");
            textEl.textContent = "No verse available for this reference in the selected translation.";
          }
        } catch (error) {
          if (requestId !== state.translationRenderRequest || translationId !== state.activeTranslation) return;
          textEl.classList.add("muted");
          textEl.textContent = "Could not load this verse.";
          throw error;
        }
      }));
      if (requestId === state.translationRenderRequest && translationId === state.activeTranslation) {
        const label = els.translationSelect?.selectedOptions?.[0]?.textContent || translationId.toUpperCase();
        updateTranslationStatus("loaded", `${label} loaded.`);
      }
    } catch (error) {
      console.error("Translation hydration failed:", error);
      if (requestId === state.translationRenderRequest && translationId === state.activeTranslation) {
        updateTranslationStatus("error", "Could not load that translation. Try again, or hard-refresh after uploading the fix.");
      }
    }
  }

  function attachDynamicReaderEvents() {
    // Existing note link handlers
    els.readerContent.querySelectorAll(".note-link").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        openEndnote(button.dataset.note);
      });
    });

    // Existing highlight handlers
    els.readerContent.querySelectorAll(".user-highlight").forEach(mark => {
      mark.addEventListener("click", event => {
        event.stopPropagation();
        const highlight = state.highlights.find(h => h.id === mark.dataset.highlightId);
        if (highlight) openHighlightEditor(highlight);
      });
    });

    // NEW: Strong's word handlers
    els.readerContent.querySelectorAll(".source-word[data-strongs]").forEach(word => {
      word.addEventListener("click", event => {
        event.stopPropagation();
        const strongsNum = word.dataset.strongs;
        if (strongsNum) openStrongsModal(strongsNum);
      });
    });

    // Cross-reference panel collapse toggles
    els.readerContent.querySelectorAll(".crossref-heading-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const panel = btn.closest(".crossref-panel");
        if (panel) panel.classList.toggle("collapsed");
      });
    });

  }

  // ---------------------------------------------------------------------------
  // Cross-reference panel
  // ---------------------------------------------------------------------------

  function restoreCrossRefPreference() {
    state.crossRefEnabled = !!localStorage.getItem(STORAGE_CROSSREF);
    const stored = localStorage.getItem(STORAGE_COMMENTARY);
    if (stored) state.activeCommentary = stored;
    updateCrossRefButton();
  }

  function updateCrossRefButton() {
    if (!els.crossRefBtn) return;
    els.crossRefBtn.classList.toggle("active", state.crossRefEnabled);
    els.crossRefBtn.textContent = state.crossRefEnabled ? "Bible ref. ✓" : "Bible ref.";
  }

  function renderCrossRefPanel(section) {
    const markers = uniqueVerseMarkers(section);
    if (!markers.length) return "";

    const verseRows = markers.map(marker => {
      const verseId = translationVerseId(section, marker);
      const label = marker.label || `${marker.chapter}:${marker.verse}`;
      return `<div class="crossref-verse" data-verse-id="${escapeAttr(verseId)}">
        <span class="crossref-ref">${escapeHTML(section.book)} ${escapeHTML(label)}</span>
        <p class="crossref-bible-text">Loading…</p>
        <p class="crossref-commentary hidden"></p>
      </div>`;
    }).join("");

    return `<section class="crossref-panel" data-section-id="${escapeAttr(section.id)}">
      <h4 class="crossref-heading">
        <span class="crossref-heading-label">KJV · Cross-Reference</span>
        <button class="crossref-heading-btn icon-button" aria-label="Collapse cross-reference">▾</button>
      </h4>
      <div class="crossref-body">${verseRows}</div>
    </section>`;
  }

  async function hydrateCrossRefPanels() {
    const verseEls = [...els.readerContent.querySelectorAll(".crossref-verse[data-verse-id]")];
    if (!verseEls.length) return;

    await Promise.all(verseEls.map(async el => {
      const verseId = el.dataset.verseId;
      const bibleEl = el.querySelector(".crossref-bible-text");
      const commentEl = el.querySelector(".crossref-commentary");

      // Load KJV text
      try {
        if (window.TranslationsModule && typeof TranslationsModule.getVerseText === "function") {
          const text = await TranslationsModule.getVerseText(verseId, "kjv");
          if (text) {
            bibleEl.textContent = text;
          } else {
            bibleEl.textContent = "";
            bibleEl.classList.add("hidden");
          }
        } else {
          bibleEl.textContent = "";
          bibleEl.classList.add("hidden");
        }
      } catch {
        bibleEl.textContent = "";
        bibleEl.classList.add("hidden");
      }

      // Load commentary if available
      if (window.CommentaryModule && commentEl) {
        try {
          const comment = await CommentaryModule.getVerseComment(verseId, state.activeCommentary);
          if (comment) {
            commentEl.textContent = comment;
            commentEl.classList.remove("hidden");
          }
        } catch {
          // Commentary unavailable — silently omit
        }
      }
    }));
  }

  function renderSearch() {
    const q = state.activeSearchTerm.trim();
    if (q.length < 2) {
      els.searchSummary.textContent = "Type at least two characters to search.";
      els.searchResults.innerHTML = "";
      return;
    }

    const lower = normalize(q);
    const sectionResults = sections
      .map(section => ({ section, index: normalize(section.plainText).indexOf(lower) }))
      .filter(result => result.index >= 0)
      .slice(0, 80);

    const noteResults = Object.entries(DATA.notes)
      .map(([number, text]) => ({ number, text, index: normalize(text).indexOf(lower) }))
      .filter(result => result.index >= 0)
      .slice(0, 20);

    const total = sectionResults.length + noteResults.length;
    els.searchSummary.textContent = `${total} result${total === 1 ? "" : "s"} for "${q}"${sectionResults.length >= 80 ? " (showing first 80 passages)" : ""}.`;

    const sectionHtml = sectionResults.map(({section, index}) => {
      return `<button class="search-result" data-section-id="${escapeAttr(section.id)}">
        <strong>${escapeHTML(displayRef(section))}${section.title ? ` — ${escapeHTML(section.title)}` : ""}</strong>
        <small>${escapeHTML(section.book)}${section.source ? " · " + escapeHTML(section.source) : ""}</small>
        <span>${snippetHTML(section.plainText, index, q)}</span>
      </button>`;
    }).join("");

    const noteHtml = noteResults.map(({number, text, index}) => {
      return `<button class="search-result" data-note="${escapeAttr(number)}">
        <strong>Endnote ${escapeHTML(number)}</strong>
        <small>Translator's note</small>
        <span>${snippetHTML(text, index, q)}</span>
      </button>`;
    }).join("");

    els.searchResults.innerHTML = sectionHtml + noteHtml;

    els.searchResults.querySelectorAll("[data-section-id]").forEach(button => {
      button.addEventListener("click", () => {
        const section = sectionById.get(button.dataset.sectionId);
        if (!section) return;
        state.book = section.book;
        state.chapter = section.startChapter || "All";
        state.currentSectionId = section.id;
        state.chapterMode = false;
        updateHash();
        renderAll();
        setTimeout(() => {
          scrollToSection(section.id);
          const first = els.readerContent.querySelector(".search-inline");
          if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 50);
      });
    });

    els.searchResults.querySelectorAll("[data-note]").forEach(button => {
      button.addEventListener("click", () => openEndnote(button.dataset.note));
    });
  }

  function renderNotes() {
    const sorted = [...state.highlights].sort((a, b) => b.createdAt - a.createdAt);
    if (!sorted.length) {
      els.notesList.innerHTML = `<p class="muted">No highlights yet. Select text in the Reader tab, then choose Highlight or Add note.</p>`;
      return;
    }

    els.notesList.innerHTML = sorted.map(highlight => {
      const section = sectionById.get(highlight.sectionId);
      return `<article class="note-card" data-highlight-id="${escapeAttr(highlight.id)}">
        <blockquote>${escapeHTML(highlight.quote || "[highlight]")}</blockquote>
        <p>${highlight.note ? escapeHTML(highlight.note) : "<span class='muted'>No note attached.</span>"}</p>
        <p class="hint">${section ? escapeHTML(displayRef(section)) : "Unknown section"}</p>
        <div class="actions">
          <button class="button secondary" data-action="go">Go to text</button>
          <button class="button secondary" data-action="edit">Edit note</button>
          <button class="button danger" data-action="delete">Delete</button>
        </div>
      </article>`;
    }).join("");

    els.notesList.querySelectorAll(".note-card").forEach(card => {
      const highlight = state.highlights.find(h => h.id === card.dataset.highlightId);
      if (!highlight) return;
      card.querySelector("[data-action='go']").addEventListener("click", () => goToHighlight(highlight));
      card.querySelector("[data-action='edit']").addEventListener("click", () => openHighlightEditor(highlight));
      card.querySelector("[data-action='delete']").addEventListener("click", () => deleteHighlight(highlight.id));
    });
  }

  function renderSource() {
    if (!els.sourceText.textContent) {
      els.sourceText.textContent = DATA.sourceText;
    }
  }

  /**
   * NEW: Get verse text in current translation
   */
  async function getVerseTextForTranslation(verseId) {
    if (state.activeTranslation === "basileia") return null; // Source text handled separately
    
    try {
      updateTranslationStatus("loading");
      if (!window.TranslationsModule || typeof TranslationsModule.getVerseText !== "function") return null;
      const text = await TranslationsModule.getVerseText(verseId, state.activeTranslation);
      updateTranslationStatus("");
      return text;
    } catch (error) {
      console.error("Failed to get verse text:", error);
      updateTranslationStatus("error");
      return null;
    }
  }

  /**
   * NEW: Update translation status indicator
   */
  function updateTranslationStatus(status, message = "") {
    els.translationStatus.classList.remove("loading", "error", "loaded");
    if (status === "loading") {
      els.translationStatus.classList.add("loading");
      els.translationStatus.textContent = message || "Loading translation...";
    } else if (status === "error") {
      els.translationStatus.classList.add("error");
      els.translationStatus.textContent = message || "Error loading translation";
    } else if (status === "loaded") {
      els.translationStatus.classList.add("loaded");
      els.translationStatus.textContent = message || "Translation loaded";
    } else {
      els.translationStatus.textContent = "";
    }
  }

  /**
   * NEW: Open Strong's modal
   */
  async function openStrongsModal(strongsNum, backVerses) {
    try {
      if (!window.TranslationsModule || typeof TranslationsModule.getStrongsDefinition !== "function") {
        throw new Error("TranslationsModule is unavailable");
      }
      const entry = await TranslationsModule.getStrongsDefinition(strongsNum);

      const bodyHTML = `
        <div class="strongs-entry">
          <div class="strongs-entry-number">${escapeHTML(entry.number)}</div>
          ${entry.lemma ? `<div class="strongs-entry-lemma">${escapeHTML(entry.lemma)}</div>` : ""}
          <div class="strongs-entry-definition">${escapeHTML(entry.definition)}</div>
        </div>
      `;

      const actions = [];
      if (backVerses) {
        actions.push({
          label: "← Back",
          className: "button secondary",
          onClick: () => openInterlinearModal(backVerses)
        });
      }
      if (strongsNum.startsWith("G") && state.verseWords && Object.keys(state.verseWords).length > 0) {
        actions.push({
          label: "Corpus",
          className: "button secondary",
          onClick: () => openCorpusConcordance(strongsNum, backVerses)
        });
      }
      actions.push({
        label: "Bible",
        className: "button secondary",
        onClick: () => openBibleConcordance(strongsNum, backVerses)
      });
      actions.push({
        label: "BLB",
        className: "button secondary",
        onClick: () => {
          const url = entry.url || `https://www.blueletterbible.org/lexicon/${strongsNum}/`;
          window.open(url, "_blank");
        }
      });
      actions.push({ label: "Close", className: "button", onClick: closeModal });

      openModal(`${strongsNum} — Strong's Concordance`, bodyHTML, actions);
    } catch (error) {
      console.error("Failed to open Strong's modal:", error);
      openModal("Error", "<p>Could not load Strong's entry.</p>", [
        { label: "Close", className: "button", onClick: closeModal }
      ]);
    }
  }

  function formatParagraph(raw, section) {
    let currentChapter = section.startChapter || "";
    const re = /\[(\d+(?::\d+)?[a-z]?)\]|([A-Za-zÀ-ÖØ-öø-ÿ\u0370-\u03ff\]\)'""'?!;:,.—])(\d{1,3})(?![\d:–-])/g;
    let out = "";
    let last = 0;
    let match;

    while ((match = re.exec(raw)) !== null) {
      out += escapeHTML(raw.slice(last, match.index));

      if (match[1]) {
        const token = match[1];
        let chapter = currentChapter;
        let verse = token;
        if (token.includes(":")) {
          const parts = token.split(":");
          chapter = parts[0];
          verse = parts[1];
          currentChapter = chapter;
        }
        const anchor = `v-${section.id}-${chapter}-${verse}`.toLowerCase();
        const label = token.includes(":") ? token : verse;
        out += `<span id="${escapeAttr(anchor)}" class="verse-number" data-chapter="${escapeAttr(chapter)}" data-verse="${escapeAttr(verse)}">${escapeHTML(label)}</span>`;
      } else {
        const before = match[2];
        const num = match[3];
        out += escapeHTML(before);
        if (DATA.notes[num]) {
          out += `<button class="note-link" data-note="${escapeAttr(num)}" title="Open endnote ${escapeAttr(num)}">${escapeHTML(num)}</button>`;
        } else {
          out += escapeHTML(num);
        }
      }
      last = match.index + match[0].length;
    }

    out += escapeHTML(raw.slice(last));
    return out;
  }

  function openEndnote(number) {
    const text = DATA.notes[number] || "No note found.";
    openModal(`Endnote ${number}`, `<div class="note-text">${paragraphsToHTML(text)}</div>`, [
      { label: "Close", className: "button", onClick: closeModal }
    ]);
  }

  // Convert NET verse text containing ⟦N·nXXXXXX⟧ markers into HTML with
  // clickable superscript footnote buttons.
  function renderNetVerseText(text, verseId) {
    const bookKey = verseId.split(".")[0];
    const parts = text.split(/⟦(\d+[a-z]?)·(n[0-9a-z]+)⟧/);
    let html = "";
    for (let i = 0; i < parts.length; i += 3) {
      html += escapeHTML(parts[i]);
      if (i + 2 < parts.length) {
        const num = parts[i + 1];
        const noteId = parts[i + 2];
        html += `<sup><button class="net-note-link" data-net-note="${escapeAttr(noteId)}" data-book-key="${escapeAttr(bookKey)}">${escapeHTML(num)}</button></sup>`;
      }
    }
    return html;
  }

  async function openNetNote(noteId, bookKey) {
    openModal(
      "NET Bible Note",
      `<div class="note-text"><p class="muted">Loading…</p></div>`,
      [{ label: "Close", className: "button", onClick: closeModal }]
    );
    try {
      const html = await TranslationsModule.getNetNote(noteId, bookKey);
      const body = els.modalBody.querySelector(".note-text");
      if (body) body.innerHTML = html || "<p>Note not found.</p>";
    } catch (err) {
      const body = els.modalBody.querySelector(".note-text");
      if (body) body.textContent = "Could not load note.";
      console.error("NET note load failed:", err);
    }
  }

  function createHighlightFromSelection(withNote) {
    // Use saved state directly: clicking the button clears the live selection
    // before the click handler fires, so window.getSelection() would be empty.
    const range = _savedSelectionRange;
    const body = _selectionBody;

    if (!range || !body || range.collapsed) return;
    if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) {
      alert("Please select text within a single passage.");
      hideSelectionMenu();
      return;
    }

    const sectionId = body.dataset.sectionId;
    const offsets = getRangeOffsets(body, range);
    if (!offsets || offsets.end <= offsets.start) return;

    const quote = range.toString().trim();
    if (!quote) return;

    const highlight = {
      id: `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      sectionId,
      start: offsets.start,
      end: offsets.end,
      quote,
      note: "",
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    _savedSelectionRange = null; // prevent selectionchange from restoring
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    hideSelectionMenu();

    if (withNote) {
      openHighlightEditor(highlight, true);
    } else {
      state.highlights.push(highlight);
      saveHighlights();
      renderAll();
    }
  }

  function openHighlightEditor(highlight, isNew = false) {
    const section = sectionById.get(highlight.sectionId);
    const textareaId = "noteTextarea";
    const body = `<blockquote>${escapeHTML(highlight.quote || "")}</blockquote>
      <p class="hint">${section ? escapeHTML(displayRef(section)) : ""}</p>
      <label class="field-label" for="${textareaId}">Personal note</label>
      <textarea id="${textareaId}" class="control" placeholder="Write your note here...">${escapeHTML(highlight.note || "")}</textarea>`;

    openModal(isNew ? "Add note" : "Highlight note", body, [
      { label: "Cancel", className: "button secondary", onClick: closeModal },
      { label: "Save", className: "button", onClick: () => {
        const note = document.getElementById(textareaId).value.trim();
        highlight.note = note;
        highlight.updatedAt = Date.now();

        const existing = state.highlights.findIndex(h => h.id === highlight.id);
        if (existing >= 0) state.highlights[existing] = highlight;
        else state.highlights.push(highlight);

        saveHighlights();
        closeModal();
        renderAll();
      }}
    ]);
  }

  function goToHighlight(highlight) {
    const section = sectionById.get(highlight.sectionId);
    if (!section) return;
    setTab("reader");
    state.book = section.book;
    state.chapter = section.startChapter || "All";
    state.currentSectionId = section.id;
    state.chapterMode = false;
    updateHash();
    renderAll();
    setTimeout(() => {
      const mark = document.querySelector(`[data-highlight-id="${CSS.escape(highlight.id)}"]`);
      if (mark) mark.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 70);
  }

  function deleteHighlight(id) {
    if (!confirm("Delete this highlight and note?")) return;
    state.highlights = state.highlights.filter(h => h.id !== id);
    saveHighlights();
    renderAll();
  }

  function applyVisibleHighlights() {
    els.readerContent.querySelectorAll(".passage-body").forEach(body => {
      applyHighlightsToBody(body.dataset.sectionId, body);
    });
  }

  function applyHighlightsToBody(sectionId, body) {
    const highlights = state.highlights
      .filter(h => h.sectionId === sectionId)
      .sort((a, b) => b.start - a.start);

    for (const highlight of highlights) {
      try {
        wrapTextRange(body, highlight.start, highlight.end, highlight);
      } catch (err) {
        // Ignore invalid ranges after content revisions.
      }
    }
  }

  function wrapTextRange(root, start, end, highlight) {
    const startPos = findTextPosition(root, start);
    const endPos = findTextPosition(root, end);
    if (!startPos || !endPos) return;

    const range = document.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    const mark = document.createElement("mark");
    mark.className = `user-highlight${highlight.note ? " has-note" : ""}`;
    mark.dataset.highlightId = highlight.id;
    mark.title = highlight.note ? "Tap to edit note" : "Tap to add a note";

    const contents = range.extractContents();
    mark.appendChild(contents);
    range.insertNode(mark);
  }

  function findTextPosition(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let count = 0;
    let node;

    while ((node = walker.nextNode())) {
      const length = node.nodeValue.length;
      if (offset <= count + length) {
        return { node, offset: Math.max(0, offset - count) };
      }
      count += length;
    }
    return null;
  }

  function getRangeOffsets(root, range) {
    const pre = range.cloneRange();
    pre.selectNodeContents(root);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    return { start, end: start + range.toString().length };
  }

  function closestPassageBody(node) {
    if (!node) return null;
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return element ? element.closest(".passage-body") : null;
  }

  // Cached verses from the most recent valid selection; menu buttons read this.
  let _menuSelectionVerses = [];
  let _menuSelectionSection = null;
  // The passage body and range that are active when the menu is open. The range
  // is restored when the user closes the menu so text stays selected.
  let _selectionBody = null;
  let _savedSelectionRange = null;
  // Passage body that has the native callout temporarily re-enabled (after close).
  let _nativeSelectionBody = null;
  // True while we mutate the selection ourselves (programmatic range restore).
  let _programmaticSelection = false;
  // Debounce timer for selectionchange → updateSelectionMenu.
  let _selectionDebounceTimer = null;

  function updateSelectionMenu() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || selection.isCollapsed) {
      hideSelectionMenu();
      return;
    }
    const range = selection.getRangeAt(0);
    const body = closestPassageBody(range.commonAncestorContainer);
    if (!body || !body.contains(range.startContainer) || !body.contains(range.endContainer)) {
      hideSelectionMenu();
      return;
    }
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      hideSelectionMenu();
      return;
    }

    _selectionBody = body;
    _savedSelectionRange = range.cloneRange();
    _menuSelectionVerses = findVersesInSelection(range);
    _menuSelectionSection = sectionById.get(body.dataset.sectionId) || null;

    if (els.selectionRangeLabel) {
      const first = _menuSelectionVerses[0];
      const last = _menuSelectionVerses[_menuSelectionVerses.length - 1];
      els.selectionRangeLabel.textContent = !first
        ? ""
        : first === last
          ? first.reference
          : `${first.reference} – ${last.reference.split(" ").pop()}`;
    }

    if (els.menuBibleVersesBtn) {
      els.menuBibleVersesBtn.hidden = !(_menuSelectionSection && canTranslateSection(_menuSelectionSection));
    }
    if (els.menuCommentaryBtn) {
      els.menuCommentaryBtn.hidden = !(_menuSelectionVerses && _menuSelectionVerses.length > 0);
    }

    const isMobile = window.innerWidth <= 640;
    if (!isMobile) {
      const menuW = 220;
      const menuH = 190;
      let left = rect.left;
      let top = rect.top - menuH - 10;
      if (top < 8) top = rect.bottom + 10;
      left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
      top  = Math.max(8, Math.min(top,  window.innerHeight - menuH - 8));
      els.selectionMenu.style.left = `${left}px`;
      els.selectionMenu.style.top  = `${top}px`;
    }

    els.selectionMenu.classList.remove("hidden");

    if (isMobile) {
      document.body.classList.add('selection-menu-open');
      requestAnimationFrame(() => {
        const menuH = els.selectionMenu.offsetHeight || 300;
        const clearance = 20;
        const selBottom = rect.bottom;
        const visibleBottom = window.innerHeight - menuH - clearance;
        if (selBottom > visibleBottom) {
          window.scrollBy({ top: selBottom - visibleBottom, behavior: 'smooth' });
        }
      });
    }
  }

  // Hides the selection menu. When restoreToNative is true (close button),
  // the text stays selected and the native Safari callout is re-enabled so
  // the system menu can appear when the user taps the selection again.
  function hideSelectionMenu(restoreToNative = false) {
    els.selectionMenu.classList.add("hidden");
    document.body.classList.remove('selection-menu-open');
    clearTimeout(_selectionDebounceTimer);

    if (restoreToNative && _savedSelectionRange && _selectionBody) {
      const body = _selectionBody;
      body.classList.add("native-selection-active");
      _nativeSelectionBody = body;
      _programmaticSelection = true;
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_savedSelectionRange.cloneRange());
      setTimeout(() => { _programmaticSelection = false; }, 0);
      setTimeout(() => {
        body.classList.remove("native-selection-active");
        if (_nativeSelectionBody === body) _nativeSelectionBody = null;
      }, 30000);
    } else {
      if (_nativeSelectionBody) {
        _nativeSelectionBody.classList.remove("native-selection-active");
        _nativeSelectionBody = null;
      }
      const sel = window.getSelection();
      if (sel) sel.removeAllRanges();
    }

    _savedSelectionRange = null;
    _selectionBody = null;
    _menuSelectionVerses = [];
    _menuSelectionSection = null;
  }

  function commitHighlight(withNote) {
    createHighlightFromSelection(withNote);
  }

  function goToReference() {
    const raw = els.gotoInput.value.trim();
    if (!raw) return;
    const target = findReference(raw);
    if (!target) {
      els.gotoMessage.textContent = 'Reference not found. Try "Mark 4:21", "John 20:24", or "Logion 54".';
      return;
    }

    state.book = target.section.book;
    state.chapter = target.chapter || target.section.startChapter || "All";
    state.currentSectionId = target.section.id;
    state.chapterMode = !target.verse;
    updateHash(target.anchor || target.section.id);
    renderAll();
    els.gotoMessage.textContent = "";
    setTimeout(() => {
      if (target.anchor) scrollToAnchor(target.anchor);
      else scrollToSection(target.section.id);
    }, 60);
    closeSidebarOnMobile();
  }

  function findReference(raw) {
    const input = raw.trim().replace(/\s+/g, " ");
    const aliases = [
      ["Mark", /^(mark|mk)\s+/i],
      ["Matthew", /^(matthew|matt|mt)\s+/i],
      ["Luke", /^(luke|lk)\s+/i],
      ["John", /^(john|jn)\s+/i],
      ["Acts", /^(acts|ac)\s+/i],
      ["1 Corinthians", /^(1\s*corinthians|1\s*cor|i\s*corinthians|i\s*cor)\s+/i],
      ["Galatians", /^(galatians|gal)\s+/i],
      ["Didache", /^(didache)\s+/i],
      ["Thomas", /^(thomas|gospel of thomas)\s+/i]
    ];

    const logion = input.match(/^(?:logion|thomas\s+logion|thomas)\s+(\d+)/i);
    if (logion) {
      const chapter = logion[1];
      const section = sections.find(s => s.book === "Thomas" && String(s.startChapter) === chapter);
      return section ? { section, chapter, verse: null, anchor: section.id } : null;
    }

    for (const [book, regex] of aliases) {
      const match = input.match(regex);
      if (!match) continue;
      const rest = input.slice(match[0].length).trim();
      const refMatch = rest.match(/^(\d+)(?::(\d+[a-z]?))?/i);
      if (!refMatch) continue;
      const chapter = refMatch[1];
      const verse = refMatch[2] || null;
      const candidates = sections.filter(s => s.book === book && sectionContainsChapter(s, chapter));
      let section = null;
      let anchor = null;
      if (verse) {
        for (const s of candidates) {
          const marker = (s.verseMarkers || []).find(v => String(v.chapter) === String(chapter) && String(v.verse).toLowerCase() === String(verse).toLowerCase());
          if (marker) {
            section = s;
            anchor = marker.anchor;
            break;
          }
        }
        if (!section) section = candidates.find(s => sectionContainsVerseRange(s, chapter, verse));
      } else {
        section = candidates[0];
      }
      return section ? { section, chapter, verse, anchor } : null;
    }
    return null;
  }

  function sectionContainsChapter(section, chapter) {
    if (!section.startChapter) return chapter === "All";
    const sc = numeric(section.startChapter);
    const ec = numeric(section.endChapter || section.startChapter);
    const ch = numeric(chapter);
    if (sc == null || ec == null || ch == null) return String(section.startChapter) === String(chapter);
    return ch >= sc && ch <= ec;
  }

  function sectionContainsVerseRange(section, chapter, verse) {
    const ch = numeric(chapter);
    const v = numeric(verse);
    const sc = numeric(section.startChapter);
    const sv = numeric(section.startVerse);
    const ec = numeric(section.endChapter || section.startChapter);
    const ev = numeric(section.endVerse || section.startVerse);
    if ([ch, v, sc, sv, ec, ev].some(x => x == null)) return false;
    if (ch < sc || ch > ec) return false;
    if (sc === ec) return v >= sv && v <= ev;
    if (ch === sc) return v >= sv;
    if (ch === ec) return v <= ev;
    return true;
  }

  function getVisibleSections() {
    return getSectionsInChapter(state.book, state.chapter);
  }

  function getSectionsInChapter(bookName, chapter) {
    const book = getBook(bookName);
    if (!book) return [];
    const bookSections = book.sectionIds.map(id => sectionById.get(id)).filter(Boolean);
    if (chapter === "All") return bookSections;
    return bookSections.filter(section => sectionContainsChapter(section, chapter));
  }

  function getBook(name) {
    return bookByName.get(name);
  }

  function setCurrentSectionIfMissing() {
    if (state.currentSectionId && sectionById.has(state.currentSectionId)) return;
    state.currentSectionId = getSectionsInChapter(state.book, state.chapter)[0]?.id || sections[0]?.id || null;
  }

  function goPrevious() {
    if (state.otBook) {
      if (state.otChapter > 1) {
        state.otChapter--;
      } else {
        const idx = OT_BOOK_KEYS.indexOf(state.otBook);
        if (idx > 0) {
          state.otBook = OT_BOOK_KEYS[idx - 1];
          state.otChapter = OT_CHAPTER_COUNTS[state.otBook];
        }
      }
      renderAll();
      scrollToTopReader();
      return;
    }
    if (state.chapterMode) {
      const sectionsInChapter = getSectionsInChapter(state.book, state.chapter);
      const idxInChapter = sectionsInChapter.findIndex(s => s.id === state.currentSectionId);
      if (idxInChapter > 0) {
        state.currentSectionId = sectionsInChapter[idxInChapter - 1].id;
        updateHash();
        renderAll();
        scrollToSection(state.currentSectionId);
        return;
      }
      const book = getBook(state.book);
      const idx = book.chapters.indexOf(state.chapter);
      if (idx > 0) {
        state.chapter = book.chapters[idx - 1];
      } else {
        const bookIdx = books.findIndex(b => b.name === state.book);
        if (bookIdx > 0) {
          const prevBook = books[bookIdx - 1];
          state.book = prevBook.name;
          state.chapter = prevBook.chapters[prevBook.chapters.length - 1];
        }
      }
      const prevSections = getSectionsInChapter(state.book, state.chapter);
      state.currentSectionId = prevSections[prevSections.length - 1]?.id || null;
    } else {
      const idx = sections.findIndex(s => s.id === state.currentSectionId);
      if (idx > 0) {
        const section = sections[idx - 1];
        state.book = section.book;
        state.chapter = section.startChapter || "All";
        state.currentSectionId = section.id;
      }
    }
    updateHash();
    renderAll();
    scrollToTopReader();
  }

  function goNext() {
    if (state.otBook) {
      const maxCh = OT_CHAPTER_COUNTS[state.otBook] || 1;
      if (state.otChapter < maxCh) {
        state.otChapter++;
      } else {
        const idx = OT_BOOK_KEYS.indexOf(state.otBook);
        if (idx < OT_BOOK_KEYS.length - 1) {
          state.otBook = OT_BOOK_KEYS[idx + 1];
          state.otChapter = 1;
        }
      }
      renderAll();
      scrollToTopReader();
      return;
    }
    if (state.chapterMode) {
      const sectionsInChapter = getSectionsInChapter(state.book, state.chapter);
      const idxInChapter = sectionsInChapter.findIndex(s => s.id === state.currentSectionId);
      if (idxInChapter >= 0 && idxInChapter < sectionsInChapter.length - 1) {
        state.currentSectionId = sectionsInChapter[idxInChapter + 1].id;
        updateHash();
        renderAll();
        scrollToSection(state.currentSectionId);
        return;
      }
      const book = getBook(state.book);
      const idx = book.chapters.indexOf(state.chapter);
      if (idx < book.chapters.length - 1) {
        state.chapter = book.chapters[idx + 1];
      } else {
        const bookIdx = books.findIndex(b => b.name === state.book);
        if (bookIdx < books.length - 1) {
          const nextBook = books[bookIdx + 1];
          state.book = nextBook.name;
          state.chapter = nextBook.chapters[0];
        }
      }
      state.currentSectionId = getSectionsInChapter(state.book, state.chapter)[0]?.id || null;
    } else {
      const idx = sections.findIndex(s => s.id === state.currentSectionId);
      if (idx < sections.length - 1) {
        const section = sections[idx + 1];
        state.book = section.book;
        state.chapter = section.startChapter || "All";
        state.currentSectionId = section.id;
      }
    }
    updateHash();
    renderAll();
    scrollToTopReader();
  }

  function updateHash(anchor) {
    const target = anchor || state.currentSectionId;
    if (target) {
      history.replaceState(null, "", `#${encodeURIComponent(target)}`);
    }
    saveLastPosition();
  }

  function saveLastPosition() {
    if (!state.currentSectionId) return;
    localStorage.setItem(STORAGE_BOOKMARK, JSON.stringify({
      book: state.book,
      chapter: state.chapter,
      currentSectionId: state.currentSectionId,
      chapterMode: state.chapterMode
    }));
  }

  function restoreLastPosition() {
    if (location.hash) return;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_BOOKMARK));
      if (!stored || !stored.currentSectionId) return;
      if (!sectionById.has(stored.currentSectionId)) return;
      const section = sectionById.get(stored.currentSectionId);
      state.book = stored.book || section.book;
      state.chapter = stored.chapter || section.startChapter || "All";
      state.currentSectionId = stored.currentSectionId;
      state.chapterMode = stored.chapterMode !== undefined ? stored.chapterMode : true;
      setTimeout(() => scrollToSection(stored.currentSectionId), 100);
    } catch {
      // ignore corrupt storage
    }
  }

  function restoreFromHash() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
    if (!hash) return;

    let section = sectionById.get(hash);
    let anchor = null;
    if (!section) {
      const marker = sections.flatMap(s => (s.verseMarkers || []).map(v => ({ section: s, anchor: v.anchor })))
        .find(item => item.anchor === hash);
      if (marker) {
        section = marker.section;
        anchor = marker.anchor;
      }
    }
    if (section) {
      state.book = section.book;
      state.chapter = section.startChapter || "All";
      state.currentSectionId = section.id;
      state.chapterMode = !anchor;
      setTimeout(() => {
        if (anchor) scrollToAnchor(anchor);
        else scrollToSection(section.id);
      }, 100);
    }
  }

  /**
   * NEW: Restore translation preference from storage
   */
  function restoreTranslationPreference() {
    const stored = localStorage.getItem(STORAGE_TRANSLATION);
    if (stored) {
      state.activeTranslation = stored;
    }
  }

  function displayRef(section) {
    if (!section) return "";
    if (section.book === "Thomas") return `${section.ref}`;
    if (section.ref) return `${section.book} ${section.ref}`;
    return section.heading;
  }

  function chapterLabel(bookName, chapter) {
    if (chapter === "All") return "All";
    if (bookName === "Thomas") return `Logion ${chapter}`;
    return chapter;
  }

  function scrollToSection(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToAnchor(anchor) {
    const el = document.getElementById(anchor);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function scrollToTopReader() {
    els.readerContent.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 860px)").matches) {
      els.sidebar.classList.remove("open");
    }
  }

  function openModal(title, bodyHTML, actions = []) {
    els.modalTitle.textContent = title;
    els.modalBody.innerHTML = bodyHTML;
    els.modalActions.innerHTML = "";
    actions.forEach(action => {
      const button = document.createElement("button");
      button.textContent = action.label;
      button.className = action.className || "button";
      button.addEventListener("click", action.onClick);
      els.modalActions.appendChild(button);
    });
    els.modalBackdrop.classList.remove("hidden");
    els.modal.classList.remove("hidden");
    const focusable = els.modal.querySelector("textarea, button");
    if (focusable) focusable.focus();
  }

  function closeModal() {
    els.modalBackdrop.classList.add("hidden");
    els.modal.classList.add("hidden");
    els.modalTitle.textContent = "";
    els.modalBody.innerHTML = "";
    els.modalActions.innerHTML = "";
  }

  function applySearchHighlight(root, term) {
    if (!term || term.length < 2) return;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "ig");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest(".note-link, .net-note-link, .verse-number, .search-inline")) return NodeFilter.FILTER_REJECT;
        if (!regex.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
        regex.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);

    nodes.forEach(textNode => {
      const text = textNode.nodeValue;
      regex.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        frag.append(document.createTextNode(text.slice(last, match.index)));
        const span = document.createElement("span");
        span.className = "search-inline";
        span.textContent = match[0];
        frag.append(span);
        last = match.index + match[0].length;
      }
      frag.append(document.createTextNode(text.slice(last)));
      textNode.replaceWith(frag);
    });
  }

  function snippetHTML(text, index, query) {
    const radius = 90;
    const start = Math.max(0, index - radius);
    const end = Math.min(text.length, index + query.length + radius);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < text.length ? "…" : "";
    const raw = prefix + text.slice(start, end).replace(/\s+/g, " ") + suffix;
    const escaped = escapeHTML(raw);
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(new RegExp(`(${safeQuery})`, "ig"), "<mark>$1</mark>");
  }

  function paragraphsToHTML(text) {
    return escapeHTML(text).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  }

  function loadHighlights() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_HIGHLIGHTS) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch {
      return [];
    }
  }

  function saveHighlights() {
    localStorage.setItem(STORAGE_HIGHLIGHTS, JSON.stringify(state.highlights));
  }

  function normalize(str) {
    return String(str || "").toLowerCase();
  }

  function numeric(value) {
    if (value == null) return null;
    const match = String(value).match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function escapeHTML(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(str) {
    return escapeHTML(str);
  }

  function debounce(fn, delay = 150) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = current;
    localStorage.setItem(STORAGE_THEME, current);
  }

  function applyStoredTheme() {
    const stored = localStorage.getItem(STORAGE_THEME);
    if (stored) document.documentElement.dataset.theme = stored;
    else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      document.documentElement.dataset.theme = "dark";
    }
  }

  init();
})();
