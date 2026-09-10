(function () {
  "use strict";

  const GRID_PAGE = 80;
  const STATE_PATH = "/api/v1/profile/plugin-state/hieroglyphs";
  const GARDINER_LABELS = {
    A: "Man and his occupations",
    B: "Woman and her occupations",
    C: "Anthropomorphic deities",
    D: "Parts of the human body",
    E: "Mammals",
    F: "Parts of mammals",
    G: "Birds",
    H: "Parts of birds",
    I: "Amphibious animals, reptiles, etc.",
    K: "Fishes and parts of fishes",
    L: "Invertebrates and lesser animals",
    M: "Trees and plants",
    N: "Sky, earth, water",
    O: "Buildings, parts of buildings, etc.",
    P: "Ships and parts of ships",
    Q: "Domestic and funerary furniture",
    R: "Temple furniture and sacred emblems",
    S: "Crowns, dress, staves, etc.",
    T: "Warfare, hunting, butchery",
    U: "Agriculture, crafts, and professions",
    V: "Rope, fibre, baskets, bags, etc.",
    W: "Vessels of stone and earthenware",
    X: "Loaves and cakes",
    Y: "Writings, games, music",
    Z: "Strokes and geometrical figures",
    n: "Additional signs"
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function emptyUserState() {
    return { favorites: [], signs: {} };
  }

  function normalizeUserState(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const favorites = Array.isArray(source.favorites)
      ? [...new Set(source.favorites.map((code) => String(code || "").trim()).filter(Boolean))]
      : [];
    const signs = {};
    const rawSigns = source.signs && typeof source.signs === "object" ? source.signs : {};
    Object.keys(rawSigns).forEach((code) => {
      const patch = rawSigns[code];
      if (!patch || typeof patch !== "object") return;
      signs[code] = {
        description: patch.description == null ? null : String(patch.description),
        tags: Array.isArray(patch.tags) ? patch.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
        note: patch.note == null ? null : String(patch.note)
      };
    });
    return { favorites, signs };
  }

  function applyUserState(dictionary, userState) {
    Object.keys(userState?.signs || {}).forEach((code) => {
      const sign = dictionary.signs?.[code];
      const patch = userState.signs[code];
      if (!sign || !patch) return;
      if (patch.description !== undefined) sign.description = patch.description;
      if (Array.isArray(patch.tags)) sign.tags = patch.tags;
      if (patch.note !== undefined) sign.note = patch.note;
    });
  }

  function notedCodes(userState) {
    return Object.keys(userState?.signs || {}).filter((code) => String(userState.signs[code]?.note || "").trim());
  }

  function signHaystack(code, sign) {
    const parts = [code, sign?.description];
    (Array.isArray(sign?.tags) ? sign.tags : []).forEach((tag) => parts.push(tag));
    (Array.isArray(sign?.transliterations) ? sign.transliterations : []).forEach((item) => parts.push(item?.value));
    return parts.filter(Boolean).join(" ").toLowerCase();
  }

  function codesInCategory(dictionary, category) {
    return Object.keys(dictionary.signs || {})
      .filter((code) => dictionary.signs[code].category === category)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function svgUrl(helpers, sign) {
    const stem = String(sign?.svg || "").trim();
    const category = String(sign?.category || "").trim();
    if (!stem || !category) return "";
    return helpers.fileUrl(category, `${stem}.svg`);
  }

  function mount(root, helpers) {
    let cancelled = false;
    let dictionary = null;
    let selectedCode = "A1";
    let selectedCategory = "A";
    let query = "";
    let visibleCount = GRID_PAGE;
    let editMode = false;
    let searchTimer = null;
    let saveTimer = null;
    let listFilter = "category";
    let userState = emptyUserState();

    root.classList.add("hg-root");
    root.replaceChildren(el("div", "hg-status", "Loading hieroglyphs..."));

    function currentSign() {
      return dictionary?.signs?.[selectedCode] || null;
    }

    function filteredCodes() {
      if (!dictionary) return [];
      const trimmed = query.trim().toLowerCase();
      let codes;
      if (listFilter === "favorites") {
        codes = userState.favorites.filter((code) => dictionary.signs[code]);
      } else if (listFilter === "notes") {
        codes = notedCodes(userState).filter((code) => dictionary.signs[code]);
      } else if (trimmed) {
        codes = Object.keys(dictionary.signs);
      } else {
        codes = codesInCategory(dictionary, selectedCategory);
      }
      if (trimmed) {
        codes = codes.filter((code) => signHaystack(code, dictionary.signs[code]).includes(trimmed));
      }
      return codes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    }

    function persistState() {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => {
        helpers.requestJson("PUT", STATE_PATH, {
          favorites: userState.favorites,
          signs: userState.signs
        }).catch(() => {});
      }, 280);
    }

    function isFavorite(code) {
      return userState.favorites.includes(code);
    }

    function toggleFavorite(code) {
      if (!dictionary?.signs?.[code]) return;
      if (isFavorite(code)) {
        userState.favorites = userState.favorites.filter((entry) => entry !== code);
      } else {
        userState.favorites = [...userState.favorites, code];
      }
      persistState();
      render();
    }

    function selectSign(code) {
      const sign = dictionary?.signs?.[code];
      if (!sign) return;
      selectedCode = code;
      selectedCategory = sign.category || selectedCategory;
      editMode = false;
      if (!query.trim()) visibleCount = GRID_PAGE;
      render();
    }

    function saveEdit(form) {
      const sign = currentSign();
      if (!sign) return;
      const description = String(form.description?.value || "").trim() || null;
      const tags = String(form.tags?.value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const note = String(form.note?.value || "").trim() || null;
      sign.description = description;
      sign.tags = tags;
      sign.note = note;
      if (!description && !tags.length && !note) {
        delete userState.signs[selectedCode];
      } else {
        userState.signs[selectedCode] = { description, tags, note };
      }
      persistState();
      editMode = false;
      render();
    }

    function renderSignImage(target, sign, className) {
      const url = svgUrl(helpers, sign);
      if (url) {
        const img = el("img", className);
        img.src = url;
        img.alt = sign.code;
        target.appendChild(img);
        return img;
      }
      target.appendChild(el("div", "hg-placeholder", sign.code));
      return null;
    }

    let overlayEl = null;
    function closeOverlay() {
      overlayEl?.remove();
      overlayEl = null;
      document.removeEventListener("keydown", onOverlayKey);
    }

    function onOverlayKey(event) {
      if (event.key === "Escape") closeOverlay();
    }

    function openOverlay(sign) {
      closeOverlay();
      overlayEl = el("div", "hg-overlay");
      overlayEl.addEventListener("click", closeOverlay);
      const figure = el("div", "hg-figure");
      figure.addEventListener("click", (event) => event.stopPropagation());
      renderSignImage(figure, sign, "hg-figure-img");
      overlayEl.appendChild(figure);
      document.body.appendChild(overlayEl);
      document.addEventListener("keydown", onOverlayKey);
    }

    function render() {
      if (cancelled || !dictionary) return;
      const sign = currentSign();
      const codes = filteredCodes();
      const shown = codes.slice(0, visibleCount);
      const categoryLabel = GARDINER_LABELS[selectedCategory] || "Category";
      const searching = Boolean(query.trim());

      const shell = el("div", "hg-shell");

      const header = el("header", "hg-header");
      const heading = el("div", "hg-heading");
      heading.appendChild(el("h1", "", "Hieroglyphs"));
      heading.appendChild(el(
        "p",
        "hg-sub",
        `${Object.keys(dictionary.signs).length.toLocaleString()} signs · Gardiner's Sign List`
      ));
      header.appendChild(heading);

      const search = el("input", "hg-search");
      search.type = "search";
      search.placeholder = "Search code, description, tag, transliteration...";
      search.value = query;
      search.addEventListener("input", () => {
        query = search.value;
        visibleCount = GRID_PAGE;
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => render(), 160);
      });
      header.appendChild(search);
      shell.appendChild(header);

      const body = el("div", "hg-body");

      const detail = el("article", "hg-detail");
      if (sign) {
        const figure = el("div", "hg-figure");
        figure.setAttribute("role", "button");
        figure.tabIndex = 0;
        figure.title = "Open full view";
        renderSignImage(figure, sign, "hg-figure-img");
        figure.addEventListener("click", () => openOverlay(sign));
        figure.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openOverlay(sign);
          }
        });
        detail.appendChild(figure);

        const info = el("div", "hg-info");
        const titleRow = el("div", "hg-title-row");
        titleRow.appendChild(el("h2", "", sign.code));
        const favoriteBtn = el(
          "button",
          `hg-btn${isFavorite(sign.code) ? "" : " hg-btn-ghost"}`,
          isFavorite(sign.code) ? "Favorited" : "Favorite"
        );
        favoriteBtn.type = "button";
        favoriteBtn.addEventListener("click", () => toggleFavorite(sign.code));
        titleRow.appendChild(favoriteBtn);
        const editBtn = el("button", "hg-btn", editMode ? "Save" : "Edit");
        editBtn.type = "button";
        titleRow.appendChild(editBtn);
        if (editMode) {
          const cancelBtn = el("button", "hg-btn hg-btn-ghost", "Cancel");
          cancelBtn.type = "button";
          cancelBtn.addEventListener("click", () => {
            editMode = false;
            render();
          });
          titleRow.appendChild(cancelBtn);
        }
        info.appendChild(titleRow);
        info.appendChild(el("p", "hg-category", `${sign.category} — ${GARDINER_LABELS[sign.category] || "Unknown"}`));

        if (editMode) {
          const form = el("form", "hg-edit");
          const desc = el("textarea", "hg-input");
          desc.name = "description";
          desc.rows = 6;
          desc.value = sign.description || "";
          desc.placeholder = "Description";
          const tags = el("input", "hg-input");
          tags.name = "tags";
          tags.value = (sign.tags || []).join(", ");
          tags.placeholder = "Tags, comma-separated";
          const note = el("textarea", "hg-input");
          note.name = "note";
          note.rows = 3;
          note.value = sign.note || "";
          note.placeholder = "Personal note";
          form.append(desc, tags, note);
          editBtn.addEventListener("click", (event) => {
            event.preventDefault();
            saveEdit(form);
          });
          info.appendChild(form);
        } else {
          editBtn.addEventListener("click", () => {
            editMode = true;
            render();
          });
          if (sign.description) {
            const box = el("section", "hg-block");
            box.appendChild(el("h3", "", "Description"));
            box.appendChild(el("p", "", sign.description));
            info.appendChild(box);
          }
          if (sign.note) {
            const box = el("section", "hg-block");
            box.appendChild(el("h3", "", "Note"));
            box.appendChild(el("p", "", sign.note));
            info.appendChild(box);
          }
          if (Array.isArray(sign.transliterations) && sign.transliterations.length) {
            const box = el("section", "hg-block");
            box.appendChild(el("h3", "", "Transliterations"));
            const list = el("ul", "hg-trans");
            sign.transliterations.forEach((item) => {
              list.appendChild(el("li", "", `${item.value} (${item.type}, ${item.use})`));
            });
            box.appendChild(list);
            info.appendChild(box);
          }
          if (Array.isArray(sign.tags) && sign.tags.length) {
            const box = el("section", "hg-block");
            box.appendChild(el("h3", "", "Tags"));
            const tags = el("div", "hg-tags");
            sign.tags.forEach((tag) => {
              const chip = el("button", "hg-tag", tag);
              chip.type = "button";
              chip.addEventListener("click", () => {
                query = tag;
                visibleCount = GRID_PAGE;
                render();
              });
              tags.appendChild(chip);
            });
            box.appendChild(tags);
            info.appendChild(box);
          }
          if (Array.isArray(sign.variants) && sign.variants.length) {
            const box = el("section", "hg-block");
            box.appendChild(el("h3", "", `Variants (${sign.variants.length})`));
            const row = el("div", "hg-variants");
            sign.variants.forEach((variant) => {
              const button = el("button", "hg-chip", variant.code);
              button.type = "button";
              button.title = variant.linguistic || "";
              button.addEventListener("click", () => selectSign(variant.code));
              row.appendChild(button);
            });
            box.appendChild(row);
            info.appendChild(box);
          }
          if (sign.variant_of?.base_sign) {
            const box = el("section", "hg-block");
            box.appendChild(el("h3", "", "Variant of"));
            const button = el("button", "hg-chip", sign.variant_of.base_sign);
            button.type = "button";
            button.addEventListener("click", () => selectSign(sign.variant_of.base_sign));
            box.appendChild(button);
            info.appendChild(box);
          }
        }
        detail.appendChild(info);
      }
      body.appendChild(detail);

      const side = el("aside", "hg-side");
      const nav = el("div", "hg-nav");
      const prev = el("button", "hg-btn", "Previous");
      const next = el("button", "hg-btn", "Next");
      const random = el("button", "hg-btn hg-btn-ghost", "Random");
      prev.type = "button";
      next.type = "button";
      random.type = "button";
      prev.addEventListener("click", () => {
        const all = Object.keys(dictionary.signs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const index = all.indexOf(selectedCode);
        if (index > 0) selectSign(all[index - 1]);
      });
      next.addEventListener("click", () => {
        const all = Object.keys(dictionary.signs).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const index = all.indexOf(selectedCode);
        if (index >= 0 && index < all.length - 1) selectSign(all[index + 1]);
      });
      random.addEventListener("click", () => {
        const all = Object.keys(dictionary.signs);
        selectSign(all[Math.floor(Math.random() * all.length)]);
      });
      nav.append(prev, next, random);
      side.appendChild(nav);

      const filters = el("div", "hg-filters");
      [
        ["category", "All"],
        ["favorites", `Favorites (${userState.favorites.length})`],
        ["notes", `Notes (${notedCodes(userState).length})`]
      ].forEach(([id, label]) => {
        const button = el("button", `hg-cat${listFilter === id ? " is-active" : ""}`, label);
        button.type = "button";
        button.addEventListener("click", () => {
          listFilter = id;
          query = "";
          visibleCount = GRID_PAGE;
          editMode = false;
          const codes = filteredCodes();
          if (codes.length && !codes.includes(selectedCode)) {
            selectedCode = codes[0];
            selectedCategory = dictionary.signs[selectedCode]?.category || selectedCategory;
          }
          render();
        });
        filters.appendChild(button);
      });
      side.appendChild(filters);

      const jump = el("input", "hg-input");
      jump.placeholder = "Jump to code (A1, G17)";
      jump.value = selectedCode;
      jump.addEventListener("change", () => {
        const code = String(jump.value || "").trim().toUpperCase();
        if (dictionary.signs[code]) {
          query = "";
          selectSign(code);
        }
      });
      side.appendChild(jump);

      side.appendChild(el("h3", "hg-side-title", "Categories"));
      const cats = el("div", "hg-cats");
      Object.keys(dictionary.categories || {}).sort().forEach((cat) => {
        const button = el("button", `hg-cat${cat === selectedCategory && listFilter === "category" && !searching ? " is-active" : ""}`, cat);
        button.type = "button";
        button.title = `${GARDINER_LABELS[cat] || cat} (${dictionary.categories[cat]?.count || 0})`;
        button.addEventListener("click", () => {
          query = "";
          listFilter = "category";
          selectedCategory = cat;
          visibleCount = GRID_PAGE;
          const first = codesInCategory(dictionary, cat)[0];
          if (first) selectedCode = first;
          editMode = false;
          render();
        });
        cats.appendChild(button);
      });
      side.appendChild(cats);
      side.appendChild(el(
        "p",
        "hg-stats",
        searching
          ? `${codes.length.toLocaleString()} matches`
          : listFilter === "favorites"
            ? `${codes.length.toLocaleString()} favorites`
            : listFilter === "notes"
              ? `${codes.length.toLocaleString()} with notes`
              : `${(dictionary.categories[selectedCategory]?.count || 0).toLocaleString()} in ${selectedCategory}`
      ));

      const notes = notedCodes(userState);
      if (notes.length) {
        side.appendChild(el("h3", "hg-side-title", "Your notes"));
        const notesList = el("div", "hg-notes");
        notes.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).forEach((code) => {
          const button = el("button", `hg-note-item${code === selectedCode ? " is-active" : ""}`);
          button.type = "button";
          button.addEventListener("click", () => {
            listFilter = "notes";
            selectSign(code);
          });
          const label = el("span", "hg-note-code", code);
          const preview = el("span", "hg-note-preview", String(userState.signs[code]?.note || "").slice(0, 80));
          button.append(label, preview);
          notesList.appendChild(button);
        });
        side.appendChild(notesList);
      }
      body.appendChild(side);
      shell.appendChild(body);

      const gridWrap = el("section", "hg-grid-wrap");
      gridWrap.appendChild(el(
        "h3",
        "",
        searching
          ? `Search results (${codes.length})`
          : listFilter === "favorites"
            ? `Favorites (${codes.length})`
            : listFilter === "notes"
              ? `Notes (${codes.length})`
              : `${selectedCategory} — ${categoryLabel} (${codes.length})`
      ));
      const grid = el("div", "hg-grid");
      shown.forEach((code) => {
        const item = dictionary.signs[code];
        const button = el("button", `hg-grid-item${code === selectedCode ? " is-active" : ""}`);
        button.type = "button";
        button.title = item.description || code;
        button.addEventListener("click", () => selectSign(code));
        renderSignImage(button, item, "hg-grid-img");
        const label = el("span", "hg-grid-label", isFavorite(code) ? `${code} *` : code);
        button.appendChild(label);
        grid.appendChild(button);
      });
      gridWrap.appendChild(grid);
      if (visibleCount < codes.length) {
        const more = el("button", "hg-btn hg-more", `Show more (${(codes.length - visibleCount).toLocaleString()} remaining)`);
        more.type = "button";
        more.addEventListener("click", () => {
          visibleCount += GRID_PAGE;
          render();
        });
        gridWrap.appendChild(more);
      }
      shell.appendChild(gridWrap);

      const searchEl = root.querySelector(".hg-search");
      const restoreSearch = searchEl && document.activeElement === searchEl;
      const caret = restoreSearch ? searchEl.selectionStart : null;
      root.replaceChildren(shell);
      if (restoreSearch) {
        const nextSearch = root.querySelector(".hg-search");
        nextSearch?.focus();
        if (nextSearch && typeof caret === "number") {
          nextSearch.setSelectionRange(caret, caret);
        }
      }
    }

    (async () => {
      try {
        const url = helpers.assetUrl("dictionary.json");
        const response = await fetch(url, { cache: "force-cache" });
        if (!response.ok) throw new Error(`dictionary ${response.status}`);
        dictionary = await response.json();
        try {
          const payload = await helpers.requestJson("GET", STATE_PATH);
          userState = normalizeUserState(payload?.state || payload);
        } catch (_error) {
          userState = emptyUserState();
        }
        applyUserState(dictionary, userState);
        if (!dictionary.signs?.[selectedCode]) {
          selectedCode = Object.keys(dictionary.signs || {})[0] || "";
          selectedCategory = dictionary.signs?.[selectedCode]?.category || "A";
        }
        if (!cancelled) render();
      } catch (error) {
        if (!cancelled) {
          root.replaceChildren(el("div", "hg-status", error?.message || "Unable to load hieroglyph dictionary."));
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(searchTimer);
      window.clearTimeout(saveTimer);
      closeOverlay();
      root.replaceChildren();
    };
  }

  const host = window.TaroTimePluginHost;
  if (!host || typeof host.register !== "function") {
    console.warn("[hieroglyphs] TaroTimePluginHost is not available.");
    return;
  }

  host.register({
    id: "hieroglyphs",
    name: "Hieroglyphs",
    version: "1.0.0",
    section: { id: "hieroglyphs", label: "Hieroglyphs" },
    mount
  });
})();
