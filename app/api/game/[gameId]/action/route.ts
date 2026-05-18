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
    if (game.currentPrompt !== "human-speech" || game.phase !== "day-discussion") {
      return NextResponse.json({ error: "It is not your speech turn." }, { status: 409 });
    }
    const next = submitHumanSpeech(game, typeof body.text === "string" ? body.text : "");
    saveGame(next);
    return NextResponse.json({ game: redactGameForPlayer(next) });
  }

  if (body.type === "vote") {
    if (game.currentPrompt !== "human-vote" || game.phase !== "day-vote") {
      return NextResponse.json({ error: "It is not your vote turn." }, { status: 409 });
    }
    if (!isPlayerId(body.targetId)) {
      return NextResponse.json({ error: "Invalid vote target." }, { status: 400 });
    }
    const next = submitHumanVote(game, body.targetId, typeof body.text === "string" ? body.text : undefined);
    saveGame(next);
    return NextResponse.json({ game: redactGameForPlayer(next) });
  }

  if (body.type === "night") {
    if (!game.currentPrompt?.startsWith("human-night") || game.phase !== "night") {
      return NextResponse.json({ error: "It is not your night action." }, { status: 409 });
    }
    if (!isPlayerId(body.targetId)) {
      return NextResponse.json({ error: "Invalid night target." }, { status: 400 });
    }
    const next = submitHumanNightAction(game, body.targetId);
    saveGame(next);
    return NextResponse.json({ game: redactGameForPlayer(next) });
  }

  return NextResponse.json({ error: "Unknown action type." }, { status: 400 });
}
