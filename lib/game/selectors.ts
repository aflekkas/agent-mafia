import { GameState, Player, PlayerId, Role } from "./types";

export function getPlayer(state: GameState, playerId: PlayerId): Player {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    throw new Error(`Unknown player: ${playerId}`);
  }
  return player;
}

export function getHuman(state: GameState): Player {
  return getPlayer(state, "player_6");
}

export function alivePlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.alive);
}

export function aliveNpcPlayers(state: GameState): Player[] {
  return alivePlayers(state).filter((player) => !player.isHuman);
}

export function aliveIds(state: GameState): PlayerId[] {
  return alivePlayers(state).map((player) => player.id);
}

export function mafiaPlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.role === "mafia" && player.alive);
}

export function townPlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.role !== "mafia" && player.alive);
}

export function livingRole(state: GameState, role: Role): Player[] {
  return state.players.filter((player) => player.role === role && player.alive);
}

export function legalTargets(
  state: GameState,
  actorId: PlayerId,
  action: "vote" | "mafia-kill" | "doctor-save" | "detective-investigate"
): PlayerId[] {
  const actor = getPlayer(state, actorId);
  const living = alivePlayers(state);

  if (!actor.alive) {
    return [];
  }

  if (action === "doctor-save") {
    return living.map((player) => player.id);
  }

  if (action === "mafia-kill") {
    const possibleTargets = living.filter((player) => player.role !== "mafia");
    const demoSafeTargets =
      state.day === 1 && actorId !== "player_6" && possibleTargets.length > 1
        ? possibleTargets.filter((player) => player.id !== "player_6")
        : possibleTargets;
    return demoSafeTargets.map((player) => player.id);
  }

  return living.filter((player) => player.id !== actorId).map((player) => player.id);
}

export function publicTranscriptSummary(state: GameState, limit = 12): string {
  const publicEntries = state.transcript.filter((entry) => !entry.privateTo?.length);
  return publicEntries
    .slice(-limit)
    .map((entry) => `${entry.speakerName}: ${entry.text}`)
    .join("\n");
}

export function privateKnowledgeFor(state: GameState, playerId: PlayerId): string {
  const player = getPlayer(state, playerId);
  const facts: string[] = [`You are ${player.name}. Your secret role is ${player.role}.`];

  if (player.role === "mafia") {
    const partners = state.players
      .filter((candidate) => candidate.role === "mafia" && candidate.id !== playerId)
      .map((candidate) => candidate.name);
    facts.push(`Your Mafia partner: ${partners.join(", ") || "none"}.`);
  }

  const privateEntries = state.transcript.filter((entry) => entry.privateTo?.includes(playerId));
  if (privateEntries.length) {
    facts.push(
      privateEntries
        .slice(-4)
        .map((entry) => `${entry.speakerName}: ${entry.text}`)
        .join("\n")
    );
  }

  return facts.join("\n");
}
