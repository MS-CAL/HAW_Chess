'use strict';

/*
 * Darstellung und Bedienung: zeichnet das Brett und reagiert auf Klicks.
 * Die Regeln selbst stecken in chess.js (Klasse ChessGame).
 */

// Gefüllte Schachsymbole für beide Farben; die Farbe kommt aus dem CSS.
// ︎ verhindert, dass manche Systeme die Bauern als bunte Emojis darstellen.
const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎' };
const NAMES = { w: 'Weiß', b: 'Schwarz' };

const game = new ChessGame();
const boardEl = document.getElementById('board');
const statusEl = document.getElementById('status');
const movesEl = document.getElementById('moves');
const promotionEl = document.getElementById('promotion');
const promotionChoicesEl = document.getElementById('promotion-choices');

let selected = null;      // ausgewähltes Feld {r, c}
let targets = [];         // legale Züge der ausgewählten Figur
let gameOver = false;

function render() {
  boardEl.innerHTML = '';
  const last = game.history[game.history.length - 1];
  const checkedKing = game.inCheck() ? game.findKing(game.turn) : null;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;

      if (selected && selected.r === r && selected.c === c) sq.classList.add('selected');
      if (last && ((last.from.r === r && last.from.c === c) || (last.to.r === r && last.to.c === c))) {
        sq.classList.add('last-move');
      }
      if (checkedKing && checkedKing.r === r && checkedKing.c === c) sq.classList.add('in-check');

      const move = targets.find((m) => m.to.r === r && m.to.c === c);
      if (move) {
        sq.classList.add('target');
        if (move.captured) sq.classList.add('capture');
      }

      if (c === 0) sq.appendChild(coord('rank', 8 - r));
      if (r === 7) sq.appendChild(coord('file', 'abcdefgh'[c]));

      const piece = game.pieceAt(r, c);
      if (piece) {
        const p = document.createElement('span');
        p.className = 'piece ' + piece.color;
        p.textContent = GLYPHS[piece.type];
        sq.appendChild(p);
      }
      boardEl.appendChild(sq);
    }
  }
  renderStatus();
  renderMoves();
}

function coord(kind, text) {
  const el = document.createElement('span');
  el.className = 'coord ' + kind;
  el.textContent = text;
  return el;
}

function renderStatus() {
  const status = game.status();
  const side = NAMES[game.turn];
  const texts = {
    playing: `${side} ist am Zug`,
    check: `Schach! ${side} ist am Zug`,
    checkmate: `Schachmatt! ${NAMES[game.turn === 'w' ? 'b' : 'w']} gewinnt.`,
    stalemate: 'Patt! Die Partie endet unentschieden.',
  };
  statusEl.textContent = texts[status];
  statusEl.classList.toggle('alert', status !== 'playing');
  gameOver = status === 'checkmate' || status === 'stalemate';
}

function renderMoves() {
  movesEl.innerHTML = '';
  for (let i = 0; i < game.history.length; i += 2) {
    const li = document.createElement('li');
    const white = document.createElement('span');
    white.textContent = game.history[i].san;
    li.appendChild(white);
    if (game.history[i + 1]) {
      const black = document.createElement('span');
      black.textContent = game.history[i + 1].san;
      li.appendChild(black);
    }
    movesEl.appendChild(li);
  }
  movesEl.scrollTop = movesEl.scrollHeight;
}

function onSquareClick(r, c) {
  if (gameOver || !promotionEl.hidden) return;

  // Klick auf ein markiertes Zielfeld: Zug ausführen
  const move = targets.find((m) => m.to.r === r && m.to.c === c);
  if (move) {
    if (move.promotion) {
      askPromotion(move.piece.color).then((type) => play(move, type));
    } else {
      play(move);
    }
    return;
  }

  // Sonst: eigene Figur auswählen (oder Auswahl aufheben)
  const piece = game.pieceAt(r, c);
  if (piece && piece.color === game.turn && !(selected && selected.r === r && selected.c === c)) {
    selected = { r, c };
    targets = game.legalMoves(r, c);
  } else {
    selected = null;
    targets = [];
  }
  render();
}

function play(move, promotionType) {
  game.makeMove(move, promotionType);
  selected = null;
  targets = [];
  render();
}

function askPromotion(color) {
  return new Promise((resolve) => {
    promotionChoicesEl.innerHTML = '';
    for (const type of ['q', 'r', 'b', 'n']) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = `<span class="piece ${color}">${GLYPHS[type]}</span>`;
      btn.addEventListener('click', () => {
        promotionEl.hidden = true;
        resolve(type);
      });
      promotionChoicesEl.appendChild(btn);
    }
    promotionEl.hidden = false;
  });
}

boardEl.addEventListener('click', (e) => {
  const sq = e.target.closest('.square');
  if (sq) onSquareClick(Number(sq.dataset.r), Number(sq.dataset.c));
});

document.getElementById('new-game').addEventListener('click', () => {
  game.reset();
  selected = null;
  targets = [];
  render();
});

render();
