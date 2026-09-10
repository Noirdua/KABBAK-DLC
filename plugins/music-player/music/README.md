# Music folder

Drop audio files in here (mp3, ogg, wav, webm, m4a). Every folder inside the
plugin is a playlist — create more from the DLC shop, and the top bar player
gets a playlist selector.

- Playback order follows `playlistOrder` in config.json (top first); reorder
  tracks from Settings > DLC Shop & Plugins > Music Player > Settings.
- Files not listed in a playlist's order are appended alphabetically.
- Non-audio files (README, etc.) never appear in playlists.
- Hidden files (starting with `.`) are ignored.
