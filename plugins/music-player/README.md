# Music Player

Top-bar playlist player for KABBAK.

- **One shared library.** Every uploaded song lives in `library/`. Upload once,
  reuse it across any playlist.
- **Playlists are checklists.** A playlist (`config.playlists`) is an ordered
  list of library track names — it does not copy the audio.

## Managing music

Open **Settings → DLC Shop & Plugins → Music Player** (admin key required):

1. **Upload to library** to add songs (mp3, ogg, wav, webm, m4a, flac, aac,
   opus, aiff, wma, m4b, and more).
2. **New playlist**, then tick the songs it should include.
3. **Save Playlist**. Use the up/down controls to set track order.

## Files

| Path | Purpose |
| --- | --- |
| `library/` | Uploaded audio (managed by the app) |
| `config.json` | `align` and `playlists` (written by the app) |
| `manifest.json` | Plugin manifest |
| `music-player.js` / `.css` | Widget entry and styles |

Ships blank — no bundled sample track.
