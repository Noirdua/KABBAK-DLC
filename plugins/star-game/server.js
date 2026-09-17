"use strict";

// The Star Game plugin — server entry.
//
// Registers the seven-board rules engine with the platform's turn-based game
// service. Once installed the game appears in the Games list; the browser half
// (star-game.js) registers the board renderer under the same namespaced id.

const engine = require("./engine.js");

module.exports = function register(router, ctx) {
  const registered = ctx.games.register(engine);

  router.get("/health", (_request, response) => {
    response.apiSuccess({ ok: true, game: registered.id, title: registered.title });
  });
};
