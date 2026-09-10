# KABBAK DLC

Downloadable content repository for the KABBAK API server. Add decks, text sources, and packs — clients fetch them on-demand after `migrate:data`.

## Folder Structure

```
decks/                 ← Tarot deck folders (one per deck)
  Rider Waite/
    deck.json          ← Deck manifest
    00-TheFool.png     ← Card images
    ...
texts/                 ← Text source folders (one per source)
  Gospel of Philip/
    text.json          ← Metadata manifest (title, author, format, etc.)
    gospel.txt         ← Content file
packs/                 ← Curated install lists (no content files)
  Abrahamic/
    pack.json          ← Lists the decks and texts to install together
```

## Adding the Catalog to a Server

From the `KABBAK-API` project root:

```
npm run dlc -- repo <your-dlc-git-url>
```

This clones into `imports/dlc` (blobless/sparse). The API lists the catalog from
the git tree (`decks/`, `texts/`, `packs/`, `plugins/`). Add more repos the same
way; `dlc list` groups items by repository. Card images and text bodies are
fetched only for the items you install.

There is no default catalog URL. Pass a git URL to `dlc repo` or set
`KABBAK_DLC_REPO` / `KABBAK_DLC_BRANCH`.

## Managing DLC Content

All commands run from the `KABBAK-API` project root.

### List Available Content

```
npm run dlc -- list
npm run dlc -- list --refresh
npm run dlc -- info --name "Rider Waite"
```

Each row reports a status: `available` (published, not downloaded), `staged`
(downloaded, waiting for `migrate:data`), or `installed` (served by the API).
Packs additionally report `partial` when only some of their items are installed.

### Validate Content

```
npm run dlc -- check
```

Checks downloaded items for missing manifests, invalid JSON, broken file
references, and unsupported formats.

### Install Content

```
npm run dlc -- install --name "Rider Waite" --rebuild
```

Downloads just that item, stages it under `imports/`, and rebuilds the database.
Drop `--rebuild` to stage only and run `npm run migrate:data` yourself. Use
`--all` to install everything that is not installed yet.

Installing a pack installs every deck and text the pack lists; items that are
already installed are skipped. Nothing installs implicitly — `migrate:data` only
processes content you have already staged.

### Remove Content

```
npm run dlc -- uninstall --name "Rider Waite" --purge
```

`--purge` also drops the folder from the local checkout to reclaim disk space.
Uninstalling a pack removes every item it lists.

### Update the Catalog

```
npm run dlc -- update
```

Pulls the latest commits without downloading any content files. Also runs
automatically before every `install`, so you can go straight from `list` to
`install` skipping `update`.

## Publishing (maintainers)

Work in a full checkout of this repository, add content under `decks/`,
`texts/`, `packs/`, or `plugins/`, then:

```
npm run dlc -- check
git add -A && git commit -m "Add <name>" && git push
```

The catalog is the folder tree. Each item still needs its own `deck.json`,
`text.json` / `metadata.json`, `pack.json`, or plugin `manifest.json`. There is
no root catalog index to regenerate.

## Content Format Reference

### Deck (`decks/<name>/deck.json`)

```json
{
  "id": "rider-waite",
  "name": "Rider Waite",
  "majors": {
    "mode": "trump-map",
    "cards": {
      "0": "00-TheFool.png",
      "1": "01-TheMagician.png"
    }
  },
  "minors": {
    "mode": "suit-prefix-and-rank-order",
    "template": "{suit}{index}.png",
    "indexStart": 1,
    "indexPad": 2,
    "suitPrefix": { "cups": "Cups", "swords": "Swords", "wands": "Wands", "disks": "Pentacles" },
    "rankOrder": ["Ace","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Page","Knight","Queen","King"],
    "rankIndexByKey": {
      "knight": 13,
      "queen": 12,
      "prince": 11,
      "princess": 10
    }
  }
}
```

Supported major modes: `trump-map`, `trump-template`
Supported minor modes: `suit-prefix-and-rank-order`, `suit-base-and-rank-order`, `split-number-template`

`rankIndexByKey` provides explicit position overrides for rank names that don't
appear in `rankOrder`. This is used when the card dataset calls court cards by
one naming convention (e.g. Thoth "Prince"/"Princess") but the image files are
numbered by another (e.g. Rider Waite "Page"/"King").

See the `imports/_templates/deck/` folder in the API project for full documentation.

### Text (`texts/<name>/text.json`)

Each text source is a folder containing a `text.json` manifest and one or more
content files.

**With a JSON data file** (most common):

```json
{
  "id": "book-of-the-law",
  "title": "Book of the Law",
  "shortTitle": "Liber AL",
  "tradition": "",
  "language": "English",
  "script": "Latin",
  "workLabel": "Book",
  "sectionLabel": "Chapter",
  "verseLabel": "Verse",
  "input": {
    "path": "Book of the Law.json",
    "format": "structured-json"
  }
}
```

The data file must be a JSON document in one of these formats: `structured-json`,
`chaptered-books`, `sections`, `tokenized-books`, `titled-prose-json`,
`quran-verse-table`.

**With a plain-text file:**

```json
{
  "id": "gospel-of-philip",
  "title": "Gospel of Philip",
  "tradition": "Nag Hammadi",
  "language": "English",
  "workLabel": "Text",
  "sectionLabel": "Saying",
  "verseLabel": "Line",
  "input": {
    "path": "gospel.txt",
    "format": "numbered-aphorisms-text"
  }
}
```

Supported plain-text formats: `numbered-aphorisms-text`, `roman-verse-text`,
`numbered-chapter-prose-text`, `headed-prose-text`, `auto-sectioned-text`

### Pack (`packs/<name>/pack.json`)

A pack ships no content of its own. It is a curated list of decks and texts that
install together in one command.

```json
{
  "id": "abrahamic",
  "name": "Abrahamic Texts",
  "description": "Core Abrahamic scriptures, installed as one set.",
  "items": [
    { "type": "text", "name": "King James Bible" },
    { "type": "text", "name": "Quran" },
    { "type": "deck", "name": "Rider Waite" }
  ]
}
```

Each `name` must match a folder under `decks/` or `texts/`. `dlc check` fails a
pack that references a folder which does not exist. Packs cannot contain packs.

Because a pack is pure metadata, the API reads `pack.json` from git without
downloading decks or texts.

## Full Workflow

```
# First time setup
cd KABBAK-API
npm run dlc -- repo <your-dlc-git-url>

# See what's available
npm run dlc -- list

# Validate and install a deck (downloads only that deck)
npm run dlc -- check
npm run dlc -- install --name "Rider Waite" --rebuild

# Start the server
npm start

# Later: pull new content
npm run dlc -- update
npm run dlc -- list
npm run dlc -- install --name "New Deck" --rebuild
```

