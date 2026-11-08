'use strict';
/*
 * "Perft" zählt alle möglichen Zugfolgen bis zu einer bestimmten Tiefe.
 * Die richtigen Zahlen für diese Stellungen sind bekannt (https://www.chessprogramming.org/Perft_Results).
 * Stimmen sie überein, sind die Zugregeln (inkl. Rochade, en passant, Umwandlung) mit sehr hoher
 * Wahrscheinlichkeit korrekt.
 *
 * Ausführen mit:  node tests/perft.test.js
 */
const { ChessGame } = require('../js/chess.js');

function perft(game, depth) {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of game.allLegalMoves()) {
    for (const promo of m.promotion ? ['q', 'r', 'b', 'n'] : ['q']) {
      const saved = game.saveState();
      game.applyMove(m, promo);
      nodes += perft(game, depth - 1);
      game.restoreState(saved);
    }
  }
  return nodes;
}

const cases = [
  ['Startstellung', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', [20, 400, 8902, 197281]],
  ['Kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['Position 3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['Position 4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['Position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

let failed = 0;
for (const [name, fen, expected] of cases) {
  expected.forEach((want, i) => {
    const got = perft(new ChessGame(fen), i + 1);
    const ok = got === want;
    if (!ok) failed++;
    console.log(`${ok ? '✓' : '✗'} ${name}, Tiefe ${i + 1}: ${got}${ok ? '' : ` (erwartet ${want})`}`);
  });
}
console.log(failed ? `\n${failed} Test(s) fehlgeschlagen.` : '\nAlle Tests bestanden.');
process.exit(failed ? 1 : 0);
