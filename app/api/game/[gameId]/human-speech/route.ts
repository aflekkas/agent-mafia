import { NextResponse } from "next/server";
import { submitHumanSpeech } from "@/lib/game/advance";
import { getGame, saveGame } from "@/lib/store/game-store";

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const game = getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { text?: string };
  const next = submitHumanSpeech(game, body.text ?? "");
  saveGame(next);
  return NextResponse.json({ game: next });
}
