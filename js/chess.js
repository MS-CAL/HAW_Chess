'use strict';

/*
 * Spiellogik für Schach nach den FIDE-Regeln.
 * Diese Datei kennt keine Darstellung (kein HTML) – nur das Brett und die Regeln.
 *
 * Koordinaten: board[zeile][spalte]
 *   zeile 0 = Reihe 8 (schwarze Grundreihe), zeile 7 = Reihe 1 (weiße Grundreihe)
 *   spalte 0 = Linie a, spalte 7 = Linie h
 * Figuren: { type: 'k'|'q'|'r'|'b'|'n'|'p', color: 'w'|'b' }
 */

const FILES = 'abcdefgh';

const KNIGHT_STEPS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING_STEPS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function squareName(r, c) {
  return FILES[c] + (8 - r);
}

function opponent(color) {
  return color === 'w' ? 'b' : 'w';
}

class ChessGame {
  constructor(fen = START_FEN) {
    this.load(fen);
  }

  /** Lädt eine Stellung im FEN-Format (Standardformat zur Beschreibung von Schachstellungen). */
  load(fen) {
    const [placement, turn, castling, ep, halfmove, fullmove] = fen.trim().split(/\s+/);
    this.board = Array.from({ length: 8 }, () => Array(8).fill(null));
    placement.split('/').forEach((row, r) => {
      let c = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          c += Number(ch);
        } else {
          const color = ch === ch.toUpperCase() ? 'w' : 'b';
          this.board[r][c] = { type: ch.toLowerCase(), color };
          c++;
        }
      }
    });
    this.turn = turn || 'w';
    const cr = castling || '-';
    this.castling = {
      w: { k: cr.includes('K'), q: cr.includes('Q') },
      b: { k: cr.includes('k'), q: cr.includes('q') },
    };
    this.enPassant = ep && ep !== '-'
      ? { r: 8 - Number(ep[1]), c: FILES.indexOf(ep[0]) }
      : null;
    this.halfmove = Number(halfmove) || 0;  // Halbzüge seit dem letzten Bauernzug oder Schlagen (50-Züge-Regel)
    this.fullmove = Number(fullmove) || 1;  // Zugnummer
    this.history = [];
    this.keys = [this.positionKey()];       // alle bisherigen Stellungen (Stellungswiederholung)
  }

  /** Gibt die aktuelle Stellung im FEN-Format zurück. */
  fen() {
    const rows = this.board.map((row) => {
      let out = '', empty = 0;
      for (const p of row) {
        if (!p) { empty++; continue; }
        if (empty) { out += empty; empty = 0; }
        out += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
      return out + (empty || '');
    });
    const ep = this.enPassant ? squareName(this.enPassant.r, this.enPassant.c) : '-';
    return `${rows.join('/')} ${this.turn} ${this.castlingString()} ${ep} ${this.halfmove} ${this.fullmove}`;
  }

  castlingString() {
    const { w, b } = this.castling;
    return (w.k ? 'K' : '') + (w.q ? 'Q' : '') + (b.k ? 'k' : '') + (b.q ? 'q' : '') || '-';
  }

  /**
   * Eindeutiger Schlüssel einer Stellung für die Wiederholungsregel:
   * gleiche Figuren, gleiche Seite am Zug, gleiche Rochade- und en-passant-Möglichkeiten.
   */
  positionKey() {
    let key = this.fen().split(' ').slice(0, 3).join(' ');
    const ep = this.enPassant;
    if (ep) {
      // en passant zählt nur, wenn ein Bauer auch tatsächlich schlagen könnte
      const pawnRow = this.turn === 'w' ? ep.r + 1 : ep.r - 1;
      const canCapture = [ep.c - 1, ep.c + 1].some((c) => {
        const p = inBounds(pawnRow, c) && this.board[pawnRow][c];
        return p && p.type === 'p' && p.color === this.turn;
      });
      if (canCapture) key += ' ' + squareName(ep.r, ep.c);
    }
    return key;
  }

  reset() {
    this.load(START_FEN);
  }

  pieceAt(r, c) {
    return this.board[r][c];
  }

  // ---------------------------------------------------------------------------
  // Angriffe
  // ---------------------------------------------------------------------------

  /** Wird das Feld (r, c) von einer Figur der Farbe `by` angegriffen? */
  isSquareAttacked(r, c, by) {
    const b = this.board;
    const is = (rr, cc, types) => {
      if (!inBounds(rr, cc)) return false;
      const p = b[rr][cc];
      return p !== null && p.color === by && types.includes(p.type);
    };

    // Bauern greifen schräg nach vorne an. Ein weißer Bauer greift von unten (r+1) an.
    const pawnRow = by === 'w' ? r + 1 : r - 1;
    if (is(pawnRow, c - 1, 'p') || is(pawnRow, c + 1, 'p')) return true;

    for (const [dr, dc] of KNIGHT_STEPS) if (is(r + dr, c + dc, 'n')) return true;
    for (const [dr, dc] of KING_STEPS) if (is(r + dr, c + dc, 'k')) return true;

    const slides = [[ROOK_DIRS, 'rq'], [BISHOP_DIRS, 'bq']];
    for (const [dirs, types] of slides) {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (inBounds(rr, cc)) {
          const p = b[rr][cc];
          if (p) {
            if (p.color === by && types.includes(p.type)) return true;
            break;
          }
          rr += dr; cc += dc;
        }
      }
    }
    return false;
  }

  findKing(color) {
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.type === 'k' && p.color === color) return { r, c };
      }
    }
    return null;
  }

  inCheck(color = this.turn) {
    const k = this.findKing(color);
    return k !== null && this.isSquareAttacked(k.r, k.c, opponent(color));
  }

  // ---------------------------------------------------------------------------
  // Zuggenerierung
  // ---------------------------------------------------------------------------

  /**
   * "Pseudolegale" Züge: so wie sich die Figur bewegen darf,
   * ohne zu prüfen, ob der eigene König danach im Schach steht.
   */
  pseudoMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece) return [];
    const moves = [];
    const { color, type } = piece;
    const from = { r, c };
    const add = (tr, tc, extra = {}) => {
      moves.push({ from, to: { r: tr, c: tc }, piece, captured: this.board[tr][tc], ...extra });
    };

    if (type === 'p') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const lastRow = color === 'w' ? 0 : 7;
      const promo = (tr) => (tr === lastRow ? { promotion: true } : {});

      // Ein Feld vorwärts, aus der Grundstellung auch zwei Felder.
      if (inBounds(r + dir, c) && !this.board[r + dir][c]) {
        add(r + dir, c, promo(r + dir));
        if (r === startRow && !this.board[r + 2 * dir][c]) {
          add(r + 2 * dir, c, { doublePush: true });
        }
      }
      // Schlagen schräg nach vorne, inklusive "en passant".
      for (const dc of [-1, 1]) {
        const tr = r + dir, tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = this.board[tr][tc];
        if (target && target.color !== color) {
          add(tr, tc, promo(tr));
        } else if (this.enPassant && this.enPassant.r === tr && this.enPassant.c === tc) {
          add(tr, tc, { enPassant: true, captured: this.board[r][tc] });
        }
      }
      return moves;
    }

    if (type === 'n' || type === 'k') {
      for (const [dr, dc] of type === 'n' ? KNIGHT_STEPS : KING_STEPS) {
        const tr = r + dr, tc = c + dc;
        if (!inBounds(tr, tc)) continue;
        const target = this.board[tr][tc];
        if (!target || target.color !== color) add(tr, tc);
      }
      if (type === 'k') this.addCastlingMoves(r, c, color, add);
      return moves;
    }

    // Langschrittige Figuren: Turm, Läufer, Dame
    const dirs = type === 'r' ? ROOK_DIRS : type === 'b' ? BISHOP_DIRS : ROOK_DIRS.concat(BISHOP_DIRS);
    for (const [dr, dc] of dirs) {
      let tr = r + dr, tc = c + dc;
      while (inBounds(tr, tc)) {
        const target = this.board[tr][tc];
        if (!target) {
          add(tr, tc);
        } else {
          if (target.color !== color) add(tr, tc);
          break;
        }
        tr += dr; tc += dc;
      }
    }
    return moves;
  }

  /**
   * Rochade: König und Turm haben sich noch nicht bewegt, die Felder dazwischen sind frei,
   * und der König steht nicht im Schach, überquert kein angegriffenes Feld und landet auf keinem.
   */
  addCastlingMoves(r, c, color, add) {
    const homeRow = color === 'w' ? 7 : 0;
    if (r !== homeRow || c !== 4) return;
    const enemy = opponent(color);
    if (this.isSquareAttacked(r, 4, enemy)) return;
    const rights = this.castling[color];
    const b = this.board;
    const rookOk = (rc) => {
      const p = b[r][rc];
      return p && p.type === 'r' && p.color === color;
    };

    if (rights.k && rookOk(7) && !b[r][5] && !b[r][6]
        && !this.isSquareAttacked(r, 5, enemy) && !this.isSquareAttacked(r, 6, enemy)) {
      add(r, 6, { castle: 'k' });
    }
    if (rights.q && rookOk(0) && !b[r][1] && !b[r][2] && !b[r][3]
        && !this.isSquareAttacked(r, 3, enemy) && !this.isSquareAttacked(r, 2, enemy)) {
      add(r, 2, { castle: 'q' });
    }
  }

  /** Legale Züge der Figur auf (r, c): der eigene König darf danach nicht im Schach stehen. */
  legalMoves(r, c) {
    const piece = this.board[r][c];
    if (!piece || piece.color !== this.turn) return [];
    return this.pseudoMoves(r, c).filter((m) => {
      const saved = this.saveState();
      this.applyMove(m, 'q');
      const ok = !this.inCheck(piece.color);
      this.restoreState(saved);
      return ok;
    });
  }

  /** Alle pseudolegalen Züge der Seite am Zug (schneller, wird vom Computergegner genutzt). */
  allPseudoMoves() {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (p && p.color === this.turn) moves.push(...this.pseudoMoves(r, c));
      }
    }
    return moves;
  }

  allLegalMoves() {
    const moves = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) moves.push(...this.legalMoves(r, c));
    }
    return moves;
  }

  // ---------------------------------------------------------------------------
  // Züge ausführen
  // ---------------------------------------------------------------------------

  saveState() {
    return {
      board: this.board.map((row) => row.slice()),
      turn: this.turn,
      castling: { w: { ...this.castling.w }, b: { ...this.castling.b } },
      enPassant: this.enPassant,
      halfmove: this.halfmove,
      fullmove: this.fullmove,
    };
  }

  restoreState(s) {
    this.board = s.board;
    this.turn = s.turn;
    this.castling = s.castling;
    this.enPassant = s.enPassant;
    this.halfmove = s.halfmove;
    this.fullmove = s.fullmove;
  }

  /** Führt einen (bereits als legal bekannten) Zug aus. Ohne Prüfung, ohne Historie. */
  applyMove(m, promotionType = 'q') {
    const b = this.board;
    const { from, to, piece } = m;
    const color = piece.color;

    b[to.r][to.c] = m.promotion ? { type: promotionType, color } : piece;
    b[from.r][from.c] = null;

    if (m.enPassant) b[from.r][to.c] = null;

    if (m.castle === 'k') {
      b[to.r][5] = b[to.r][7];
      b[to.r][7] = null;
    } else if (m.castle === 'q') {
      b[to.r][3] = b[to.r][0];
      b[to.r][0] = null;
    }

    // Rochaderechte verfallen, wenn König oder Turm ziehen oder ein Turm geschlagen wird.
    if (piece.type === 'k') {
      this.castling[color] = { k: false, q: false };
    }
    for (const sq of [from, to]) {
      if (sq.r === 7 && sq.c === 0) this.castling.w.q = false;
      if (sq.r === 7 && sq.c === 7) this.castling.w.k = false;
      if (sq.r === 0 && sq.c === 0) this.castling.b.q = false;
      if (sq.r === 0 && sq.c === 7) this.castling.b.k = false;
    }

    this.enPassant = m.doublePush ? { r: (from.r + to.r) / 2, c: from.c } : null;
    this.halfmove = piece.type === 'p' || m.captured ? 0 : this.halfmove + 1;
    if (color === 'b') this.fullmove++;
    this.turn = opponent(color);
  }

  /** Öffentliche Methode: Zug ausführen und in der Partienotation festhalten. */
  makeMove(m, promotionType = 'q') {
    const san = this.toSan(m, promotionType);
    this.applyMove(m, promotionType);
    this.keys.push(this.positionKey());
    const status = this.status();
    const suffix = status === 'checkmate' ? '#' : this.inCheck() ? '+' : '';
    const record = { ...m, promotionType: m.promotion ? promotionType : null, san: san + suffix };
    this.history.push(record);
    return record;
  }

  /** Kurze algebraische Notation, z. B. "Sf3", "exd5", "O-O", "e8=D". */
  toSan(m, promotionType) {
    const LETTER = { k: 'K', q: 'D', r: 'T', b: 'L', n: 'S', p: '' }; // deutsche Bezeichnungen
    if (m.castle === 'k') return 'O-O';
    if (m.castle === 'q') return 'O-O-O';
    const capture = m.captured ? 'x' : '';
    const target = squareName(m.to.r, m.to.c);
    if (m.piece.type === 'p') {
      const prefix = capture ? FILES[m.from.c] : '';
      const promo = m.promotion ? '=' + LETTER[promotionType] : '';
      return prefix + capture + target + promo;
    }
    // Mehrdeutigkeit auflösen, wenn zwei gleiche Figuren dasselbe Feld erreichen können.
    const rivals = this.allLegalMoves().filter((o) =>
      o.piece.type === m.piece.type && o.to.r === m.to.r && o.to.c === m.to.c
      && (o.from.r !== m.from.r || o.from.c !== m.from.c));
    let disamb = '';
    if (rivals.length) {
      if (!rivals.some((o) => o.from.c === m.from.c)) disamb = FILES[m.from.c];
      else if (!rivals.some((o) => o.from.r === m.from.r)) disamb = String(8 - m.from.r);
      else disamb = squareName(m.from.r, m.from.c);
    }
    return LETTER[m.piece.type] + disamb + capture + target;
  }

  /**
   * Ungenügendes Material: Keine Seite kann den Gegner mattsetzen.
   * (König gegen König, König+Läufer, König+Springer, nur Läufer auf gleichfarbigen Feldern)
   */
  isInsufficientMaterial() {
    const minors = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = this.board[r][c];
        if (!p || p.type === 'k') continue;
        if (p.type === 'p' || p.type === 'r' || p.type === 'q') return false;
        minors.push({ type: p.type, squareColor: (r + c) % 2 });
      }
    }
    if (minors.length <= 1) return true;
    return minors.every((m) => m.type === 'b' && m.squareColor === minors[0].squareColor);
  }

  /**
   * Kann `color` überhaupt noch mattsetzen? Wichtig bei abgelaufener Zeit:
   * Hat der Gegner nur noch den König (oder nur eine Leichtfigur gegen einen nackten König), ist es Remis.
   */
  canStillMate(color) {
    const count = { w: [], b: [] };
    for (const row of this.board) {
      for (const p of row) if (p && p.type !== 'k') count[p.color].push(p.type);
    }
    const own = count[color], other = count[opponent(color)];
    if (own.length === 0) return false;
    if (own.length === 1 && (own[0] === 'n' || own[0] === 'b') && other.length === 0) return false;
    return true;
  }

  /** Wie oft ist die aktuelle Stellung bereits vorgekommen? */
  repetitionCount() {
    const current = this.keys[this.keys.length - 1];
    return this.keys.filter((k) => k === current).length;
  }

  /**
   * Spielstand:
   *   'checkmate'    Schachmatt
   *   'stalemate'    Patt (Remis)
   *   'insufficient' ungenügendes Material (Remis)
   *   'fifty'        50 Züge ohne Bauernzug oder Schlagen (Remis)
   *   'repetition'   dreimal dieselbe Stellung (Remis)
   *   'check'        Schach, Partie läuft
   *   'playing'      Partie läuft
   */
  status() {
    const hasMoves = this.allLegalMoves().length > 0;
    const check = this.inCheck();
    if (!hasMoves) return check ? 'checkmate' : 'stalemate';
    if (this.isInsufficientMaterial()) return 'insufficient';
    if (this.halfmove >= 100) return 'fifty';
    if (this.repetitionCount() >= 3) return 'repetition';
    return check ? 'check' : 'playing';
  }

}

// Ermöglicht automatische Tests mit Node.js; im Browser ist ChessGame einfach global verfügbar.
if (typeof module !== 'undefined') module.exports = { ChessGame, squareName };
