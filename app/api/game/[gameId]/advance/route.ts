import { NextResponse } from "next/server";
import { advanceGame } from "@/lib/game/advance";
import { redactGameForPlayer } from "@/lib/game/redact";
import { getGame, saveGame } from "@/lib/store/game-store";

export async function POST(_request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const game = getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const next = await advanceGame(game);
  saveGame(next);
  return NextResponse.json({ game: redactGameForPlayer(next) });
}
