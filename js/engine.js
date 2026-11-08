'use strict';

/*
 * Computergegner.
 *
 * Funktionsweise (klassisch, ohne KI-Training):
 *  1. Bewertung: Jede Stellung bekommt eine Zahl ("Centipawns", 100 = ein Bauer).
 *     Gezählt wird Material plus ein Bonus/Malus je nach Feld (z. B. Springer im Zentrum sind besser).
 *  2. Suche: Der Computer probiert Züge, Antworten, Antworten darauf … bis zu einer bestimmten Tiefe
 *     (Minimax mit Alpha-Beta-Abschneiden) und wählt den Zug mit dem besten erzwingbaren Ergebnis.
 *  3. Ruhesuche: Am Ende der Suche werden Schlagabtausche noch zu Ende gerechnet,
 *     damit der Computer nicht mitten in einem Abtausch falsch bewertet.
 *
 * Die Schwierigkeitsstufen unterscheiden sich in Suchtiefe, Bedenkzeit und
 * einem absichtlichen "Rauschen" in der Bewertung (= Fehler, wie sie Menschen machen).
 */

const ChessEngine = (() => {
  const LEVELS = {
    leicht: { label: 'Leicht', depth: 1, noise: 250, quiescence: false, time: 400 },
    mittel: { label: 'Mittel', depth: 2, noise: 70, quiescence: true, time: 800 },
    stark:  { label: 'Stark',  depth: 3, noise: 20, quiescence: true, time: 1500 },
    profi:  { label: 'Profi',  depth: 10, noise: 0, quiescence: true, time: 3000 },
  };

  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000;
  const INF = 1e9;
  const STOP = new Error('stop');

  // Feldtabellen aus Sicht von Weiß; erste Zeile = Reihe 8 (Quelle: "Simplified Evaluation Function").
  const PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0],
    n: [
     -50,-40,-30,-30,-30,-30,-40,-50,
     -40,-20,  0,  0,  0,  0,-20,-40,
     -30,  0, 10, 15, 15, 10,  0,-30,
     -30,  5, 15, 20, 20, 15,  5,-30,
     -30,  0, 15, 20, 20, 15,  0,-30,
     -30,  5, 10, 15, 15, 10,  5,-30,
     -40,-20,  0,  5,  5,  0,-20,-40,
     -50,-40,-30,-30,-30,-30,-40,-50],
    b: [
     -20,-10,-10,-10,-10,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5, 10, 10,  5,  0,-10,
     -10,  5,  5, 10, 10,  5,  5,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10, 10, 10, 10, 10, 10, 10,-10,
     -10,  5,  0,  0,  0,  0,  5,-10,
     -20,-10,-10,-10,-10,-10,-10,-20],
    r: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0],
    q: [
     -20,-10,-10, -5, -5,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
       0,  0,  5,  5,  5,  5,  0, -5,
     -10,  5,  5,  5,  5,  5,  0,-10,
     -10,  0,  5,  0,  0,  0,  0,-10,
     -20,-10,-10, -5, -5,-10,-10,-20],
    k: [ // Mittelspiel: König in Sicherheit hinter den Bauern
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20,
     -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20],
    kEnd: [ // Endspiel: König wird aktiv und geht ins Zentrum
     -50,-40,-30,-20,-20,-30,-40,-50,
     -30,-20,-10,  0,  0,-10,-20,-30,
     -30,-10, 20, 30, 30, 20,-10,-30,
     -30,-10, 30, 40, 40, 30,-10,-30,
     -30,-10, 30, 40, 40, 30,-10,-30,
     -30,-10, 20, 30, 30, 20,-10,-30,
     -30,-30,  0,  0,  0,  0,-30,-30,
     -50,-30,-30,-30,-30,-30,-30,-50],
  };

  /** Bewertung aus Sicht der Seite, die am Zug ist (positiv = gut für sie). */
  function evaluate(game) {
    let score = 0, officers = 0;
    const kings = {};
    const bishops = { w: 0, b: 0 };
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = game.board[r][c];
        if (!p) continue;
        if (p.type === 'k') { kings[p.color] = { r, c }; continue; }
        if (p.type !== 'p') officers += VALUE[p.type];
        if (p.type === 'b') bishops[p.color]++;
        const idx = p.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
        const v = VALUE[p.type] + PST[p.type][idx];
        score += p.color === 'w' ? v : -v;
      }
    }
    const kingTable = officers <= 2600 ? PST.kEnd : PST.k;
    if (kings.w) score += kingTable[kings.w.r * 8 + kings.w.c];
    if (kings.b) score -= kingTable[(7 - kings.b.r) * 8 + kings.b.c];
    if (bishops.w >= 2) score += 30;  // Läuferpaar
    if (bishops.b >= 2) score -= 30;
    return game.turn === 'w' ? score : -score;
  }

  /** Erfolgversprechende Züge zuerst (Schlagen mit wertvollem Opfer, Umwandlungen) → mehr Abschneiden. */
  function orderMoves(moves, first) {
    const rank = (m) => {
      if (first && m.from.r === first.from.r && m.from.c === first.from.c
          && m.to.r === first.to.r && m.to.c === first.to.c) return 1e6;
      let s = 0;
      if (m.captured) s += 10000 + 10 * VALUE[m.captured.type] - VALUE[m.piece.type];
      if (m.promotion) s += 9000;
      return s;
    };
    return moves.map((m) => [rank(m), m]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  }

  function checkTime(state) {
    if ((++state.nodes & 1023) === 0 && Date.now() > state.deadline) throw STOP;
  }

  function quiesce(state, alpha, beta) {
    checkTime(state);
    const g = state.game;
    const standPat = evaluate(g);
    if (standPat >= beta) return standPat;
    if (standPat > alpha) alpha = standPat;
    const color = g.turn;
    const moves = orderMoves(g.allPseudoMoves().filter((m) => m.captured || m.promotion));
    for (const m of moves) {
      const saved = g.saveState();
      g.applyMove(m, 'q');
      if (g.inCheck(color)) { g.restoreState(saved); continue; }
      const score = -quiesce(state, -beta, -alpha);
      g.restoreState(saved);
      if (score >= beta) return score;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(state, depth, alpha, beta, ply) {
    checkTime(state);
    const g = state.game;

    // Remis-Stellungen: Wiederholung, 50-Züge-Regel, ungenügendes Material
    const key = g.positionKey();
    if (state.seen.get(key) || g.halfmove >= 100 || g.isInsufficientMaterial()) return 0;

    if (depth <= 0) return state.quiescence ? quiesce(state, alpha, beta) : evaluate(g);

    state.seen.set(key, 1);
    try {
      const color = g.turn;
      let best = -INF, legal = 0;
      for (const m of orderMoves(g.allPseudoMoves())) {
        const saved = g.saveState();
        g.applyMove(m, 'q');
        if (g.inCheck(color)) { g.restoreState(saved); continue; }
        legal++;
        const score = -search(state, depth - 1, -beta, -alpha, ply + 1);
        g.restoreState(saved);
        if (score > best) best = score;
        if (score > alpha) alpha = score;
        if (alpha >= beta) break;
      }
      if (legal === 0) return g.inCheck(color) ? -MATE + ply : 0;  // Matt (früheres Matt ist besser) oder Patt
      return best;
    } finally {
      state.seen.delete(key);
    }
  }

  function rootSearch(state, depth) {
    const g = state.game;
    const color = g.turn;
    let alpha = -INF, bestMove = null, bestScore = -INF;
    for (const m of orderMoves(g.allPseudoMoves(), state.bestMove)) {
      const saved = g.saveState();
      g.applyMove(m, 'q');
      if (g.inCheck(color)) { g.restoreState(saved); continue; }
      let score;
      if (state.noise) {
        // Absichtliche Ungenauigkeit für niedrigere Spielstärken
        score = -search(state, depth - 1, -INF, INF, 1) + (Math.random() * 2 - 1) * state.noise;
      } else {
        score = -search(state, depth - 1, -INF, -alpha, 1);
      }
      g.restoreState(saved);
      if (score > bestScore) { bestScore = score; bestMove = m; }
      if (score > alpha) alpha = score;
    }
    return { move: bestMove, score: bestScore };
  }

  /**
   * Sucht den besten Zug.
   * @param fen        aktuelle Stellung
   * @param keys       bisherige Stellungen der Partie (für Wiederholungen)
   * @param levelName  'leicht' | 'mittel' | 'stark' | 'profi'
   * @param maxTime    optionale Obergrenze der Bedenkzeit in ms (z. B. wegen Schachuhr)
   */
  function findBestMove(fen, keys, levelName, maxTime = Infinity) {
    const level = typeof levelName === 'string' ? LEVELS[levelName] : levelName;
    const game = new ChessGame(fen);
    const seen = new Map();
    for (const k of keys.slice(0, -1)) seen.set(k, 1);  // frühere Stellungen; die aktuelle ist die Wurzel
    const state = {
      game, seen, nodes: 0, bestMove: null,
      noise: level.noise, quiescence: level.quiescence,
      deadline: Infinity,
    };
    const deadline = Date.now() + Math.min(level.time, maxTime);
    let result = null, depthReached = 0;

    // Iterative Vertiefung: erst Tiefe 1, dann 2, … bis die Zeit um ist.
    for (let d = 1; d <= level.depth; d++) {
      state.deadline = d === 1 ? Infinity : deadline;
      try {
        result = rootSearch(state, d);
        state.bestMove = result.move;
        depthReached = d;
        if (Math.abs(result.score) > MATE - 1000 || Date.now() > deadline) break;
      } catch (e) {
        if (e !== STOP) throw e;
        break;
      }
    }
    const m = result.move;
    return {
      from: m.from, to: m.to, promotion: m.promotion ? 'q' : null,
      score: result.score, depth: depthReached, nodes: state.nodes,
    };
  }

  /** Bewertung der Stellung aus Sicht von Weiß (für Remisangebote an den Computer). */
  function evaluatePosition(fen, keys) {
    const analysis = { depth: 3, noise: 0, quiescence: true, time: 500 };
    const { score } = findBestMove(fen, keys, analysis);
    return fen.split(' ')[1] === 'w' ? score : -score;
  }

  return { LEVELS, findBestMove, evaluatePosition, evaluate };
})();

if (typeof module !== 'undefined') module.exports = { ChessEngine };
