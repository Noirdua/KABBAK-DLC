# Terminal Layout

A `role: "skin"` DLC plugin that replaces the top bar with a fixed left index and a thin breadcrumb bar. App pages keep their own layouts; only the chrome and home area change.

## Install

1. `npm run dlc -- update` in `KABBAK-API`
2. Install **Terminal Layout** from Admin → DLC or `npm run dlc -- install --name "Terminal Layout" --rebuild`
3. Choose it in **Settings → UI Overhaul → Terminal Layout**

The skin reads the live menu through `TaroTimePluginHost.listNav()`, so the **Menu Order** plugin controls its grouping, ordering, labels, and hidden entries.

## Config

Edit `config.json` in Settings → DLC Shop & Plugins → Terminal Layout.

```json
{
  "followTheme": false,
  "colors": {},
  "brand": "kabbak",
  "byline": "correspondence archive",
  "showSearch": true,
  "sidebarWidth": 264
}
```

- `followTheme: true` remaps the terminal variables to the app's `--tt-*` theme tokens. Individual values in `colors` still win.
- `colors` accepts `bg`, `panel`, `raised`, `line`, `text`, `bright`, `muted`, `dim`, `accent`, and `green` with hex, rgb/hsl, or `var(--token)` values.
- `sidebarWidth` is clamped to 220–340px.
- `showSearch: false` hides the menu search box.

Do not name custom fields with `key`, `secret`, `password`, or `token`; the API redacts those on config reads.

## Pairing

Use with **Terminal Homepage** for the full pwn.watch-style home feed. The skin exposes its palette as `--terminal-*` variables, so the homepage inherits it automatically. If the homepage uses its own colors, they are ignored while this skin is active; set the colors here instead.

## Notes

- `/` focuses the menu search (or the homepage search on Home).
- `Escape` closes the mobile drawer.
- `Alt+Left` still goes back; the top-bar back button also returns from a drilled-down list.
- Top-bar widgets (the music player, etc.) stay in the top bar. On very narrow screens they wrap onto their own row beneath the breadcrumbs.
