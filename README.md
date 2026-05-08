# Basileian Reader v2

This is a GitHub Pages-ready web app for the Basileian / Jesus Tradition Canon.

## What changed

- Mobile-first layout with readable scripture typography.
- Book/source selector.
- Chapter/logion selector.
- Passage list for the selected chapter or source.
- Verse chips for quick jumps.
- Reference jump box, e.g. `Mark 4:21`, `John 20:24`, `Logion 54`.
- Search across passages and endnotes.
- Tappable translator endnotes.
- Highlights and personal notes stored in the browser on that device.
- Source tab with the complete source text.
- Basic PWA manifest and icons for “Add to Home Screen.”

## Files to upload to GitHub

Upload these files into the root of your GitHub Pages repository:

- `index.html`
- `style.css`
- `app.js`
- `data.js`
- `site.webmanifest`
- `sw.js`
- `icon-192.png`
- `icon-512.png`

You can delete the old `canon.html` if you want. This version no longer needs it.

## After uploading

GitHub Pages can take a few minutes to update. On iPhone, refresh the page in Safari. If you previously added the old version to your Home Screen, remove that icon and add the updated site again.

## Notes

Highlights and notes are saved in browser local storage. They do not sync between devices yet.
