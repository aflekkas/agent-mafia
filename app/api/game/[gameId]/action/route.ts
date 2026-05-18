import { NextResponse } from "next/server";
import { advanceGame, submitHumanNightAction, submitHumanSpeech, submitHumanVote } from "@/lib/game/advance";
import { isPlayerId } from "@/lib/game/guards";
import { redactGameForPlayer } from "@/lib/game/redact";
import { getGame, saveGame } from "@/lib/store/game-store";

export async function POST(request: Request, context: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await context.params;
  const game = getGame(gameId);
  if (!game) {
    return NextResponse.json({ error: "Game not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    type?: unknown;
    text?: unknown;
    targetId?: unknown;
  };

  if (body.type === "advance") {
    const next = await advanceGame(game);
    saveGame(next);
    return NextResponse.json({ game: redactGameForPlayer(next) });
  }

  if (body.type === "speech") {
    const next = submitHumanSpeech(game, typeof body.text === "string" ? body.text : "");
    saveGame(next);
    return NextResponse.json({ game: redactGameForPlayer(next) });
  }

  if (body.type === "vote") {
    if (!isPlayerId(body.targetId)) {
      return NextResponse.json({ error: "Invalid vote target." }, { status: 400 });
    }
    const next = submitHumanVote(game, body.targetId);
    saveGame(next);
    return NextResponse.json({ game: redactGameForPlayer(next) });
  }

  if (body.type === "night") {
    if (!isPlayerId(body.targetId)) {
      return NextResponse.json({ error: "Invalid night target." }, { status: 400 });
    }
    const next = submitHumanNightAction(game, body.targetId);
    saveGame(next);
    return NextResponse.json({ game: redactGameForPlayer(next) });
  }

  return NextResponse.json({ error: "Unknown action type." }, { status: 400 });
}
