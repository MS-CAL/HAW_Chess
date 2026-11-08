'use strict';
/*
 * Läuft in einem eigenen Thread (Web Worker), damit die Seite nicht einfriert,
 * während der Computer nachdenkt.
 */
importScripts('chess.js', 'engine.js');

self.onmessage = (e) => {
  const { id, fen, keys, level, maxTime } = e.data;
  const result = ChessEngine.findBestMove(fen, keys, level, maxTime);
  self.postMessage({ id, result });
};
