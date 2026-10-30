# Liber 777

Tree of Life correspondence tables for KABBAK: a new **777** page in the top menu
with a clickable Tree of Life on the left and the complete Liber 777 tables for
the selected key on the right. Tables only — no tarot card images or card text.

## Using it

- Click a **sephirah** (1–10) or a **path** letter (11–32) on the tree, or use the
  key list under it, to load that key's correspondences.
- **Ain, Ain Soph, Ain Soph Aur** sit in the key list above the sephirot.
- **Search every table…** filters the current key and lists every other key that
  contains the term — click a hit to jump there.
- **Full table** shows all 35 keys as one scrollable grid (262 rows).
- `◂` / `▸` step through keys in tree order. The last key you viewed is remembered.

## Files

```
manifest.json         plugin manifest (section id: liber-777, label: 777)
liber-777.js          page: tree, key list, tables, search
liber-777.css         styling via the app's --tt-* theme tokens
config.json           defaultKey — which key opens first
data/liber-777.js     window.Liber777Data — the tables (preferred source)
data/liber-777.json   the same payload as JSON (tooling, inspection)
data/build-liber-777.py  generator for both data files
data/LICENSE          MIT notice for the data set
changelog.json        version notes
```

## How the data loads

The page never depends on one route. It tries, in order:

1. `window.Liber777Data` if `data/liber-777.js` is already on the page,
2. injecting `<script src="data/liber-777.js">` next to this plugin file,
3. `GET /api/v1/plugins/liber-777/files/data/liber-777.json`,
4. `fetch()` of `data/liber-777.json` from the plugin folder.

If all four fail, the page lists the exact URLs it tried so the cause is
visible (usually: the folder is missing, or the API has not rebuilt its catalog
— restart/refresh the API after adding the plugin).

## Config

`config.json` → `defaultKey` accepts the site's key numbering: `000`, `00`, `0`,
`1`–`32` (sephirot then letter paths), and `33` / `34` for the Tav and Shin
columns. Editable from the DLC Shop like other plugin configs. A key picked in
the UI is remembered in the browser, and is overridden by `defaultKey`.

## Data

Generated from the [open_777](https://github.com/adamblvck/open_777) data set
(`src/constants/liber_777.js`, MIT, © Adam Blvck), a transcription of
**Liber 777** (Aleister Crowley, 1909), which is in the public domain. The same
data set supplies the tree paths already used by the app's Kabbalah section.

- `columns[]` keeps the book's own numerals and headings in book order.
- `keys{}` holds only the non-empty cells; the three veils are split out of the
  one cell the sheet uses into keys `000`, `00`, `0`. Empty cells (`...`) are
  dropped, so keys differ in length.
- Da'ath has no column of its own; it is a dashed node with a note.

Regenerate with:

```
python3 data/build-liber-777.py <path-to-open_777>/src/constants/liber_777.js
```

It writes both `data/liber-777.js` and `data/liber-777.json`. Keep
`data/LICENSE` with them.
