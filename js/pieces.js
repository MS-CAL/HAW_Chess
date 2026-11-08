'use strict';

/*
 * Eigene Figurengrafiken als SVG (Vektorgrafik, skaliert ohne Unschärfe).
 * Alle Figuren sind auf einer 100×100-Fläche gezeichnet und teilen sich Sockel und Stil:
 *   class="body"   – Hauptform, gefüllt mit einem Farbverlauf (hell bzw. dunkel, siehe style.css)
 *   class="detail" – Zierlinien (Ringe, Augen, Mähne)
 * Die Farbverläufe sind einmalig in index.html definiert.
 */

const PIECE_BASE = `
  <path class="body" d="M22 92h56a4 4 0 0 0 4-4v-1a4 4 0 0 0-4-4H22a4 4 0 0 0-4 4v1a4 4 0 0 0 4 4z"/>
  <path class="body" d="M27 84h46c0-4-2-7-6-7H33c-4 0-6 3-6 7z"/>`;

const PIECE_SHAPES = {
  // Bauer: Kugelkopf auf schlankem Hals
  p: `
    <path class="body" d="M30 77c1-11 9-17 13-25h14c4 8 12 14 13 25z"/>
    <ellipse class="body" cx="50" cy="51" rx="15" ry="4.5"/>
    <circle class="body" cx="50" cy="33" r="13"/>
    <path class="detail" d="M41 28a10 10 0 0 1 6-6"/>`,

  // Turm: Festungsturm mit Zinnen
  r: `
    <path class="body" d="M31 77l3-33h32l3 33z"/>
    <path class="body" d="M28 45h44v-6H28z"/>
    <path class="body" d="M26 39V19h10v7h7v-7h14v7h7v-7h10v20z"/>
    <path class="detail" d="M33 70h34M35 52h30"/>`,

  // Springer: Pferdekopf mit Mähne
  n: `
    <path class="body" d="M30 77c0-12 8-19 15-25-6 3-14 6-21 4-6-1-9-6-6-11 6-9 15-17 22-23l3-12 7 9c14 2 25 15 27 32 1 10-2 19-5 26z"/>
    <path class="detail" d="M53 21c11 4 17 15 17 28M57 29c7 4 9 12 9 20"/>
    <circle class="eye" cx="39" cy="30" r="2.6"/>
    <path class="detail" d="M21 46l3-2"/>`,

  // Läufer: Mitra mit Kerbe und Kugel
  b: `
    <path class="body" d="M31 77c3-11 11-16 12-27h14c1 11 9 16 12 27z"/>
    <ellipse class="body" cx="50" cy="49" rx="16" ry="4.5"/>
    <path class="body" d="M50 15c-11 7-17 18-13 30h26c4-12-2-23-13-30z"/>
    <circle class="body" cx="50" cy="12" r="4.5"/>
    <path class="detail" d="M56 23l-9 11"/>`,

  // Dame: Krone mit fünf Zacken und Kugeln
  q: `
    <path class="body" d="M29 77c3-12 11-18 13-31h16c2 13 10 19 13 31z"/>
    <ellipse class="body" cx="50" cy="45" rx="18" ry="4.5"/>
    <path class="body" d="M33 42l-9-22 11 10 2-16 8 14 5-18 5 18 8-14 2 16 11-10-9 22z"/>
    <circle class="body" cx="24" cy="19" r="3.5"/>
    <circle class="body" cx="37" cy="13" r="3.5"/>
    <circle class="body" cx="50" cy="9" r="3.5"/>
    <circle class="body" cx="63" cy="13" r="3.5"/>
    <circle class="body" cx="76" cy="19" r="3.5"/>
    <path class="detail" d="M34 70h32"/>`,

  // König: Kronenkelch mit Kreuz
  k: `
    <path class="body" d="M29 77c3-12 11-18 13-31h16c2 13 10 19 13 31z"/>
    <ellipse class="body" cx="50" cy="45" rx="18" ry="4.5"/>
    <path class="body" d="M33 42c-5-10 1-18 17-17 16-1 22 7 17 17z"/>
    <path class="body" d="M47 25v-7h-6v-6h6V5h6v7h6v6h-6v7z"/>
    <path class="detail" d="M36 35c9-3 19-3 28 0M34 70h32"/>`,
};

/** Liefert das SVG-Markup einer Figur, z. B. pieceSvg('n', 'w'). */
function pieceSvg(type, color) {
  return `<svg class="piece-svg ${color}" viewBox="0 0 100 100" aria-hidden="true">`
    + PIECE_BASE + PIECE_SHAPES[type] + '</svg>';
}
