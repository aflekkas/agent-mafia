import { NextResponse } from "next/server";
import { isScenarioSeed } from "@/lib/game/guards";
import { redactGameForPlayer } from "@/lib/game/redact";
import { startGame } from "@/lib/store/game-store";

export async function POST(request: Request) {
  const body = await safeJson(request);
  const seed = typeof body.seed === "string" ? body.seed : undefined;
  const game = startGame(isScenarioSeed(seed) ? seed : seed);
  return NextResponse.json({ game: redactGameForPlayer(game) });
}

async function safeJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}
