// Basileian Web Reader functionality
// This script loads the canon text and notes from ealoi_data.json,
// renders the reader, handles highlighting and note‑taking, and
// provides a simple UI for navigating between reader, notes, and
// source views.

// `data` will be defined in data.js and contains the canon text and notes.
let userNotes = [];

document.addEventListener('DOMContentLoaded', () => {
    // Load user notes from localStorage
    try {
        userNotes = JSON.parse(localStorage.getItem('notes')) || [];
    } catch (e) {
        userNotes = [];
    }
    // If the global `data` has been defined by data.js, set up the app
    if (typeof data !== 'undefined' && data) {
        setupReader();
        setupNavigation();
        setupSelectionHandlers();
        renderNotesList();
    } else {
        console.error('Data is undefined. Make sure data.js is loaded.');
    }
});

// Processes the main text, replacing bracketed numbers with clickable
// note markers.
function processText(text) {
    return text.replace(/\[(\d+)\]/g, (match, number) => {
        return `<span class="note-marker" data-note="${number}">${match}</span>`;
    });
}

// Sets up the reader view.  Loads saved HTML if present, otherwise
// processes the text for note markers.  After rendering, note marker
// click handlers are attached.
function setupReader() {
    const readerContent = document.getElementById('reader-content');
    const savedHTML = localStorage.getItem('readerHTML');
    if (savedHTML) {
        readerContent.innerHTML = savedHTML;
    } else {
        const processed = processText(data.text);
        readerContent.innerHTML = processed;
        localStorage.setItem('readerHTML', processed);
    }
    attachNoteMarkerEvents();
}

// Attaches click handlers to all note marker elements.  When clicked,
// a modal is displayed with the corresponding note content.
function attachNoteMarkerEvents() {
    const readerContent = document.getElementById('reader-content');
    const markers = readerContent.querySelectorAll('.note-marker');
    markers.forEach(marker => {
        marker.addEventListener('click', (event) => {
            const number = marker.dataset.note;
            const noteText = (data && data.notes && data.notes[number]) ? data.notes[number] : '(No note found)';
            showEndnote(number, noteText);
            event.stopPropagation();
        });
    });
}

// Displays the endnote modal with the given number and text.
function showEndnote(number, text) {
    const modal = document.getElementById('note-modal');
    document.getElementById('note-title').innerText = `Note ${number}`;
    document.getElementById('note-text').innerText = text;
    modal.classList.remove('hidden');
}

// Hides the endnote modal.
function hideEndnote() {
    const modal = document.getElementById('note-modal');
    modal.classList.add('hidden');
}

// Sets up the navigation bar.  Clicking a nav button switches to the
// corresponding tab.
function setupNavigation() {
    const buttons = document.querySelectorAll('nav button');
    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            // Toggle active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            // Show/hide sections
            document.querySelectorAll('.tab-content').forEach(sec => {
                if (sec.id === tab) {
                    sec.classList.remove('hidden');
                } else {
                    sec.classList.add('hidden');
                }
            });
        });
    });
    // Attach close handler for note modal
    document.getElementById('close-note-modal').addEventListener('click', hideEndnote);
    document.getElementById('note-modal').addEventListener('click', (e) => {
        if (e.target.id === 'note-modal') hideEndnote();
    });
}

// Sets up selection handlers for highlighting and note taking.  When
// the user selects text in the reader view, a small toolbar appears
// above the selection.  The toolbar provides options to highlight
// the selection or attach a note.
function setupSelectionHandlers() {
    const readerContent = document.getElementById('reader-content');
    const toolbar = document.getElementById('selection-toolbar');
    const highlightBtn = document.getElementById('highlight-btn');
    const addNoteBtn = document.getElementById('add-note-btn');
    document.addEventListener('mouseup', (event) => {
        // Delay so selection is updated
        setTimeout(() => {
            const sel = window.getSelection();
            if (!sel.rangeCount || sel.isCollapsed || !readerContent.contains(sel.anchorNode)) {
                toolbar.classList.add('hidden');
                return;
            }
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            toolbar.style.top = (window.scrollY + rect.top - 40) + 'px';
            toolbar.style.left = (window.scrollX + rect.left) + 'px';
            toolbar.classList.remove('hidden');
        }, 0);
    });
    highlightBtn.addEventListener('click', () => {
        highlightSelection();
        toolbar.classList.add('hidden');
    });
    addNoteBtn.addEventListener('click', () => {
        addNoteToSelection();
        toolbar.classList.add('hidden');
    });
}

// Wraps the current selection in a span with the highlight class.  If
// selection overlaps an existing highlight, it simply returns the
// highlight id.  After highlighting, the reader HTML is persisted.
function highlightSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    // If selection contains part of a note marker or highlight, adjust.
    // Try to wrap selection; fallback to execCommand if necessary.
    const highlightId = generateId();
    const span = document.createElement('span');
    span.className = 'highlight';
    span.dataset.highlightId = highlightId;
    try {
        range.surroundContents(span);
    } catch (e) {
        // Fallback: use execCommand to highlight
        document.execCommand('hiliteColor', false, '#fdf49c');
        // Find the new span
        const newSpans = document.querySelectorAll('font[style*=background-color]');
        newSpans.forEach(el => {
            const wrapper = document.createElement('span');
            wrapper.className = 'highlight';
            wrapper.dataset.highlightId = highlightId;
            el.parentNode.replaceChild(wrapper, el);
            wrapper.appendChild(el);
        });
    }
    // Persist HTML
    persistReaderHTML();
    // Clear selection
    sel.removeAllRanges();
    return highlightId;
}

// Adds a note to the current selection.  If the selection isn’t
// already highlighted, it will be highlighted first.  Prompts the
// user for note text and saves it along with the highlight ID.
function addNoteToSelection() {
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    let highlightSpan = sel.anchorNode.parentElement.closest('.highlight');
    let highlightId;
    if (highlightSpan) {
        highlightId = highlightSpan.dataset.highlightId;
    } else {
        highlightId = highlightSelection();
    }
    const noteText = prompt('Enter your note:');
    if (!noteText) return;
    userNotes.push({ highlightId, text: noteText });
    localStorage.setItem('notes', JSON.stringify(userNotes));
    persistReaderHTML();
    renderNotesList();
    sel.removeAllRanges();
}

// Saves the current reader HTML to localStorage so highlights persist.
function persistReaderHTML() {
    const html = document.getElementById('reader-content').innerHTML;
    localStorage.setItem('readerHTML', html);
}

// Generates a pseudo‑unique ID for highlights.
function generateId() {
    return 'h' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Renders the list of user notes in the notes tab.  Each entry
// displays a snippet of the highlighted text and the note content.  Clicking
// on a note will scroll the reader to the corresponding highlight.
function renderNotesList() {
    const list = document.getElementById('notes-list');
    list.innerHTML = '';
    if (userNotes.length === 0) {
        const li = document.createElement('li');
        li.innerText = 'No notes yet. Select text in the reader and use the Add Note button.';
        list.appendChild(li);
        return;
    }
    userNotes.forEach((note, index) => {
        const li = document.createElement('li');
        const highlight = document.querySelector(`[data-highlight-id='${note.highlightId}']`);
        let snippet = '';
        if (highlight) {
            snippet = highlight.textContent.trim();
        }
        const snippetEl = document.createElement('p');
        snippetEl.style.fontWeight = 'bold';
        snippetEl.innerText = snippet || '[highlighted text]';
        const noteEl = document.createElement('p');
        noteEl.innerText = note.text;
        li.appendChild(snippetEl);
        li.appendChild(noteEl);
        li.addEventListener('click', () => {
            if (highlight) {
                highlight.scrollIntoView({ behavior: 'smooth' });
                // briefly flash the highlight
                highlight.classList.add('flash');
                setTimeout(() => highlight.classList.remove('flash'), 1000);
            }
            // switch to reader tab
            document.querySelector("nav button[data-tab='reader']").click();
        });
        list.appendChild(li);
    });
}