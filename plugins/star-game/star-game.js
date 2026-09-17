(function () {
  "use strict";

  // The Star Game — browser board renderer.
  //
  // The rules run in the plugin's server half; this half only draws the state
  // the platform sends and reports the selected from/to squares back as a move.
  const GAME_ID = "plugin:star-game:star-game";
  const SYMBOL = {
    a: "\u03B8", // theta — Salt
    b: "\u263F", // Mercury
    c: String.fromCodePoint(0x1f70d) // Sulphur
  };
  const MIRA_INDEX = 3;

  function makeEl(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function pieceLabel(type) {
    return `${SYMBOL[type[0]] || type[0]}${type.slice(1)}`;
  }

  function render(session, container, actions) {
    const view = session.view || {};
    const legal = view.legal || {};
    const yourColor = view.yourColor || "";
    let selected = null;

    const root = makeEl("div", "sg-root");

    function paint() {
      root.textContent = "";

      const status = makeEl("div", "sg-status");
      if (session.status === "finished") {
        const winner = view.winnerColor
          ? (view.winnerColor === "white" ? session.hostName : session.guestName)
          : "";
        status.textContent = winner ? `${winner} wins the Star Game.` : "The game is finished.";
        status.classList.add("is-finished");
      } else if (view.yourTurn) {
        status.textContent = "Your move.";
      } else {
        status.textContent = `Waiting on ${view.turn === "white" ? session.hostName : session.guestName}.`;
      }
      root.appendChild(status);

      const legend = makeEl("div", "sg-legend");
      legend.appendChild(makeEl("span", "sg-legend-item", "θ Salt"));
      legend.appendChild(makeEl("span", "sg-legend-item", "☿ Mercury"));
      legend.appendChild(makeEl("span", "sg-legend-item", "🜍 Sulphur"));
      legend.appendChild(makeEl("span", "sg-legend-item", `Mira limit ${view.miraTimer ? "" : ""}${view.miraMoveLimit || 3}`));
      root.appendChild(legend);

      const boards = Array.isArray(view.boards) ? view.boards : [];
      for (let boardIndex = boards.length - 1; boardIndex >= 0; boardIndex -= 1) {
        root.appendChild(renderBoard(boardIndex, boards[boardIndex], view));
      }

      if (view.lastMove) {
        const last = view.lastMove;
        const note = makeEl("div", "sg-last-move");
        const where = `to ${view.boardNames[last.to.board]} ${Math.floor(last.to.square / 3) + 1}-${(last.to.square % 3) + 1}`;
        note.textContent = `Last: ${last.color} moved ${pieceLabel(last.piece)} ${where}${last.captured ? " (capture)" : ""}.`;
        root.appendChild(note);
      }
    }

    function renderBoard(boardIndex, board, view) {
      const wrapper = makeEl("section", "sg-board");
      const heading = makeEl("div", "sg-board-head");
      heading.appendChild(makeEl("strong", "", view.boardNames?.[boardIndex] || `Board ${boardIndex + 1}`));
      if (boardIndex === MIRA_INDEX && view.miraTimer) {
        const mine = view.yourColor || "white";
        heading.appendChild(makeEl(
          "span",
          "sg-board-timer",
          `Mira ${view.miraTimer[mine] || 0}/${view.miraMoveLimit || 3}`
        ));
      }
      wrapper.appendChild(heading);

      const grid = makeEl("div", "sg-grid");
      const winSquares = boardIndex === MIRA_INDEX
        ? new Set((view.winPattern?.[view.yourColor] || []))
        : new Set();
      (board || []).forEach((cell, square) => {
        const row = Math.floor(square / 3);
        const col = square % 3;
        const squareEl = makeEl("button", "sg-square");
        squareEl.type = "button";
        squareEl.classList.add((row + col) % 2 === 0 ? "sg-dark" : "sg-light");
        squareEl.dataset.square = String(square);
        if (winSquares.has(square)) squareEl.classList.add("sg-win-square");

        const key = `${boardIndex}-${square}`;
        const isTarget = selected && selected !== key
          && (legal[selected] || []).some((entry) => entry.board === boardIndex && entry.square === square);
        if (isTarget) {
          const capture = (legal[selected] || []).some(
            (entry) => entry.board === boardIndex && entry.square === square && entry.capture
          );
          squareEl.classList.add(capture ? "sg-capture" : "sg-target");
        }

        if (cell) {
          const chip = makeEl("span", `sg-piece sg-${cell.owner}`);
          chip.appendChild(makeEl("span", "sg-glyph", SYMBOL[cell.type[0]] || cell.type[0]));
          chip.appendChild(makeEl("span", "sg-code", cell.type));
          squareEl.appendChild(chip);
          const selectable = view.yourTurn && cell.owner === yourColor && legal[key];
          if (selectable) {
            squareEl.classList.add("sg-selectable");
            if (selected === key) squareEl.classList.add("sg-selected");
          }
        }

        squareEl.addEventListener("click", () => {
          if (session.status !== "active") return;
          if (isTarget) {
            const from = parseKey(selected);
            selected = null;
            paint();
            void actions.move({ from, to: { board: boardIndex, square } });
            return;
          }
          if (cell && view.yourTurn && cell.owner === yourColor && legal[key]) {
            selected = selected === key ? null : key;
          } else {
            selected = null;
          }
          paint();
        });

        grid.appendChild(squareEl);
      });
      wrapper.appendChild(grid);
      return wrapper;
    }

    paint();
    container.appendChild(root);
  }

  function parseKey(key) {
    const [board, square] = String(key || "").split("-").map((value) => Number(value));
    return { board, square };
  }

  const definition = { render };

  // The Games panel loads lazily, so stash the renderer for it to pick up, and
  // register immediately if it is already on screen.
  function registerFor(gameId) {
    const id = String(gameId || "").trim();
    if (!id) return;
    window.__kabbakGameRenderers = window.__kabbakGameRenderers || {};
    window.__kabbakGameRenderers[id] = definition;
    if (window.GamesSectionUi?.registerRenderer) {
      window.GamesSectionUi.registerRenderer(id, definition);
    }
  }

  // Register under the id the server reports for this plugin, so the namespace
  // has a single source of truth; keep the literal as a fallback.
  registerFor(GAME_ID);
  (async () => {
    try {
      const result = await window.TarotDataService?.fetchGames?.();
      const mine = (result?.games || []).find((game) => game.plugin === "star-game");
      if (mine?.id) registerFor(mine.id);
    } catch (_error) {
      // Keep the fallback id.
    }
  })();

  const host = window.TaroTimePluginHost;
  if (host?.register) {
    host.register({
      id: "star-game",
      name: "The Star Game",
      version: "1.0.0",
      mount() {
        return undefined;
      }
    });
  }
})();
