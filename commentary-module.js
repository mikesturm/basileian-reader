/**
 * Commentary Module
 * Browser-only lazy-loader for public-domain Bible commentary JSON files.
 *
 * Expected data format for each commentary file (commentary/{id}.json):
 *   { "mark.1.1": "Commentary text...", "mark.1.2": "...", ... }
 *
 * Keys use the same verse_id format as the rest of the Basileian Reader.
 * Run scripts/fetch-commentary.js to generate these files.
 */

const CommentaryModule = (() => {
  const COMMENTARIES = [
    {
      id: 'jfb',
      name: 'Jamieson-Fausset-Brown',
      file: 'commentary/jfb.json'
    },
    {
      id: 'mhcc',
      name: "Matthew Henry's Concise Commentary",
      file: 'commentary/mhcc.json'
    }
  ];

  const cache = {};          // { id: { verseId: text } | null }
  const loadPromises = {};   // { id: Promise }

  async function loadCommentary(id) {
    if (id in cache) return cache[id];
    if (id in loadPromises) return loadPromises[id];

    const meta = COMMENTARIES.find(c => c.id === id);
    if (!meta) {
      cache[id] = null;
      return null;
    }

    const promise = (async () => {
      try {
        const resp = await fetch(meta.file, { cache: 'default' });
        if (!resp.ok) {
          cache[id] = null;
          return null;
        }
        const data = await resp.json();
        cache[id] = (data && typeof data === 'object') ? data : null;
        return cache[id];
      } catch {
        cache[id] = null;
        return null;
      } finally {
        delete loadPromises[id];
      }
    })();

    loadPromises[id] = promise;
    return promise;
  }

  async function getVerseComment(verseId, id = 'jfb') {
    const data = await loadCommentary(id);
    if (!data) return null;
    return data[verseId] || null;
  }

  async function isAvailable(id = 'jfb') {
    const data = await loadCommentary(id);
    return data !== null && Object.keys(data).length > 0;
  }

  function getAvailableCommentaries() {
    return COMMENTARIES.map(({ id, name }) => ({ id, name }));
  }

  return { loadCommentary, getVerseComment, isAvailable, getAvailableCommentaries };
})();

window.CommentaryModule = CommentaryModule;
