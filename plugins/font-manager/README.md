# Font Manager

A DLC plugin that adds an admin **Fonts** section. Admins can upload font files and choose which families the site uses for main text, display/headings, Arabic, Enochian, and CJK.

The built-in font catalog (`GET /api/v1/fonts`, `GET /api/v1/fonts.css`, `/assets/fonts/*`) is unchanged. That catalog supplies the default families, the I Ching and Enochian symbol fonts, and the bot's glyph rendering. The plugin layers operator-uploaded text fonts on top by setting the GUI's `--font-custom-*` variables. It does not replace `fonts.json` and does not require a data migration.

## Use

1. Install/enable **Font Manager** in Admin → DLC.
2. Open **Fonts** in the top bar (admins only).
3. Upload a `.woff2`, `.woff`, `.ttf`, or `.otf` file (20 MB maximum). Choose the family name and a script preset; the preset fills a suitable `unicode-range` so a Hebrew or Greek font does not take over Latin text. You can edit the range.
4. In **Where each family is used**, add families to a stack. Order matters: the first family is tried first. Leave a stack empty to use the built-in fonts.
5. **Save assignments**. The font is applied to the whole site for every signed-in user.

Assignments are stored in `storage/plugin-data/font-manager/config.json`. Uploaded files and metadata live in `storage/plugin-data/font-manager/media/fonts/` and `fonts.json`; both survive plugin updates and uninstalls, and are never written into the plugin checkout.

## Limitations

- This manager covers text fonts. The I Ching and Enochian **symbol glyphs** are rendered through the built-in catalog (`KabbakFonts.symbol()`); uploading a symbol font here does not replace those glyph maps. Keep symbol fonts in the core catalog.
- The browser loads uploaded files with the API key via blob URLs, so the GUI origin must be in **Allowed origins** (`KABBAK_ALLOWED_ORIGINS` or Admin → Server). The API's plugin server routes are mounted before the global key middleware, so the plugin enforces `requireApiKey` + admin capability itself.
- The plugin server routes are not hot-loaded by install alone. Restart the API or use Admin → DLC → Reload (or `POST /api/v1/admin/dlc/reload`) after installing or updating the plugin so `server.js` is mounted.
- If you add another stack in the core GUI (`main`, `display`, `arabic`, `enochian`, `cjk`), also update the plugin's stack list and the server's `STACKS`.

## Routes

All routes are under `/api/v1/plugins/font-manager/server`:

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /fonts` | any valid API key | Font library, assignments, limits |
| `GET /settings` | any valid API key | Current assignments |
| `GET /fonts/:file` | any valid API key | Font bytes with the correct MIME type |
| `POST /fonts` | admin | Upload `{ fileName, family, script, weight, style, unicodeRange, data }` |
| `DELETE /fonts/:file` | admin | Delete a font and prune its assignments |
| `POST /settings` | admin | Save `{ assignments }` |

`data` is a base64 data URL. Supported `script` presets are `latin`, `hebrew`, `greek`, `arabic`, `enochian`, `cjk`, and `custom`.
