import { CharacterSetup, GameState, HumanRolePreference, PlayerId } from "@/lib/game/types";
import { readGameResponse } from "./utils";

export type GameAction =
  | { type: "advance" }
  | { type: "speech"; text: string }
  | { type: "vote"; targetId: PlayerId; text?: string }
  | { type: "night"; targetId: PlayerId };

export async function createGame(input: {
  seed?: string;
  humanName: string;
  characterSetup?: CharacterSetup;
  humanRole?: HumanRolePreference;
}): Promise<GameState> {
  const response = await fetch("/api/game", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return readGameResponse(response);
}

export async function postGameAction(gameId: string, action: GameAction): Promise<GameState> {
  const response = await fetch(`/api/game/${gameId}/action`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(action)
  });
  return readGameResponse(response);
}
