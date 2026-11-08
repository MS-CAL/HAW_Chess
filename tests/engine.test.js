'use strict';
/*
 * Tests für den Computergegner und die Remis-Regeln.
 * Ausführen mit:  node tests/engine.test.js
 */
const { ChessGame } = require('../js/chess.js');
global.ChessGame = ChessGame;  // engine.js erwartet ChessGame global (wie im Browser)
const { ChessEngine } = require('../js/engine.js');

let failed = 0;
function check(name, ok, info = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${info ? ' – ' + info : ''}`);
}
const sq = (m) => 'abcdefgh'[m.from.c] + (8 - m.from.r) + 'abcdefgh'[m.to.c] + (8 - m.to.r);

// --- Remis-Regeln -----------------------------------------------------------
check('König gegen König ist Remis', new ChessGame('8/8/4k3/8/8/3K4/8/8 w - - 0 1').status() === 'insufficient');
check('König+Springer gegen König ist Remis', new ChessGame('8/8/4k3/8/8/3KN3/8/8 w - - 0 1').status() === 'insufficient');
check('Läufer auf gleichfarbigen Feldern ist Remis', new ChessGame('8/8/2b1k3/8/8/3K4/4B3/8 w - - 0 1').status() === 'insufficient');
check('König+Turm gegen König ist kein Remis', new ChessGame('8/8/4k3/8/8/3KR3/8/8 w - - 0 1').status() === 'playing');
check('50-Züge-Regel', new ChessGame('8/8/4k3/8/8/3KR3/8/8 w - - 100 80').status() === 'fifty');

const rep = new ChessGame();
const play = (from, to) => {
  const m = rep.allLegalMoves().find((x) => sq(x) === from + to);
  rep.makeMove(m);
};
for (let i = 0; i < 2; i++) { play('g1', 'f3'); play('g8', 'f6'); play('f3', 'g1'); play('f6', 'g8'); }
check('Dreifache Stellungswiederholung', rep.status() === 'repetition');

check('Nach Zeitablauf: nackter König kann nicht mattsetzen',
  !new ChessGame('8/8/4k3/8/8/3KQ3/8/8 w - - 0 1').canStillMate('b'));

// --- Computergegner ---------------------------------------------------------
const mateIn1 = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';  // Ta8#
for (const level of ['mittel', 'stark', 'profi']) {
  const g = new ChessGame(mateIn1);
  const r = ChessEngine.findBestMove(g.fen(), g.keys, level);
  check(`Stufe ${level} findet Matt in 1`, sq(r) === 'a1a8', sq(r));
}

const freeQueen = 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1';  // Sxh4 gewinnt die Dame
for (const level of ['stark', 'profi']) {
  const g = new ChessGame(freeQueen);
  const r = ChessEngine.findBestMove(g.fen(), g.keys, level);
  check(`Stufe ${level} schlägt die freie Dame`, sq(r) === 'f3h4', sq(r));
}

for (const level of Object.keys(ChessEngine.LEVELS)) {
  const g = new ChessGame();
  const t = Date.now();
  const r = ChessEngine.findBestMove(g.fen(), g.keys, level);
  check(`Stufe ${level} aus der Grundstellung`, true,
    `${sq(r)} in ${Date.now() - t} ms, Tiefe ${r.depth}, ${r.nodes} Stellungen`);
}

console.log(failed ? `\n${failed} Test(s) fehlgeschlagen.` : '\nAlle Tests bestanden.');
process.exit(failed ? 1 : 0);
