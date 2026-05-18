import { NextResponse } from "next/server";
import { submitHumanVote } from "@/lib/game/advance";
import { isPlayerId } from "@/lib/game/guards";
import { getGame, saveGame } from "@/lib/store/game-store";

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const game = getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { targetId?: unknown };
  if (!isPlayerId(body.targetId)) {
    return NextResponse.json({ error: "Invalid vote target." }, { status: 400 });
  }

  const next = submitHumanVote(game, body.targetId);
  saveGame(next);
  return NextResponse.json({ game: next });
}
