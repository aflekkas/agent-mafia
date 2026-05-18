import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createGame, createScenarioSeed } from "@/lib/game/setup";
import { GameState } from "@/lib/game/types";

declare global {
  // eslint-disable-next-line no-var
  var __agentMafiaGames: Map<string, GameState> | undefined;
}

const games = globalThis.__agentMafiaGames ?? new Map<string, GameState>();
globalThis.__agentMafiaGames = games;

const GAME_LOG_DIR = ".agent-mafia-logs";

export function startGame(seed?: string, humanName?: string): GameState {
  const game =
    seed === "scenario-a" || seed === "scenario-b"
      ? createScenarioSeed(seed, { humanName })
      : createGame(seed, { humanName });
  games.set(game.id, game);
  persistGameLog(game, "start");
  return game;
}

export function getGame(gameId: string): GameState | undefined {
  return games.get(gameId);
}

export function saveGame(game: GameState): GameState {
  games.set(game.id, game);
  persistGameLog(game, "save");
  return game;
}

export function resetGames(): void {
  games.clear();
}

function persistGameLog(game: GameState, reason: "start" | "save"): void {
  try {
    const logDir = join(process.cwd(), GAME_LOG_DIR);
    mkdirSync(logDir, { recursive: true });

    const payload = {
      loggedAt: new Date().toISOString(),
      reason,
      gameId: game.id,
      seed: game.seed,
      phase: game.phase,
      day: game.day,
      winner: game.winner,
      players: game.players.map((player) => ({
        id: player.id,
        name: player.name,
        role: player.role,
        detectiveKnownRole: player.detectiveKnownRole,
        alive: player.alive,
        suspicion: player.suspicion,
        trust: player.trust,
        notes: player.notes
      })),
      publicTranscript: game.transcript
        .filter((entry) => !entry.privateTo?.length)
        .map((entry) => ({
          day: entry.day,
          phase: entry.phase,
          speakerId: entry.speakerId,
          speakerName: entry.speakerName,
          kind: entry.kind,
          text: entry.text,
          createdAt: entry.createdAt
        })),
      fullTranscript: game.transcript,
      innerMonologues: game.innerMonologues,
      fullState: game
    };

    const json = `${JSON.stringify(payload, null, 2)}\n`;
    writeFileSync(join(logDir, `${game.id}.json`), json);
    writeFileSync(join(logDir, "latest.json"), json);
  } catch (error) {
    console.warn("Could not write Agent Mafia game log.", error);
  }
}
