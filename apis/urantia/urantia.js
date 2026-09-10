(function () {
  "use strict";

  const BASE = "/api/v1/integrations/urantia";
  const ENTITY_TYPES = ["", "being", "place", "order", "race", "religion", "concept"];
  const ENTITY_LANGS = [
    { code: "", label: "English" },
    { code: "es", label: "Spanish" },
    { code: "fr", label: "French" },
    { code: "pt", label: "Portuguese" },
    { code: "de", label: "German" },
    { code: "ko", label: "Korean" }
  ];

  function unwrap(payload) {
    if (payload && typeof payload === "object" && "data" in payload) return payload.data;
    return payload;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function paraRef(para) {
    return String(para?.ref || para?.standardReferenceId || para?.id || "").trim();
  }

  function paraText(para) {
    return String(para?.text || para?.content || para?.snippet || "").trim();
  }

  function pickAudio(para) {
    const audio = para?.audio;
    if (!audio || typeof audio !== "object") return [];
    const clips = [];
    Object.entries(audio).forEach(([model, voices]) => {
      if (!voices || typeof voices !== "object") return;
      Object.entries(voices).forEach(([voice, clip]) => {
        if (clip?.url) {
          clips.push({
            model,
            voice,
            url: clip.url,
            duration: clip.duration,
            format: clip.format || "mp3"
          });
        }
      });
    });
    clips.sort((a, b) => {
      const score = (clip) => (clip.model === "tts-1-hd" && clip.voice === "nova" ? 0 : 1);
      return score(a) - score(b);
    });
    return clips;
  }

  function mount(root, helpers) {
    root.innerHTML = "";
    const shell = el("div", "urantia-shell");
    const head = el("div", "urantia-head");
    head.appendChild(el("h1", "", "The Urantia Book"));
    head.appendChild(el("p", "", "Read, listen, search, and browse entities via api.urantia.dev"));

    const tabs = el("div", "urantia-tabs");
    const tabDefs = [
      ["browse", "Browse"],
      ["lookup", "Lookup"],
      ["search", "Search"],
      ["entities", "Entities"],
      ["random", "Random"]
    ];
    const tabButtons = {};
    tabDefs.forEach(([id, label]) => {
      const button = el("button", id === "browse" ? "is-active" : "", label);
      button.addEventListener("click", () => setMode(id));
      tabButtons[id] = button;
      tabs.appendChild(button);
    });

    const status = el("div", "urantia-status");
    const body = el("div", "urantia-body");
    shell.append(head, tabs, status, body);
    root.appendChild(shell);

    let mode = "browse";
    let toc = null;
    let crumb = [];
    let entityPage = 0;
    let entityQuery = "";
    let entityType = "";
    let entityLang = "";

    function setStatus(text, isError) {
      status.textContent = text || "";
      status.classList.toggle("is-error", Boolean(isError));
    }

    function setMode(next) {
      mode = next;
      Object.entries(tabButtons).forEach(([id, button]) => {
        button.classList.toggle("is-active", id === mode);
      });
      if (mode === "browse") void renderBrowse();
      if (mode === "lookup") renderLookup();
      if (mode === "search") renderSearch();
      if (mode === "entities") void renderEntities();
      if (mode === "random") void renderRandom();
    }

    async function api(method, path, payload) {
      return helpers.requestJson(method, `${BASE}${path}`, payload);
    }

    async function loadToc() {
      if (toc) return toc;
      setStatus("Loading table of contents…");
      toc = unwrap(await api("GET", "/toc"));
      setStatus("");
      return toc;
    }

    function renderCrumb(homeLabel, onHome) {
      const row = el("div", "urantia-crumb");
      const home = el("button", "", homeLabel);
      home.addEventListener("click", onHome);
      row.appendChild(home);
      crumb.forEach((entry, index) => {
        row.appendChild(document.createTextNode(" / "));
        const btn = el("button", "", entry.label);
        btn.addEventListener("click", () => {
          crumb = crumb.slice(0, index + 1);
          void renderBrowse();
        });
        row.appendChild(btn);
      });
      return row;
    }

    function attachAudio(card, para) {
      const clips = pickAudio(para);
      const wrap = el("div", "urantia-audio");
      if (!clips.length) {
        const loadBtn = el("button", "urantia-btn", "Load audio");
        loadBtn.addEventListener("click", async () => {
          const ref = paraRef(para);
          if (!ref) return;
          loadBtn.disabled = true;
          try {
            const info = unwrap(await api("GET", `/audio/${encodeURIComponent(ref)}`));
            para.audio = info?.audio || info;
            wrap.replaceWith(attachAudio(card, para) || wrap);
          } catch (error) {
            setStatus(error.message || "Audio unavailable.", true);
            loadBtn.disabled = false;
          }
        });
        wrap.appendChild(loadBtn);
        card.appendChild(wrap);
        return wrap;
      }
      const select = el("select", "urantia-select");
      clips.forEach((clip, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        const mins = Number(clip.duration) ? ` · ${Number(clip.duration).toFixed(0)}s` : "";
        option.textContent = `${clip.voice} (${clip.model})${mins}`;
        select.appendChild(option);
      });
      const player = document.createElement("audio");
      player.controls = true;
      player.preload = "none";
      player.src = clips[0].url;
      select.addEventListener("change", () => {
        const clip = clips[Number(select.value)] || clips[0];
        player.src = clip.url;
      });
      wrap.append(select, player);
      card.appendChild(wrap);
      return wrap;
    }

    function attachEntities(card, para, onOpenEntity) {
      const mentions = Array.isArray(para.entities) ? para.entities : [];
      if (!mentions.length) return;
      const row = el("div", "urantia-chips");
      mentions.forEach((entity) => {
        const chip = el("button", "urantia-chip", entity.name || entity.id);
        chip.title = entity.type || "";
        chip.addEventListener("click", () => onOpenEntity(entity.id));
        row.appendChild(chip);
      });
      card.appendChild(row);
    }

    function renderParagraphCard(para, options = {}) {
      const card = el("article", "urantia-para");
      const ref = paraRef(para);
      const title = el("strong", "", ref || para.citation || "Paragraph");
      card.appendChild(title);
      if (para.citation && para.citation !== ref) {
        card.appendChild(el("div", "urantia-meta", para.citation));
      }
      card.appendChild(el("p", "", paraText(para) || "(empty)"));
      attachEntities(card, para, (entityId) => {
        crumb = [];
        void openEntity(entityId);
      });
      attachAudio(card, para);
      const nav = para.navigation || {};
      if (options.showNav && (nav.prev || nav.next || ref)) {
        const actions = el("div", "urantia-inline");
        if (nav.prev) {
          const prev = el("button", "urantia-btn", `Prev ${nav.prev}`);
          prev.addEventListener("click", () => void openParagraph(nav.prev));
          actions.appendChild(prev);
        }
        if (nav.next) {
          const next = el("button", "urantia-btn", `Next ${nav.next}`);
          next.addEventListener("click", () => void openParagraph(nav.next));
          actions.appendChild(next);
        }
        const context = el("button", "urantia-btn", "Context");
        context.addEventListener("click", () => void openContext(ref));
        actions.appendChild(context);
        card.appendChild(actions);
      }
      return card;
    }

    function collectParagraphs(paper) {
      if (!paper) return [];
      if (Array.isArray(paper.paragraphs)) return paper.paragraphs;
      if (Array.isArray(paper.sections)) {
        return paper.sections.flatMap((section) => Array.isArray(section.paragraphs) ? section.paragraphs : []);
      }
      if (Array.isArray(paper)) return paper;
      return [];
    }

    async function openParagraph(ref) {
      mode = "lookup";
      Object.entries(tabButtons).forEach(([id, button]) => button.classList.toggle("is-active", id === "lookup"));
      body.innerHTML = "";
      setStatus(`Loading ${ref}…`);
      try {
        const para = unwrap(await api("GET", `/paragraphs/${encodeURIComponent(ref)}?format=rag&include=entities`));
        setStatus(para.citation || "");
        body.appendChild(renderParagraphCard(para, { showNav: true }));
      } catch (error) {
        setStatus(error.message || "Paragraph not found.", true);
      }
    }

    async function openContext(ref) {
      setStatus(`Loading context for ${ref}…`);
      try {
        const payload = unwrap(await api("GET", `/paragraphs/${encodeURIComponent(ref)}/context?window=3&include=entities`));
        const paragraphs = Array.isArray(payload?.paragraphs) ? payload.paragraphs
          : Array.isArray(payload) ? payload : [];
        body.innerHTML = "";
        body.appendChild(el("div", "urantia-meta", `Context around ${ref}`));
        const list = el("div", "urantia-list");
        paragraphs.forEach((para) => list.appendChild(renderParagraphCard(para, { showNav: true })));
        body.appendChild(list);
        setStatus(`${paragraphs.length} paragraphs`);
      } catch (error) {
        setStatus(error.message || "Context unavailable.", true);
      }
    }

    async function renderBrowse() {
      body.innerHTML = "";
      body.appendChild(renderCrumb("All parts", () => {
        crumb = [];
        void renderBrowse();
      }));
      const list = el("div", "urantia-list");
      body.appendChild(list);
      try {
        const catalog = await loadToc();
        const parts = Array.isArray(catalog?.parts) ? catalog.parts : [];
        const level = crumb[crumb.length - 1];
        if (!level) {
          parts.forEach((part) => {
            const btn = el("button", "urantia-item");
            btn.appendChild(el("strong", "", part.title || `Part ${part.id}`));
            btn.appendChild(el("span", "", `${Array.isArray(part.papers) ? part.papers.length : 0} papers`));
            btn.addEventListener("click", () => {
              crumb = [{ type: "part", id: part.id, label: part.title || `Part ${part.id}` }];
              void renderBrowse();
            });
            list.appendChild(btn);
          });
          return;
        }
        if (level.type === "part") {
          const part = parts.find((entry) => String(entry.id) === String(level.id));
          (part?.papers || []).forEach((paper) => {
            const btn = el("button", "urantia-item");
            btn.appendChild(el("strong", "", `${paper.id}. ${paper.title || "Untitled"}`));
            btn.addEventListener("click", () => {
              crumb = [...crumb, { type: "paper", id: paper.id, label: `${paper.id}. ${paper.title || ""}` }];
              void renderBrowse();
            });
            list.appendChild(btn);
          });
          return;
        }
        if (level.type === "paper") {
          setStatus("Loading paper…");
          const sections = unwrap(await api("GET", `/papers/${encodeURIComponent(level.id)}/sections`));
          setStatus("");
          (Array.isArray(sections) ? sections : []).forEach((section) => {
            const btn = el("button", "urantia-item");
            const title = section.title || `Section ${section.sectionId}`;
            btn.appendChild(el("strong", "", `${section.sectionId}. ${title}`));
            btn.addEventListener("click", () => {
              crumb = [...crumb, { type: "section", id: section.sectionId, paperId: level.id, label: title }];
              void renderBrowse();
            });
            list.appendChild(btn);
          });
          return;
        }
        if (level.type === "section") {
          setStatus("Loading section…");
          const paper = unwrap(await api("GET", `/papers/${encodeURIComponent(level.paperId)}?include=entities`));
          setStatus("");
          const paragraphs = collectParagraphs(paper).filter((para) => (
            String(para.sectionId ?? para.metadata?.sectionId ?? "") === String(level.id)
          ));
          (paragraphs.length ? paragraphs : collectParagraphs(paper)).forEach((para) => {
            list.appendChild(renderParagraphCard(para, { showNav: true }));
          });
        }
      } catch (error) {
        setStatus(error.message || "Could not load Urantia content.", true);
      }
    }

    function renderLookup() {
      body.innerHTML = "";
      const form = el("div", "urantia-search");
      const input = el("input");
      input.type = "text";
      input.placeholder = "Paragraph ref, e.g. 1:0.1 or 119:1.5";
      const go = el("button", "urantia-btn urantia-btn-primary", "Open");
      form.append(input, go);
      body.appendChild(form);
      go.addEventListener("click", () => {
        const ref = String(input.value || "").trim();
        if (ref) void openParagraph(ref);
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          const ref = String(input.value || "").trim();
          if (ref) void openParagraph(ref);
        }
      });
    }

    function renderSearch() {
      body.innerHTML = "";
      const form = el("div", "urantia-search");
      const input = el("input");
      input.type = "search";
      input.placeholder = "Search the papers…";
      const typeSelect = el("select", "urantia-select");
      [["and", "All words"], ["or", "Any word"], ["phrase", "Exact phrase"], ["semantic", "Semantic"]].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        typeSelect.appendChild(option);
      });
      const go = el("button", "urantia-btn urantia-btn-primary", "Search");
      form.append(input, typeSelect, go);
      const list = el("div", "urantia-list");
      body.append(form, list);

      async function run() {
        const q = String(input.value || "").trim();
        if (!q) return;
        setStatus("Searching…");
        list.innerHTML = "";
        try {
          const kind = typeSelect.value;
          const path = kind === "semantic" ? "/search/semantic" : "/search";
          const payload = unwrap(await api("POST", path, {
            q,
            type: kind === "semantic" ? undefined : kind,
            limit: 12,
            include: "entities"
          }));
          const results = Array.isArray(payload?.results) ? payload.results
            : Array.isArray(payload?.matches) ? payload.matches
              : Array.isArray(payload) ? payload : [];
          setStatus(results.length ? `${results.length} matches` : "No matches");
          results.forEach((hit) => list.appendChild(renderParagraphCard(hit, { showNav: true })));
        } catch (error) {
          setStatus(error.message || "Search failed.", true);
        }
      }
      go.addEventListener("click", () => void run());
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") void run();
      });
    }

    async function openEntity(entityId) {
      mode = "entities";
      Object.entries(tabButtons).forEach(([id, button]) => button.classList.toggle("is-active", id === "entities"));
      body.innerHTML = "";
      setStatus("Loading entity…");
      try {
        const langQuery = entityLang ? `?lang=${encodeURIComponent(entityLang)}` : "";
        const entity = unwrap(await api("GET", `/entities/${encodeURIComponent(entityId)}${langQuery}`));
        const card = el("article", "urantia-para");
        card.appendChild(el("strong", "", entity.name || entity.id));
        card.appendChild(el("div", "urantia-meta", [entity.type, entity.language, entity.citationCount != null ? `${entity.citationCount} citations` : ""].filter(Boolean).join(" · ")));
        if (Array.isArray(entity.aliases) && entity.aliases.length) {
          card.appendChild(el("div", "urantia-meta", `Also: ${entity.aliases.join(", ")}`));
        }
        if (entity.description) card.appendChild(el("p", "", entity.description));
        if (Array.isArray(entity.seeAlso) && entity.seeAlso.length) {
          const related = el("div", "urantia-chips");
          entity.seeAlso.forEach((relatedId) => {
            const chip = el("button", "urantia-chip", relatedId);
            chip.addEventListener("click", () => void openEntity(relatedId));
            related.appendChild(chip);
          });
          card.appendChild(related);
        }
        body.appendChild(card);
        setStatus("Loading cited paragraphs…");
        const cited = unwrap(await api("GET", `/entities/${encodeURIComponent(entityId)}/paragraphs?limit=8`));
        const paragraphs = Array.isArray(cited?.results) ? cited.results
          : Array.isArray(cited?.paragraphs) ? cited.paragraphs
            : Array.isArray(cited) ? cited : [];
        const list = el("div", "urantia-list");
        paragraphs.forEach((para) => list.appendChild(renderParagraphCard(para, { showNav: true })));
        body.appendChild(list);
        setStatus(paragraphs.length ? `${paragraphs.length} cited paragraphs` : "No cited paragraphs returned.");
      } catch (error) {
        setStatus(error.message || "Entity not found.", true);
      }
    }

    async function renderEntities() {
      body.innerHTML = "";
      const form = el("div", "urantia-search");
      const input = el("input");
      input.type = "search";
      input.placeholder = "Search beings, places, concepts…";
      input.value = entityQuery;
      const typeSelect = el("select", "urantia-select");
      ENTITY_TYPES.forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type ? type : "All types";
        if (type === entityType) option.selected = true;
        typeSelect.appendChild(option);
      });
      const langSelect = el("select", "urantia-select");
      ENTITY_LANGS.forEach((lang) => {
        const option = document.createElement("option");
        option.value = lang.code;
        option.textContent = lang.label;
        if (lang.code === entityLang) option.selected = true;
        langSelect.appendChild(option);
      });
      const go = el("button", "urantia-btn urantia-btn-primary", "Find");
      form.append(input, typeSelect, langSelect, go);
      const list = el("div", "urantia-list");
      const pager = el("div", "urantia-inline");
      body.append(form, list, pager);

      async function load() {
        entityQuery = String(input.value || "").trim();
        entityType = typeSelect.value;
        entityLang = langSelect.value;
        const params = new URLSearchParams({ limit: "20", page: String(entityPage) });
        if (entityQuery) params.set("q", entityQuery);
        if (entityType) params.set("type", entityType);
        if (entityLang) params.set("lang", entityLang);
        setStatus("Loading entities…");
        list.innerHTML = "";
        pager.innerHTML = "";
        try {
          const rows = unwrap(await api("GET", `/entities?${params.toString()}`));
          const entities = Array.isArray(rows) ? rows : [];
          setStatus(entities.length ? `Showing ${entities.length} entities` : "No entities");
          entities.forEach((entity) => {
            const btn = el("button", "urantia-item");
            btn.appendChild(el("strong", "", entity.name || entity.id));
            btn.appendChild(el("span", "", [entity.type, entity.citationCount != null ? `${entity.citationCount} citations` : ""].filter(Boolean).join(" · ")));
            if (entity.description) btn.appendChild(el("span", "", entity.description));
            btn.addEventListener("click", () => void openEntity(entity.id));
            list.appendChild(btn);
          });
          const prev = el("button", "urantia-btn", "Previous");
          prev.disabled = entityPage <= 0;
          prev.addEventListener("click", () => {
            entityPage = Math.max(0, entityPage - 1);
            void load();
          });
          const next = el("button", "urantia-btn", "Next");
          next.disabled = entities.length < 20;
          next.addEventListener("click", () => {
            entityPage += 1;
            void load();
          });
          pager.append(prev, next);
        } catch (error) {
          setStatus(error.message || "Could not load entities.", true);
        }
      }

      go.addEventListener("click", () => {
        entityPage = 0;
        void load();
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          entityPage = 0;
          void load();
        }
      });
      await load();
    }

    async function renderRandom() {
      body.innerHTML = "";
      const actions = el("div", "urantia-search");
      const again = el("button", "urantia-btn urantia-btn-primary", "Another paragraph");
      actions.appendChild(again);
      const list = el("div", "urantia-list");
      body.append(actions, list);
      async function load() {
        setStatus("Drawing a paragraph…");
        list.innerHTML = "";
        try {
          const para = unwrap(await api("GET", "/paragraphs/random?format=rag&include=entities"));
          setStatus(para.citation || "");
          list.appendChild(renderParagraphCard(para, { showNav: true }));
        } catch (error) {
          setStatus(error.message || "Could not load a paragraph.", true);
        }
      }
      again.addEventListener("click", () => void load());
      await load();
    }

    void renderBrowse();
    return () => {
      root.innerHTML = "";
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[urantia] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "urantia",
    name: "Urantia Book",
    kind: "api",
    version: "1.1.0",
    section: { id: "urantia", label: "Urantia" },
    mount
  });
})();
