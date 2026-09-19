/* music-player.js — DLC plugin: playlist player for the top bar.
 * Plays uploaded audio files only. Every song lives in one shared `library/`
 * folder; playlists (config.playlists) are ordered checklists of library
 * tracks. Manage songs and playlists in Settings → DLC Shop & Plugins → Music
 * Player.
 * config.json: {
 *   "align": "left" | "center" | "right",
 *   "playlists": [{ "id": "chill", "name": "Chill", "tracks": ["song.mp3"] }]
 * }
 *
 * On phones (native shell or the layout-phone skin) the widget collapses to a
 * mini player in the app bar; tapping it slides up a full-screen sheet with
 * large transport controls, seek/volume, playlist picker and the track list.
 */
(function () {
  "use strict";

  const LIBRARY_DIR = "library";
  const DEFAULT_CONFIG = {
    align: "center",
    playlists: []
  };

  const AUDIO_EXTENSIONS = new Set([
    ".mp3", ".ogg", ".oga", ".wav", ".webm", ".weba", ".m4a", ".m4b", ".mp4",
    ".flac", ".aac", ".opus", ".aiff", ".aif", ".wma", ".alac", ".amr", ".wv"
  ]);

  function displayName(folder) {
    return String(folder || "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()) || "Playlist";
  }

  function isAudioFile(file) {
    const name = String(file?.name || "").toLowerCase();
    if (!name || name.startsWith(".")) return false;
    return AUDIO_EXTENSIONS.has(`.${name.split(".").pop()}`);
  }

  function isPhoneHost() {
    try {
      if (document.documentElement.getAttribute("data-kabbak-native") === "1") return true;
      const skin = String(window.localStorage?.getItem("kabbak-active-skin") || "").trim();
      if (skin === "layout-phone") return true;
      return document.documentElement.getAttribute("data-plugin-skin") === "layout-phone";
    } catch (_error) {
      return false;
    }
  }

  function formatTime(value) {
    if (!Number.isFinite(value) || value < 0) return "0:00";
    const total = Math.floor(value);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  // Config is operator data written by the settings UI to storage/plugin-data,
  // so read it through the config API (redacted) rather than the stock
  // config.json asset, which is only the checkout copy.
  async function loadPluginConfig(helpers) {
    const pluginName = helpers?.pluginName || "music-player";
    if (typeof helpers?.requestJson === "function") {
      try {
        const payload = await helpers.requestJson(
          "GET",
          `/api/v1/plugins/${encodeURIComponent(pluginName)}/config`
        );
        const loaded = payload?.config;
        if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
          return { ...DEFAULT_CONFIG, ...loaded };
        }
      } catch (_error) {}
    }
    try {
      const url = helpers?.assetUrl?.("config.json");
      if (url) {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
          const loaded = await response.json();
          if (loaded && typeof loaded === "object" && !Array.isArray(loaded)) {
            return { ...DEFAULT_CONFIG, ...loaded };
          }
        }
      }
    } catch (_error) {}
    return { ...DEFAULT_CONFIG };
  }

  function createPlayerUi(helpers) {
    const isPhone = helpers.isPhone === true;
    const root = document.createElement("div");
    root.className = "mp-root";
    root.setAttribute("role", "group");
    root.setAttribute("aria-label", "Music Player");

    let config = { ...DEFAULT_CONFIG, ...(helpers.config || {}) };
    const playlists = [];
    const files = [];
    let currentPlaylist = "";
    let trackIndex = 0;
    let currentTrackName = "";
    let audio = null;
    let isPlaying = false;
    let loopEnabled = false;

    // Phone-only elements, assigned when the sheet is built.
    let sheetEl = null;
    let miniEl = null;
    let miniLabelEl = null;

    // Horizontal placement of the whole widget inside the top bar.
    function applyAlignment(align) {
      if (isPhone) return;
      const host = helpers.containerEl;
      if (!host) return;
      const normalized = String(align || "center").trim().toLowerCase();
      if (normalized === "right") {
        host.style.marginLeft = "auto";
        host.style.marginRight = "0";
      } else if (normalized === "center") {
        host.style.marginLeft = "auto";
        host.style.marginRight = "auto";
      } else {
        host.style.marginLeft = "0";
        host.style.marginRight = "auto";
      }
    }

    // Order within a playlist: configured order first, unlisted tracks appended
    // alphabetically.
    function configuredPlaylists() {
      if (Array.isArray(config.playlists) && config.playlists.length) return config.playlists;
      return Object.entries(config.playlistOrder || {}).map(([name, tracks]) => ({
        id: name,
        name: displayName(name),
        tracks: Array.isArray(tracks) ? tracks : []
      }));
    }

    async function indexLibrary() {
      const byName = new Map();
      const addFiles = async (dir) => {
        try {
          const listed = await helpers.listFiles(dir);
          (Array.isArray(listed) ? listed : []).filter(isAudioFile).forEach((file) => {
            const key = String(file.name || "").toLowerCase();
            if (key && !byName.has(key)) byName.set(key, { ...file, dir });
          });
        } catch (_error) {}
      };
      await addFiles(LIBRARY_DIR);
      try {
        const dirs = await helpers.listDirs();
        for (const entry of Array.isArray(dirs) ? dirs : []) {
          const dir = String(entry?.name || "");
          if (!dir || dir === LIBRARY_DIR) continue;
          await addFiles(dir);
        }
      } catch (_error) {}
      return byName;
    }

    async function refreshPlaylists() {
      playlists.splice(0, playlists.length, ...configuredPlaylists());
      playlistSelect.innerHTML = "";
      if (!playlists.length) {
        const option = document.createElement("option");
        option.value = "";
        option.textContent = "— no playlists —";
        playlistSelect.appendChild(option);
      } else {
        playlists.forEach((entry) => {
          const option = document.createElement("option");
          option.value = entry.id;
          option.textContent = entry.name || displayName(entry.id);
          playlistSelect.appendChild(option);
        });
      }
      if (!currentPlaylist || !playlists.some((entry) => entry.id === currentPlaylist)) {
        currentPlaylist = playlists[0]?.id || "";
      }
      playlistSelect.value = currentPlaylist;
      await refreshFiles();
    }

    async function refreshFiles() {
      const playlist = playlists.find((entry) => entry.id === currentPlaylist);
      const wanted = Array.isArray(playlist?.tracks) ? playlist.tracks : [];
      const library = await indexLibrary();
      const nextFiles = wanted.map((name) => library.get(String(name).toLowerCase())).filter(Boolean);
      files.splice(0, files.length, ...nextFiles);
      if (currentTrackName) {
        const foundIndex = files.findIndex((file) => file.name === currentTrackName);
        trackIndex = foundIndex >= 0 ? foundIndex : Math.min(trackIndex, files.length - 1);
      }
      refreshTrackOptions();
      if (files.length && (!audio || !audio.src)) {
        loadTrack(Math.max(0, Math.min(trackIndex, files.length - 1)));
      }
      syncPlayUi();
    }

    async function refreshFromConfig() {
      const loaded = await loadPluginConfig(helpers);
      config = { ...DEFAULT_CONFIG, ...loaded };
      applyAlignment(config.align);
      // Rebuild the playlist list from the reloaded config before refreshing
      // tracks; refreshing them in parallel reads the stale config and leaves
      // newly created playlists/saved songs missing until a full remount.
      await refreshPlaylists();
    }

    const onContentUpdated = (event) => {
      if (String(event?.detail?.pluginName || "") === "music-player") {
        void refreshFromConfig();
      }
    };
    document.addEventListener("taro-plugin-content-updated", onContentUpdated);

    const playBtn = document.createElement("button");
    playBtn.type = "button";
    playBtn.className = "mp-play";
    playBtn.setAttribute("aria-label", "Play/Pause");

    const playlistSelect = document.createElement("select");
    playlistSelect.className = "mp-preset";
    playlistSelect.setAttribute("aria-label", "Playlist");

    const songBtn = document.createElement("button");
    songBtn.type = "button";
    songBtn.className = "mp-song-btn";
    songBtn.setAttribute("aria-label", "Choose song");
    songBtn.setAttribute("aria-expanded", "false");
    songBtn.textContent = "Songs";

    const songPanel = document.createElement("div");
    songPanel.className = "mp-tracks-panel";
    songPanel.hidden = true;

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "mp-play";
    prevBtn.textContent = "⏮";
    prevBtn.setAttribute("aria-label", "Previous track");

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "mp-play";
    nextBtn.textContent = "⏭";
    nextBtn.setAttribute("aria-label", "Next track");

    const loopBtn = document.createElement("button");
    loopBtn.type = "button";
    loopBtn.className = "mp-play";
    loopBtn.textContent = "🔁";
    loopBtn.setAttribute("aria-label", "Toggle loop");
    loopBtn.classList.toggle("is-active", loopEnabled);

    const seek = document.createElement("input");
    seek.type = "range";
    seek.className = "mp-volume";
    seek.min = "0";
    seek.max = "100";
    seek.step = "0.1";
    seek.value = "0";
    seek.setAttribute("aria-label", "Seek");
    seek.disabled = true;

    const volume = document.createElement("input");
    volume.type = "range";
    volume.className = "mp-volume";
    volume.min = "0";
    volume.max = "1";
    volume.step = "0.01";
    volume.value = "0.75";
    volume.setAttribute("aria-label", "Volume");

    const nowTitle = document.createElement("div");
    nowTitle.className = "mp-now-title";
    const nowSub = document.createElement("div");
    nowSub.className = "mp-now-sub";
    const timeCur = document.createElement("span");
    timeCur.className = "mp-time";
    timeCur.textContent = "0:00";
    const timeTotal = document.createElement("span");
    timeTotal.className = "mp-time";
    timeTotal.textContent = "0:00";

    function setSongPanelOpen(open) {
      if (isPhone) {
        songBtn.setAttribute("aria-expanded", "true");
        return;
      }
      songPanel.hidden = !open;
      songBtn.setAttribute("aria-expanded", open ? "true" : "false");
    }

    function renderNowPlaying() {
      const current = files[trackIndex];
      const list = playlists.find((entry) => entry.id === currentPlaylist);
      const title = current ? current.name.replace(/\.[^.]+$/, "") : "No track";
      nowTitle.textContent = title;
      nowSub.textContent = list?.name || "";
      if (miniLabelEl) miniLabelEl.textContent = current ? title : "Music";
      if (miniEl) miniEl.classList.toggle("is-playing", isPlaying);
    }

    function refreshTrackOptions() {
      songPanel.innerHTML = "";
      if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "mp-tracks-empty";
        empty.textContent = currentPlaylist
          ? "No songs in this playlist. Add and tick songs in Settings → DLC Shop."
          : "No playlists yet. Upload songs in Settings → DLC Shop.";
        songPanel.appendChild(empty);
        songBtn.textContent = "Songs";
        renderNowPlaying();
        return;
      }
      files.forEach((file, index) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "mp-track-name";
        row.classList.toggle("is-current", index === trackIndex);
        row.textContent = file.name.replace(/\.[^.]+$/, "");
        row.addEventListener("click", () => {
          loadTrack(index);
          setSongPanelOpen(false);
          pauseFiles();
          playFiles();
        });
        songPanel.appendChild(row);
      });
      const current = files[trackIndex];
      songBtn.textContent = current ? current.name.replace(/\.[^.]+$/, "") : "Songs";
      renderNowPlaying();
    }

    function loadTrack(index) {
      if (!files.length) {
        trackIndex = 0;
        currentTrackName = "";
        return;
      }
      trackIndex = Math.min(files.length - 1, Math.max(0, Number(index) || 0));
      if (!audio) {
        audio = new Audio();
        audio.preload = "metadata";
        audio.loop = false;
        audio.addEventListener("ended", handleTrackEnded);
        audio.addEventListener("loadedmetadata", () => {
          if (isPhone) {
            timeTotal.textContent = formatTime(audio.duration);
          }
        });
      }
      const file = files[trackIndex];
      currentTrackName = file.name;
      const trackDir = String(file.dir || LIBRARY_DIR).trim() || LIBRARY_DIR;
      const trackName = String(file.name || "").trim();
      audio.src = trackName ? helpers.fileUrl(trackDir, trackName) : "";
      audio.volume = Number(volume.value) || 0.75;
      if (isPhone) {
        timeCur.textContent = "0:00";
        timeTotal.textContent = "0:00";
      }
      refreshTrackOptions();
    }

    function syncPlayUi() {
      playBtn.textContent = isPlaying ? "❚❚" : "▶";
      playBtn.classList.toggle("is-playing", isPlaying);
      const hasTracks = files.length > 0;
      playBtn.disabled = !hasTracks;
      songBtn.disabled = !hasTracks;
      playlistSelect.disabled = !playlists.length;
      prevBtn.disabled = !hasTracks;
      nextBtn.disabled = !hasTracks;
      if (!hasTracks) {
        seek.value = "0";
        seek.disabled = true;
      }
      renderNowPlaying();
    }

    function playFiles() {
      if (!files.length) return;
      if (!audio) loadTrack(trackIndex);
      void audio.play().then(() => {
        isPlaying = true;
        seek.disabled = false;
        syncPlayUi();
      }).catch(() => {
        isPlaying = false;
        syncPlayUi();
      });
    }

    function pauseFiles() {
      if (!audio) return;
      audio.pause();
      isPlaying = false;
      syncPlayUi();
    }

    function stopAll() {
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        try { audio.load(); } catch {}
        audio = null;
      }
      isPlaying = false;
      seek.value = "0";
      seek.disabled = true;
      if (isPhone) {
        timeCur.textContent = "0:00";
        timeTotal.textContent = "0:00";
      }
      syncPlayUi();
    }

    const handleTrackEnded = () => {
      if (!audio || !files.length) return;
      if (loopEnabled || trackIndex < files.length - 1) {
        loadTrack((trackIndex + 1) % files.length);
        playFiles();
      } else {
        isPlaying = false;
        seek.value = "0";
        syncPlayUi();
      }
    };

    playBtn.addEventListener("click", () => {
      if (isPlaying) pauseFiles();
      else playFiles();
    });
    volume.addEventListener("input", () => {
      const value = Number(volume.value) || 0;
      if (audio) audio.volume = value;
    });
    playlistSelect.addEventListener("change", () => {
      currentPlaylist = playlistSelect.value;
      currentTrackName = "";
      trackIndex = 0;
      stopAll();
      void refreshFiles();
    });
    songBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      setSongPanelOpen(songPanel.hidden);
    });
    const onDocumentClick = (event) => {
      if (isPhone) return;
      if (!root.contains(event.target)) setSongPanelOpen(false);
    };
    document.addEventListener("click", onDocumentClick);
    prevBtn.addEventListener("click", () => {
      if (!files.length) return;
      const wasPlaying = isPlaying;
      loadTrack((trackIndex - 1 + files.length) % files.length);
      if (wasPlaying) {
        pauseFiles();
        playFiles();
      }
    });
    nextBtn.addEventListener("click", () => {
      if (!files.length) return;
      const wasPlaying = isPlaying;
      loadTrack((trackIndex + 1) % files.length);
      if (wasPlaying) {
        pauseFiles();
        playFiles();
      }
    });
    loopBtn.addEventListener("click", () => {
      loopEnabled = !loopEnabled;
      loopBtn.classList.toggle("is-active", loopEnabled);
    });
    seek.addEventListener("input", () => {
      if (!audio || !Number.isFinite(audio.duration)) return;
      audio.currentTime = (Number(seek.value) / 100) * audio.duration;
    });
    const timeInterval = window.setInterval(() => {
      if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
        seek.value = String((audio.currentTime / audio.duration) * 100);
        if (isPhone) {
          timeCur.textContent = formatTime(audio.currentTime);
          timeTotal.textContent = formatTime(audio.duration);
        }
      }
    }, 500);

    function buildPhoneUi() {
      root.classList.add("mp-root--phone");

      miniEl = document.createElement("button");
      miniEl.type = "button";
      miniEl.className = "mp-mini";
      miniEl.setAttribute("aria-label", "Open music player");
      miniEl.innerHTML = `
        <span class="mp-mini-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M9 18V6.4l9.5-1.9V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16" cy="16" r="2.5"/></svg>
        </span>
        <span class="mp-mini-label">Music</span>
      `;
      miniLabelEl = miniEl.querySelector(".mp-mini-label");

      sheetEl = document.createElement("div");
      sheetEl.className = "mp-sheet";
      sheetEl.hidden = true;

      const backdrop = document.createElement("button");
      backdrop.type = "button";
      backdrop.className = "mp-sheet-backdrop";
      backdrop.setAttribute("aria-label", "Close music player");

      const panel = document.createElement("div");
      panel.className = "mp-sheet-panel";
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Music player");

      const handle = document.createElement("div");
      handle.className = "mp-sheet-handle";

      const head = document.createElement("div");
      head.className = "mp-sheet-head";
      const now = document.createElement("div");
      now.className = "mp-now";
      now.appendChild(nowTitle);
      now.appendChild(nowSub);
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "mp-sheet-close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.textContent = "×";
      head.appendChild(now);
      head.appendChild(closeBtn);

      const seekRow = document.createElement("div");
      seekRow.className = "mp-seek-row";
      seekRow.appendChild(timeCur);
      seekRow.appendChild(seek);
      seekRow.appendChild(timeTotal);

      const transport = document.createElement("div");
      transport.className = "mp-transport";
      transport.appendChild(prevBtn);
      transport.appendChild(playBtn);
      transport.appendChild(nextBtn);
      transport.appendChild(loopBtn);

      const metaRow = document.createElement("div");
      metaRow.className = "mp-meta-row";
      metaRow.appendChild(playlistSelect);
      metaRow.appendChild(volume);

      const controls = document.createElement("div");
      controls.className = "mp-controls";
      controls.appendChild(seekRow);
      controls.appendChild(transport);
      controls.appendChild(metaRow);

      const tracks = document.createElement("div");
      tracks.className = "mp-sheet-tracks";
      songPanel.hidden = false;
      tracks.appendChild(songPanel);

      panel.appendChild(handle);
      panel.appendChild(head);
      panel.appendChild(controls);
      panel.appendChild(tracks);
      sheetEl.appendChild(backdrop);
      sheetEl.appendChild(panel);

      const setOpen = (open) => {
        sheetEl.hidden = !open;
        root.classList.toggle("is-sheet-open", open);
        document.documentElement.classList.toggle("kabbak-mp-sheet-open", open);
        if (open) {
          miniEl.setAttribute("aria-expanded", "true");
        } else {
          miniEl.removeAttribute("aria-expanded");
        }
      };
      miniEl.addEventListener("click", () => setOpen(sheetEl.hidden));
      closeBtn.addEventListener("click", () => setOpen(false));
      backdrop.addEventListener("click", () => setOpen(false));
      sheetEl._mpClose = () => setOpen(false);

      root.appendChild(miniEl);
      // The app bar clips and creates a containing block for fixed children, so
      // the sheet lives on <body> instead of inside the widget.
      document.body.appendChild(sheetEl);
    }

    function buildDesktopUi() {
      root.appendChild(playBtn);
      root.appendChild(playlistSelect);
      root.appendChild(songBtn);
      root.appendChild(songPanel);
      root.appendChild(prevBtn);
      root.appendChild(nextBtn);
      root.appendChild(loopBtn);
      root.appendChild(seek);
      root.appendChild(volume);
    }

    if (isPhone) {
      buildPhoneUi();
    } else {
      buildDesktopUi();
    }

    void refreshPlaylists();
    applyAlignment(config.align);
    syncPlayUi();

    return {
      root,
      dispose() {
        document.removeEventListener("taro-plugin-content-updated", onContentUpdated);
        document.removeEventListener("click", onDocumentClick);
        window.clearInterval(timeInterval);
        document.documentElement.classList.remove("kabbak-mp-sheet-open");
        if (sheetEl) {
          sheetEl.remove();
          sheetEl = null;
        }
        stopAll();
      }
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[music-player] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "music-player",
    name: "Music Player",
    version: "2.6.0",
    mount(containerEl, helpers) {
      const isPhone = isPhoneHost();
      let ui = null;
      let disposed = false;
      const init = async () => {
        const config = await loadPluginConfig(helpers);
        if (disposed) return;
        ui = createPlayerUi({ ...helpers, config, containerEl, isPhone });
        containerEl.appendChild(ui.root);
      };
      void init();
      // The host calls this on unmount. Returning it is what actually disposes
      // the timer and document listeners; the old code relied on a "remove"
      // event the host never fires.
      return () => {
        disposed = true;
        if (ui) ui.dispose();
      };
    }
  });
})();
