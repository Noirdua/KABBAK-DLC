"use strict";

// The Star Game — rules engine (basic / exoteric form).
//
// Seven boards sit one above the other along the septenary tree, from Sirius at
// the bottom to Naos at the top. Each board is an 18-square checkerboard (three
// columns by six rows, index = row * 3 + column) holding nine black and nine
// white squares. Each player commands 27 pieces in three sets of nine.
//
// A piece is written as two letters, e.g. "ab": the first letter is its class
// (a = alpha / Salt, b = beta / Mercury, c = gamma / Sulphur) and the second is
// its place in the cycle. Every move advances a piece one step along
//
//   aa -> ab -> ac -> ba -> bb -> bc -> ca -> cb -> cc -> aa
//
// and the piece moves by its *current* class:
//   alpha (a): any vacant square on its own board.
//   beta  (b): any vacant square on its board, or on a board one level up/down.
//   gamma (c): any vacant square on any board.
// Only a "cc" piece may capture: any opposing piece on any board except Naos;
// after capturing it becomes "aa". Pieces on Naos are never captured.
//
// Exoteric objective: be first to hold the three-square triangle on Mira with
// three alpha pieces (white rows 1-2, black rows 5-6), while Mira's three-move
// limit forces pieces to keep moving.

const BOARD_NAMES = Object.freeze([
  "Sirius",
  "Arcturus",
  "Antares",
  "Mira",
  "Rigel",
  "Deneb",
  "Naos"
]);

const BOARD_COUNT = BOARD_NAMES.length;
const SQUARES_PER_BOARD = 18;
const MIRA = BOARD_NAMES.indexOf("Mira");
const NAOS = BOARD_NAMES.indexOf("Naos");
const MIRA_MOVE_LIMIT = 3;
const OPPONENT = { white: "black", black: "white" };

const SEQUENCE = Object.freeze(["aa", "ab", "ac", "ba", "bb", "bc", "ca", "cb", "cc"]);

// Exoteric starting squares. The six-piece boards use a full middle row plus the
// triangle; the three-piece boards use the triangle alone.
const SIX_WHITE = Object.freeze([0, 2, 4, 6, 7, 8]);
const SIX_BLACK = Object.freeze([9, 10, 11, 13, 15, 17]);
const THREE_WHITE = Object.freeze([0, 2, 4]);
const THREE_BLACK = Object.freeze([13, 15, 17]);

// Suggested winning pattern (the triangle on Mira) for each colour.
const WIN_PATTERN = Object.freeze({
  white: Object.freeze([0, 2, 4]),
  black: Object.freeze([13, 15, 17])
});

const SETUP = [
  { alpha: "a", squares: SIX_WHITE, target: SIX_BLACK, count: 6 },
  { alpha: "a", squares: THREE_WHITE, target: THREE_BLACK, count: 3 },
  { alpha: "b", squares: SIX_WHITE, target: SIX_BLACK, count: 6 },
  { alpha: null, squares: [], target: [], count: 0 },
  { alpha: "b", squares: THREE_WHITE, target: THREE_BLACK, count: 3 },
  { alpha: "c", squares: SIX_WHITE, target: SIX_BLACK, count: 6 },
  { alpha: "c", squares: THREE_WHITE, target: THREE_BLACK, count: 3 }
];

function gameError(message, code = "invalid_move") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function nextType(type) {
  const index = SEQUENCE.indexOf(type);
  return SEQUENCE[(index + 1) % SEQUENCE.length];
}

function emptyBoard() {
  return new Array(SQUARES_PER_BOARD).fill(null);
}

function typesFor(setup) {
  const subs = ["a", "b", "c", "a", "b", "c"].slice(0, setup.count);
  return subs.map((sub) => `${setup.alpha}${sub}`);
}

function placeSet(board, squares, owner, setup) {
  const types = typesFor(setup);
  squares.forEach((square, index) => {
    board[square] = { owner, type: types[index] };
  });
}

function createInitialState() {
  const boards = Array.from({ length: BOARD_COUNT }, () => emptyBoard());
  SETUP.forEach((setup, boardIndex) => {
    if (!setup.alpha) return;
    placeSet(boards[boardIndex], setup.squares, "white", setup);
    placeSet(boards[boardIndex], setup.target, "black", setup);
  });
  return {
    boards,
    turn: "white",
    miraTimer: { white: 0, black: 0 },
    moveCount: { white: 0, black: 0 },
    lastMove: null
  };
}

function colorForPlayer(session, playerId) {
  const id = String(playerId || "");
  if (id === String(session.hostClientId || "")) return "white";
  if (id === String(session.guestClientId || "")) return "black";
  return "";
}

function squareLabel(board, square) {
  return `${BOARD_NAMES[board]} ${Math.floor(square / 3) + 1}-${(square % 3) + 1}`;
}

function hasColorOnMira(state, color) {
  const mira = state.boards[MIRA];
  return mira.some((cell) => cell && cell.owner === color);
}

function legalTargets(state, board, square) {
  const cell = state.boards[board]?.[square];
  if (!cell) return [];
  const cls = cell.type[0];
  const targets = [];
  for (let b = 0; b < BOARD_COUNT; b += 1) {
    for (let s = 0; s < SQUARES_PER_BOARD; s += 1) {
      if (b === board && s === square) continue;
      const occupant = state.boards[b][s];
      if (cls === "a") {
        if (b !== board) continue;
        if (!occupant) targets.push({ board: b, square: s, capture: false });
      } else if (cls === "b") {
        if (Math.abs(b - board) > 1) continue;
        if (!occupant) targets.push({ board: b, square: s, capture: false });
      } else if (!occupant) {
        targets.push({ board: b, square: s, capture: false });
      }
    }
  }
  if (cell.type === "cc") {
    for (let b = 0; b < BOARD_COUNT; b += 1) {
      if (b === NAOS) continue;
      for (let s = 0; s < SQUARES_PER_BOARD; s += 1) {
        const occupant = state.boards[b][s];
        if (occupant && occupant.owner !== cell.owner) {
          targets.push({ board: b, square: s, capture: true });
        }
      }
    }
  }
  return targets;
}

function isLegalTarget(state, board, square, target) {
  return legalTargets(state, board, square).some(
    (entry) => entry.board === target.board && entry.square === target.square
  );
}

function legalMoves(state, color) {
  // Index vacant squares and capturable opponents once, then assemble each
  // piece's targets from those lists instead of rescanning every board square
  // per piece.
  const vacantByBoard = Array.from({ length: BOARD_COUNT }, () => []);
  const allVacant = [];
  const opponentPieces = [];
  for (let b = 0; b < BOARD_COUNT; b += 1) {
    for (let s = 0; s < SQUARES_PER_BOARD; s += 1) {
      const cell = state.boards[b][s];
      if (!cell) {
        vacantByBoard[b].push(s);
        allVacant.push({ board: b, square: s });
      } else if (cell.owner !== color && b !== NAOS) {
        opponentPieces.push({ board: b, square: s });
      }
    }
  }

  const moves = {};
  for (let b = 0; b < BOARD_COUNT; b += 1) {
    for (let s = 0; s < SQUARES_PER_BOARD; s += 1) {
      const cell = state.boards[b][s];
      if (!cell || cell.owner !== color) continue;
      const cls = cell.type[0];
      const targets = [];
      const addVacantBoard = (targetBoard) => {
        if (targetBoard < 0 || targetBoard >= BOARD_COUNT) return;
        vacantByBoard[targetBoard].forEach((square) => {
          targets.push({ board: targetBoard, square, capture: false });
        });
      };
      if (cls === "a") {
        addVacantBoard(b);
      } else if (cls === "b") {
        addVacantBoard(b - 1);
        addVacantBoard(b);
        addVacantBoard(b + 1);
      } else {
        allVacant.forEach((entry) => targets.push({ board: entry.board, square: entry.square, capture: false }));
      }
      if (cell.type === "cc") {
        opponentPieces.forEach((entry) => targets.push({ board: entry.board, square: entry.square, capture: true }));
      }
      if (targets.length) moves[`${b}-${s}`] = targets;
    }
  }
  return moves;
}

function colorWins(state, color) {
  return WIN_PATTERN[color].every((square) => {
    const cell = state.boards[MIRA][square];
    return cell && cell.owner === color && cell.type[0] === "a";
  });
}

function applyMove(state, color, from, to) {
  const source = state.boards[from.board]?.[from.square];
  if (!source || source.owner !== color) {
    throw gameError("That piece is not yours.");
  }
  const target = state.boards[to.board]?.[to.square];
  const capturing = Boolean(target);
  if (capturing) {
    if (source.type !== "cc") {
      throw gameError("Only a c(c) piece may capture.");
    }
    if (to.board === NAOS) {
      throw gameError("Pieces on Naos cannot be captured.");
    }
    if (target.owner === color) {
      throw gameError("You cannot capture your own piece.");
    }
  } else if (!isLegalTarget(state, from.board, from.square, to)) {
    throw gameError(
      `That piece cannot move to ${squareLabel(to.board, to.square)}.`
    );
  }

  if (state.miraTimer[color] >= MIRA_MOVE_LIMIT && hasColorOnMira(state, color)) {
    if (from.board !== MIRA) {
      throw gameError("After three Mira moves you must move a piece that is on Mira.");
    }
    if (source.type[0] !== "a" && to.board === MIRA) {
      throw gameError("That Mira piece must move up or down off Mira.");
    }
  }

  state.boards[from.board][from.square] = null;
  if (capturing) {
    state.boards[to.board][to.square] = { owner: color, type: "aa" };
  } else {
    state.boards[to.board][to.square] = { owner: color, type: nextType(source.type) };
  }

  if (hasColorOnMira(state, color)) {
    state.miraTimer[color] = from.board === MIRA ? 0 : state.miraTimer[color] + 1;
  } else {
    state.miraTimer[color] = 0;
  }
  state.moveCount[color] += 1;
  state.lastMove = {
    color,
    from,
    to,
    captured: capturing,
    piece: capturing ? "aa" : state.boards[to.board][to.square].type
  };
  state.turn = OPPONENT[color];
  return state;
}

function create({ hostClientId, guestClientId } = {}) {
  const colorByPlayer = {};
  if (hostClientId) colorByPlayer[String(hostClientId)] = "white";
  if (guestClientId) colorByPlayer[String(guestClientId)] = "black";
  return {
    secret: { colorByPlayer },
    public: createInitialState(),
    // White opens, and the host plays white.
    firstClientId: String(hostClientId || "")
  };
}

function move(session, playerId, input = {}) {
  if (session.status !== "active") {
    throw gameError("This game is not in play.");
  }
  const color = colorForPlayer(session, playerId);
  if (!color) {
    throw gameError("You are not a player in this game.", "not_game_player");
  }
  if (session.public.turn !== color) {
    throw gameError("It is not your turn.");
  }
  const from = input.from && typeof input.from === "object"
    ? { board: Number(input.from.board), square: Number(input.from.square) }
    : null;
  const to = input.to && typeof input.to === "object"
    ? { board: Number(input.to.board), square: Number(input.to.square) }
    : null;
  if (!from || !to
    || !Number.isInteger(from.board) || !Number.isInteger(from.square)
    || !Number.isInteger(to.board) || !Number.isInteger(to.square)) {
    throw gameError("A move needs a from and a to square.");
  }
  applyMove(session.public, color, from, to);

  if (colorWins(session.public, color)) {
    session.status = "finished";
    session.result = "complete";
    session.winnerClientId = color === "white" ? session.hostClientId : session.guestClientId;
    session.currentClientId = "";
    return session;
  }

  const nextColor = session.public.turn;
  if (Object.keys(legalMoves(session.public, nextColor)).length === 0) {
    session.status = "finished";
    session.result = "stalemate";
    session.winnerClientId = "";
    session.currentClientId = "";
    return session;
  }

  session.currentClientId = nextColor === "white" ? session.hostClientId : session.guestClientId;
  return session;
}

function view(session, viewerId) {
  const state = session.public || createInitialState();
  const color = colorForPlayer(session, viewerId);
  const finished = session.status === "finished";
  const payload = {
    boardNames: BOARD_NAMES,
    boards: state.boards,
    turn: state.turn,
    yourColor: color,
    yourTurn: session.status === "active" && state.turn === color,
    miraTimer: state.miraTimer,
    miraMoveLimit: MIRA_MOVE_LIMIT,
    winPattern: WIN_PATTERN,
    moveCount: state.moveCount,
    lastMove: state.lastMove
  };
  if (payload.yourTurn) {
    payload.legal = legalMoves(state, color);
  }
  if (finished && session.winnerClientId) {
    payload.winnerColor = session.winnerClientId === session.hostClientId ? "white" : "black";
  }
  return payload;
}

module.exports = {
  id: "star-game",
  title: "The Star Game",
  description: "Seven-board septenary strategy. Pieces transform as they move; first to hold Mira's triangle wins.",
  create,
  view,
  move,
  // Exposed for tests and for operators who want to reuse the rules.
  _internals: {
    BOARD_NAMES,
    WIN_PATTERN,
    SEQUENCE,
    nextType,
    createInitialState,
    legalMoves,
    colorWins
  }
};
