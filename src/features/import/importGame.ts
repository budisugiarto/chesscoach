import { Chess, DEFAULT_POSITION } from "chess.js";
import type { MoveInput } from "../board/chessState";

export type ImportedGame = {
  initialFen: string;
  moves: MoveInput[];
};

export function importPgn(pgn: string): ImportedGame {
  const game = new Chess();
  game.loadPgn(pgn);

  return {
    initialFen: game.header().FEN || DEFAULT_POSITION,
    moves: game.history({ verbose: true }),
  };
}

export function importFen(fen: string): ImportedGame {
  const game = new Chess(fen);
  return { initialFen: game.fen(), moves: [] };
}
