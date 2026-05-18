import { generateNpcTurn } from "@/lib/ai/generate-npc-turn";
import { GameState, NpcTurn, Player, PlayerId } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __agentMafiaVoteBatches: Map<string, Map<PlayerId, Promise<NpcTurn>>> | undefined;
}

const batches = globalThis.__agentMafiaVoteBatches ?? new Map<string, Map<PlayerId, Promise<NpcTurn>>>();
globalThis.__agentMafiaVoteBatches = batches;

export function startNpcVoteBatch(state: GameState): void {
  if (state.phase !== "day-vote") {
    return;
  }

  const key = batchKey(state);
  if (batches.has(key)) {
    return;
  }

  const npcVoters = state.turnOrder.voteQueue
    .map((id) => state.players.find((player) => player.id === id))
    .filter((player): player is Player => !!player && player.alive && !player.isHuman);

  if (!npcVoters.length) {
    return;
  }

  const ballotPromises = new Map<PlayerId, Promise<NpcTurn>>();
  for (const voter of npcVoters) {
    ballotPromises.set(voter.id, generateNpcTurn(voteSnapshotFor(state, voter.id), voter));
  }
  batches.set(key, ballotPromises);
}

export async function getPreparedNpcVote(state: GameState, voter: Player): Promise<NpcTurn> {
  startNpcVoteBatch(state);

  const prepared = batches.get(batchKey(state))?.get(voter.id);
  if (!prepared) {
    return generateNpcTurn(voteSnapshotFor(state, voter.id), voter);
  }

  try {
    return await prepared;
  } catch {
    return generateNpcTurn(voteSnapshotFor(state, voter.id), voter);
  }
}

export function clearNpcVoteBatch(state: Pick<GameState, "id" | "day">): void {
  batches.delete(batchKey(state));
}

function voteSnapshotFor(state: GameState, voterId: PlayerId): GameState {
  return {
    ...state,
    currentPrompt: undefined,
    votes: [],
    turnOrder: {
      ...state.turnOrder,
      voteQueue: [voterId, ...state.turnOrder.voteQueue.filter((id) => id !== voterId)]
    }
  };
}

function batchKey(state: Pick<GameState, "id" | "day">): string {
  return `${state.id}:${state.day}`;
}
