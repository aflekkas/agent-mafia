import { NextResponse } from "next/server";
import { sanitizeHumanName } from "@/lib/game/profanity";
import { redactGameForPlayer } from "@/lib/game/redact";
import { startGame } from "@/lib/store/game-store";
import { CharacterSetup, HumanRolePreference, NPC_PLAYER_IDS } from "@/lib/game/types";

export async function POST(request: Request) {
  const body = await safeJson(request);
  const seed = typeof body.seed === "string" ? body.seed : undefined;
  const humanName = typeof body.humanName === "string" ? sanitizeHumanName(body.humanName) : undefined;
  const characterSetup = parseCharacterSetup(body.characterSetup);
  const humanRole = parseHumanRole(body.humanRole);
  const game = startGame(seed, humanName, characterSetup, humanRole);
  return NextResponse.json({ game: redactGameForPlayer(game) });
}

function parseHumanRole(value: unknown): HumanRolePreference | undefined {
  if (value === "random" || value === "mafia" || value === "detective" || value === "doctor" || value === "villager") {
    return value;
  }

  return undefined;
}

async function safeJson(request: Request): Promise<Record<string, unknown>> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseCharacterSetup(value: unknown): CharacterSetup | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  return NPC_PLAYER_IDS.reduce((setup, seatId) => {
    const characterId = source[seatId];
    if (typeof characterId === "string") {
      setup[seatId] = characterId;
    }
    return setup;
  }, {} as CharacterSetup);
}
