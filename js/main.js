'use strict';

/*
 * Darstellung und Bedienung: Brett zeichnen, Klicks auswerten, Spieler (Mensch/Computer),
 * Schachuhr, Remis und Aufgeben. Die Regeln stecken in chess.js, der Computergegner in engine.js.
 */

const NAMES = { w: 'Weiß', b: 'Schwarz' };
const COLORS = ['w', 'b'];
const MIN_AI_DELAY = 400;   // ms – damit man die Computerzüge mitverfolgen kann
const LOW_TIME = 20000;     // ms – ab hier wird die Uhr rot

const $ = (id) => document.getElementById(id);
const other = (color) => (color === 'w' ? 'b' : 'w');

const game = new ChessGame();

let players = { w: 'human', b: 'human' };  // 'human' oder eine Computerstufe ('leicht', …, 'profi')
let clock = null;      // { w, b: Restzeit in ms, increment, running: Farbe|null, lastTick }
let result = null;     // Text, sobald die Partie beendet ist
let flipped = false;   // Brett gedreht (Schwarz unten)
let selected = null;   // ausgewähltes Feld {r, c}
let targets = [];      // legale Züge der ausgewählten Figur
let aiToken = 0;       // erhöht sich, wenn eine laufende Computerberechnung verworfen werden soll
let aiThinking = false;

// =============================================================================
// Computergegner: läuft nach Möglichkeit in einem Web Worker (eigener Thread).
// Wird die Seite direkt als Datei geöffnet, erlauben manche Browser keine Worker –
// dann rechnet der Computer im Hauptthread (die Seite reagiert solange etwas träge).
// =============================================================================

let worker = null;
let pending = null;
let requestId = 0;

try {
  worker = new Worker('js/engine-worker.js');
  worker.onmessage = (e) => {
    if (pending && e.data.id === pending.id) {
      const p = pending;
      pending = null;
      p.resolve(e.data.result);
    }
  };
  worker.onerror = (e) => {
    e.preventDefault();
    worker = null;
    if (pending) {
      const p = pending;
      pending = null;
      runLocally(p.request).then(p.resolve);
    }
  };
} catch (err) {
  worker = null;
}

function runLocally(request) {
  // kurze Pause, damit "Computer denkt nach …" noch angezeigt wird
  return new Promise((resolve) => setTimeout(() => {
    resolve(ChessEngine.findBestMove(request.fen, request.keys, request.level, request.maxTime));
  }, 30));
}

function askEngine(request) {
  if (!worker) return runLocally(request);
  return new Promise((resolve) => {
    pending = { id: ++requestId, request, resolve };
    worker.postMessage({ id: pending.id, ...request });
  });
}

function maybeComputerMove() {
  if (result || aiThinking || players[game.turn] === 'human') return;
  aiThinking = true;
  const token = ++aiToken;
  const color = game.turn;
  const started = Date.now();

  // Mit Schachuhr darf der Computer nur einen Bruchteil seiner Restzeit verbrauchen.
  const maxTime = clock ? Math.max(100, clock[color] / 30 + clock.increment * 0.8) : Infinity;

  renderStatus();
  askEngine({ fen: game.fen(), keys: game.keys, level: players[color], maxTime }).then((res) => {
    const wait = Math.max(0, MIN_AI_DELAY - (Date.now() - started));
    setTimeout(() => {
      if (token !== aiToken) return;  // inzwischen überholt (neues Spiel, Mensch übernimmt, …)
      aiThinking = false;
      const move = game.allLegalMoves().find((m) =>
        m.from.r === res.from.r && m.from.c === res.from.c && m.to.r === res.to.r && m.to.c === res.to.c);
      play(move, res.promotion || 'q');
    }, wait);
  });
}

function cancelComputer() {
  aiToken++;
  aiThinking = false;
}

// =============================================================================
// Spielablauf
// =============================================================================

function startGame(settings) {
  cancelComputer();
  game.reset();
  players = { w: settings.w, b: settings.b };
  result = null;
  selected = null;
  targets = [];
  // Spielt ein Mensch nur Schwarz, wird das Brett gedreht.
  flipped = players.w !== 'human' && players.b === 'human';
  clock = settings.useClock
    ? { w: settings.minutes * 60000, b: settings.minutes * 60000,
        increment: settings.increment * 1000, running: 'w', lastTick: Date.now() }
    : null;
  render();
  maybeComputerMove();
}

function play(move, promotionType) {
  if (result) return;
  if (clock) {
    tickClock();
    if (result) return;  // Zeit ist genau jetzt abgelaufen
    clock[game.turn] += clock.increment;
    clock.running = other(game.turn);
    clock.lastTick = Date.now();
  }
  game.makeMove(move, promotionType);
  selected = null;
  targets = [];
  checkGameEnd();
  render();
  maybeComputerMove();
}

function checkGameEnd() {
  const texts = {
    checkmate: `Schachmatt! ${NAMES[other(game.turn)]} gewinnt.`,
    stalemate: 'Patt! Die Partie endet remis.',
    insufficient: 'Remis: Keine Seite hat genug Material zum Mattsetzen.',
    fifty: 'Remis: 50 Züge ohne Bauernzug oder Schlagen.',
    repetition: 'Remis: Dieselbe Stellung kam dreimal vor.',
  };
  const text = texts[game.status()];
  if (text) endGame(text);
}

function endGame(text) {
  result = text;
  if (clock) clock.running = null;
  cancelComputer();
  selected = null;
  targets = [];
  render();
}

// =============================================================================
// Schachuhr
// =============================================================================

function tickClock() {
  if (!clock || !clock.running || result) return;
  const now = Date.now();
  const color = clock.running;
  clock[color] -= now - clock.lastTick;
  clock.lastTick = now;
  if (clock[color] <= 0) {
    clock[color] = 0;
    const winner = other(color);
    endGame(game.canStillMate(winner)
      ? `Zeit abgelaufen! ${NAMES[winner]} gewinnt.`
      : `Zeit abgelaufen, aber ${NAMES[winner]} kann nicht mehr mattsetzen: Remis.`);
  }
  renderClocks();
}

setInterval(tickClock, 100);

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  // unter 10 Sekunden mit Zehntelsekunden
  if (ms < 10000) return `0:0${Math.floor(ms / 1000)}.${Math.floor((ms % 1000) / 100)}`;
  return `${m}:${s}`;
}

// =============================================================================
// Darstellung
// =============================================================================

const boardEl = $('board');

function render() {
  renderBoard();
  renderPlayers();
  renderClocks();
  renderStatus();
  renderMoves();
  renderButtons();
}

function renderBoard() {
  boardEl.innerHTML = '';
  const last = game.history[game.history.length - 1];
  const checkedKing = game.inCheck() ? game.findKing(game.turn) : null;
  const same = (a, r, c) => a && a.r === r && a.c === c;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const r = flipped ? 7 - row : row;
      const c = flipped ? 7 - col : col;
      const sq = document.createElement('div');
      sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
      sq.dataset.r = r;
      sq.dataset.c = c;

      if (same(selected, r, c)) sq.classList.add('selected');
      if (last && (same(last.from, r, c) || same(last.to, r, c))) sq.classList.add('last-move');
      if (same(checkedKing, r, c)) sq.classList.add('in-check');

      const move = targets.find((m) => same(m.to, r, c));
      if (move) {
        sq.classList.add('target');
        if (move.captured) sq.classList.add('capture');
      }

      if (col === 0) sq.appendChild(coord('rank', 8 - r));
      if (row === 7) sq.appendChild(coord('file', 'abcdefgh'[c]));

      const piece = game.pieceAt(r, c);
      if (piece) sq.insertAdjacentHTML('beforeend', pieceSvg(piece.type, piece.color));
      boardEl.appendChild(sq);
    }
  }
}

function coord(kind, text) {
  const el = document.createElement('span');
  el.className = 'coord ' + kind;
  el.textContent = text;
  return el;
}

function renderPlayers() {
  $('players').classList.toggle('flipped', flipped);
  for (const color of COLORS) {
    const el = document.querySelector(`.player[data-color="${color}"]`);
    el.classList.toggle('active', !result && game.turn === color);
    el.querySelector('select').value = players[color];
  }
}

function renderClocks() {
  for (const color of COLORS) {
    const el = document.querySelector(`.player[data-color="${color}"] .clock`);
    el.hidden = !clock;
    if (!clock) continue;
    el.textContent = formatTime(clock[color]);
    el.classList.toggle('low', clock[color] < LOW_TIME);
  }
}

function renderStatus() {
  const el = $('status');
  if (result) {
    el.textContent = result;
    el.classList.add('alert');
    return;
  }
  const side = NAMES[game.turn];
  const check = game.inCheck();
  let text = check ? `Schach! ${side} ist am Zug` : `${side} ist am Zug`;
  if (aiThinking) text += ' – Computer denkt nach …';
  el.textContent = text;
  el.classList.toggle('alert', check);
}

function renderMoves() {
  const movesEl = $('moves');
  movesEl.innerHTML = '';
  for (let i = 0; i < game.history.length; i += 2) {
    const li = document.createElement('li');
    for (const rec of [game.history[i], game.history[i + 1]]) {
      if (!rec) continue;
      const span = document.createElement('span');
      span.textContent = rec.san;
      li.appendChild(span);
    }
    movesEl.appendChild(li);
  }
  movesEl.scrollTop = movesEl.scrollHeight;
}

function renderButtons() {
  const actor = actingHuman();
  $('offer-draw').disabled = !!result || !actor || game.history.length === 0;
  $('resign').disabled = !!result || !actor;
}

// =============================================================================
// Bedienung
// =============================================================================

function anyModalOpen() {
  return [...document.querySelectorAll('.modal')].some((m) => !m.hidden);
}

boardEl.addEventListener('click', (e) => {
  const sq = e.target.closest('.square');
  if (sq) onSquareClick(Number(sq.dataset.r), Number(sq.dataset.c));
});

function onSquareClick(r, c) {
  if (result || anyModalOpen() || players[game.turn] !== 'human') return;

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
  renderBoard();
}

function askPromotion(color) {
  return new Promise((resolve) => {
    const box = $('promotion-choices');
    box.innerHTML = '';
    for (const type of ['q', 'r', 'b', 'n']) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = pieceSvg(type, color);
      btn.addEventListener('click', () => {
        $('promotion').hidden = true;
        resolve(type);
      });
      box.appendChild(btn);
    }
    $('promotion').hidden = false;
  });
}

/** Zeigt eine Rückfrage an und liefert den Index des gewählten Knopfs. */
function ask(text, buttons) {
  return new Promise((resolve) => {
    $('dialog-text').textContent = text;
    const box = $('dialog-buttons');
    box.innerHTML = '';
    buttons.forEach((label, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      if (i > 0) btn.className = 'secondary';
      btn.addEventListener('click', () => {
        $('dialog').hidden = true;
        resolve(i);
      });
      box.appendChild(btn);
    });
    $('dialog').hidden = false;
  });
}

/**
 * Für wen gelten "Remis anbieten" und "Aufgeben"?
 * Spielt nur ein Mensch, für diesen. Spielen zwei Menschen, für den, der am Zug ist.
 */
function actingHuman() {
  const humans = COLORS.filter((c) => players[c] === 'human');
  if (humans.length === 1) return humans[0];
  if (humans.length === 2) return game.turn;
  return null;
}

$('resign').addEventListener('click', async () => {
  const color = actingHuman();
  if (!color || result) return;
  const answer = await ask(`${NAMES[color]}: Wirklich aufgeben?`, ['Aufgeben', 'Weiterspielen']);
  if (answer === 0 && !result) endGame(`${NAMES[color]} gibt auf. ${NAMES[other(color)]} gewinnt.`);
});

$('offer-draw').addEventListener('click', async () => {
  const color = actingHuman();
  if (!color || result) return;
  const opp = other(color);
  if (players[opp] === 'human') {
    const answer = await ask(`${NAMES[color]} bietet Remis an. ${NAMES[opp]}, nimmst du an?`, ['Annehmen', 'Ablehnen']);
    if (answer === 0 && !result) endGame('Remis durch Einigung.');
    return;
  }
  // Der Computer nimmt an, wenn er klar schlechter steht (mehr als 1,5 Bauern)
  // oder wenn die Partie schon lange läuft und ausgeglichen ist.
  const scoreForWhite = ChessEngine.evaluatePosition(game.fen(), game.keys);
  const scoreForComputer = opp === 'w' ? scoreForWhite : -scoreForWhite;
  const clearlyWorse = scoreForComputer <= -150;
  const longAndEqual = game.fullmove >= 40 && Math.abs(scoreForComputer) <= 30;
  if (clearlyWorse || longAndEqual) {
    endGame('Der Computer nimmt das Remis an.');
  } else {
    await ask('Der Computer lehnt das Remis ab.', ['OK']);
  }
});

$('flip').addEventListener('click', () => {
  flipped = !flipped;
  render();
});

// Spieler können jederzeit wechseln: Der Computer übernimmt – oder der Mensch wieder.
function fillPlayerSelect(select) {
  select.innerHTML = '';
  select.add(new Option('Mensch', 'human'));
  for (const [key, level] of Object.entries(ChessEngine.LEVELS)) {
    select.add(new Option(`Computer – ${level.label}`, key));
  }
}

for (const color of COLORS) {
  const select = document.querySelector(`.player[data-color="${color}"] select`);
  fillPlayerSelect(select);
  select.addEventListener('change', () => {
    players[color] = select.value;
    if (game.turn === color) {
      cancelComputer();     // falls der Computer gerade für diese Seite rechnet
      selected = null;
      targets = [];
    }
    render();
    maybeComputerMove();
  });
}

// --- Startdialog -------------------------------------------------------------

const setupForm = $('setup-form');
fillPlayerSelect(setupForm.elements.w);
fillPlayerSelect(setupForm.elements.b);

function openSetup(canCancel) {
  setupForm.elements.w.value = players.w;
  setupForm.elements.b.value = players.b;
  $('setup-cancel').hidden = !canCancel;
  $('setup').hidden = false;
}

setupForm.elements.useClock.addEventListener('change', (e) => {
  $('clock-settings').disabled = !e.target.checked;
});

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [min, inc] = btn.dataset.preset.split('+');
    setupForm.elements.minutes.value = min;
    setupForm.elements.increment.value = inc;
  });
});

setupForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = setupForm.elements;
  $('setup').hidden = true;
  startGame({
    w: f.w.value,
    b: f.b.value,
    useClock: f.useClock.checked,
    minutes: Math.max(1, Number(f.minutes.value) || 10),
    increment: Math.max(0, Number(f.increment.value) || 0),
  });
});

$('setup-cancel').addEventListener('click', () => {
  $('setup').hidden = true;
});

$('new-game').addEventListener('click', () => openSetup(true));

document.querySelectorAll('[data-piece]').forEach((el) => {
  el.innerHTML = pieceSvg(el.dataset.piece, el.dataset.color);
});

render();
openSetup(false);
