import { NextResponse } from "next/server";
import { redactGameForPlayer } from "@/lib/game/redact";
import { startGame } from "@/lib/store/game-store";

export async function POST(request: Request) {
  const body = await safeJson(request);
  const seed = typeof body.seed === "string" ? body.seed : undefined;
  const humanName = typeof body.humanName === "string" ? body.humanName : undefined;
  const game = startGame(seed, humanName);
  return NextResponse.json({ game: redactGameForPlayer(game) });
}

async function safeJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
