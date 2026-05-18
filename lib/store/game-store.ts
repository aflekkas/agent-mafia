import { createGame, createScenarioSeed } from "@/lib/game/setup";
import { GameState } from "@/lib/game/types";

declare global {
  // eslint-disable-next-line no-var
  var __agentMafiaGames: Map<string, GameState> | undefined;
}

const games = globalThis.__agentMafiaGames ?? new Map<string, GameState>();
globalThis.__agentMafiaGames = games;

export function startGame(seed?: string, humanName?: string): GameState {
  const game =
    seed === "scenario-a" || seed === "scenario-b"
      ? createScenarioSeed(seed, { humanName })
      : createGame(seed, { humanName });
  games.set(game.id, game);
  return game;
}

export function getGame(gameId: string): GameState | undefined {
  return games.get(gameId);
}

export function saveGame(game: GameState): GameState {
  games.set(game.id, game);
  return game;
}

export function resetGames(): void {
  games.clear();
}
