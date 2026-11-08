# HAW Schach

Ein Schachspiel als Webseite, entwickelt im Dialog mit einer KI. Es ist ein Lehrexperiment, das zeigt, wie man gemeinsam mit KI Software baut.

## Starten

`index.html` im Browser öffnen. Es wird keine Installation und kein Build-Schritt benötigt.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `index.html` | Seitenstruktur |
| `css/style.css` | Aussehen von Brett, Figuren und Seitenleiste |
| `js/chess.js` | Spielregeln (Zuggenerierung, Schach, Matt, Patt), unabhängig von der Darstellung |
| `js/main.js` | Darstellung und Bedienung (Klicks, Hervorhebungen, Bauernumwandlung) |
| `tests/perft.test.js` | Automatischer Regeltest gegen bekannte Referenzwerte |

## Stand

- Zwei Personen spielen abwechselnd am selben Gerät.
- Alle FIDE-Zugregeln sind umgesetzt, einschließlich Rochade, en passant und Bauernumwandlung.
- Schach, Schachmatt und Patt werden erkannt.
- Die Partie wird in deutscher Notation mitgeschrieben (K, D, T, L, S).

## Tests

```bash
node tests/perft.test.js
```
