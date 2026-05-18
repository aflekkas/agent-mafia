import { PLAYER_IDS, PlayerId } from "./types";

export function isPlayerId(value: unknown): value is PlayerId {
  return typeof value === "string" && PLAYER_IDS.includes(value as PlayerId);
}

export function isScenarioSeed(value: unknown): value is "scenario-a" | "scenario-b" {
  return value === "scenario-a" || value === "scenario-b";
}
