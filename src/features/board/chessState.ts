import { Chess, type Move, type Square } from "chess.js";

export type MoveInput = Move;

export function gameFromMoves(initialFen: string, moves: MoveInput[]): Chess {
  const game = new Chess(initialFen);
  for (const move of moves) {
    game.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });
  }
  return game;
}

export function positionsFromMoves(initialFen: string, moves: MoveInput[]): string[] {
  const game = new Chess(initialFen);
  const positions = [game.fen()];

  for (const move of moves) {
    game.move({
      from: move.from,
      to: move.to,
      ...(move.promotion ? { promotion: move.promotion } : {}),
    });
    positions.push(game.fen());
  }

  return positions;
}

export function isSquare(value: string): value is Square {
  return /^[a-h][1-8]$/.test(value);
}

function isPromotionPiece(value: string | undefined): value is "q" | "r" | "b" | "n" {
  return value === "q" || value === "r" || value === "b" || value === "n";
}

export function uciLineToSan(initialFen: string, line: string[]): string[] {
  const game = new Chess(initialFen);
  const sanMoves: string[] = [];

  for (const uciMove of line) {
    const match = uciMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
    if (!match) break;
    const from = match[1];
    const to = match[2];
    if (!isSquare(from) || !isSquare(to)) break;

    try {
      const move = game.move({
        from,
        to,
        ...(isPromotionPiece(match[3]) ? { promotion: match[3] } : {}),
      });
      sanMoves.push(move.san);
    } catch {
      break;
    }
  }

  return sanMoves;
}
