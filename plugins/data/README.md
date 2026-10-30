# Liber 777

Tree of Life correspondence tables for KABBAK. A new **777** page in the top menu:
a clickable Tree of Life on the left, the complete Liber 777 tables for the
selected key on the right. No tarot card images or card text — tables only.

## Using it

- Click a **sephirah** (1–10) or a **path** letter (11–32) on the tree, or use the
  key list under it, to load that key's correspondences.
- **Ain, Ain Soph, Ain Soph Aur** sit in the key list above the sephirot.
- **Search every table…** filters the current key and lists every other key that
  contains the term — click a hit to jump there.
- **Full table** shows all 35 keys as one scrollable grid (262 rows).
- `◂` / `▸` step through keys in tree order.
- The last key you viewed is remembered in the browser.

## Files

```
manifest.json        plugin manifest (section id: liber-777, label: 777)
liber-777.js         page: tree, key list, tables, search
liber-777.css        styling via the app's --tt-* theme tokens
config.json          defaultKey (which key opens first)
data/liber-777.json  { meta, columns[], keys{} } — 262 columns x 35 keys
changelog.json       version notes
```

`config.json` → `defaultKey` accepts the site's key numbering: `000`, `00`, `0`,
`1`–`32` (sephirot then letter paths), and `33` / `34` for the Tav and Shin
columns. Editable from the DLC Shop like other plugin configs.

## Data

`data/liber-777.json` is generated from the [open_777](https://github.com/adamblvck/open_777)
data set (`src/constants/liber_777.js`, MIT License, © Adam Blvck), a
transcription of **Liber 777** (Aleister Crowley, 1909), which is in the public
domain. The same data set supplies the tree paths already used by the app's
Kabbalah section.

- `columns[]` keeps the book's own column numerals and headings in book order.
- `keys{}` holds only the non-empty cells; the three veils are split out of the
  one cell the sheet uses into the keys `000`, `00`, `0`.
- Empty/placeholder cells (`...`) are discarded, so `key` lists differ in length.
- Da'ath has no column of its own in the book; it is shown on the tree as a
  dashed node with an explanatory note.

If the data needs regenerating:

```
python3 data/build-liber-777.py <path-to-open_777>/src/constants/liber_777.js data/liber-777.json
```

The generator strips the `export const Liber777 = ` prefix and writes the cells
as-is — the sheet's column keys are already the site's key numbers. Keep
`data/LICENSE` (MIT notice for the data set) with it.
