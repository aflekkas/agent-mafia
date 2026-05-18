import { GameState, PlayerId, VoteRecord } from "./types";
import { aliveIds, getPlayer, legalTargets } from "./selectors";
import { addTranscript, touch } from "./setup";
import { checkWinCondition } from "./win";

export function submitVote(state: GameState, voterId: PlayerId, targetId: PlayerId): GameState {
  const legal = legalTargets(state, voterId, "vote");
  if (!legal.includes(targetId)) {
    return {
      ...touch(state),
      lastError: `${getPlayer(state, voterId).name} cannot vote for ${getPlayer(state, targetId).name}.`
    };
  }

  const votes = [
    ...state.votes.filter((vote) => vote.voterId !== voterId),
    {
      voterId,
      targetId
    }
  ];

  return addTranscript(
    {
      ...state,
      votes,
      lastError: undefined
    },
    voterId,
    getPlayer(state, voterId).name,
    `votes for ${getPlayer(state, targetId).name}.`,
    "vote"
  );
}

export function resolveVote(state: GameState): GameState {
  const living = aliveIds(state);
  const votes = state.votes.filter((vote) => living.includes(vote.voterId) && living.includes(vote.targetId));
  const eliminatedId = pickEliminated(state, votes);

  if (!eliminatedId) {
    return addTranscript(
      {
        ...state,
        phase: "night",
        votes: [],
        nightActions: {},
        turnOrder: {
          discussionQueue: [],
          voteQueue: [],
          nightQueue: []
        }
      },
      "narrator",
      "Narrator",
      "The vote collapses into smoke. No one falls.",
      "narration"
    );
  }

  const eliminated = getPlayer(state, eliminatedId);
  let nextState = addTranscript(
    {
      ...state,
      phase: "resolve-vote",
      players: state.players.map((player) =>
        player.id === eliminatedId
          ? {
              ...player,
              alive: false
            }
          : player
      ),
      eliminatedThisRound: eliminatedId,
      votes: [],
      currentPrompt: undefined
    },
    "narrator",
    "Narrator",
    `The town has spoken. ${eliminated.name} falls.`,
    "narration"
  );

  nextState = checkWinCondition(nextState);

  if (nextState.phase === "game-over") {
    return addTranscript(
      nextState,
      "system",
      "Game",
      nextState.winner === "town" ? "Town wins. The Mafia has been exposed." : "Mafia wins. Palermo belongs to the shadows.",
      "system"
    );
  }

  return addTranscript(
    {
      ...nextState,
      phase: "night",
      day: nextState.day + 1,
      nightActions: {},
      turnOrder: {
        discussionQueue: [],
        voteQueue: [],
        nightQueue: []
      }
    },
    "narrator",
    "Narrator",
    "Night returns to Palermo. The table goes still.",
    "narration"
  );
}

function pickEliminated(state: GameState, votes: VoteRecord[]): PlayerId | undefined {
  if (!votes.length) {
    return undefined;
  }

  const counts = new Map<PlayerId, number>();
  for (const vote of votes) {
    counts.set(vote.targetId, (counts.get(vote.targetId) ?? 0) + 1);
  }

  const maxVotes = Math.max(...counts.values());
  const tied = [...counts.entries()]
    .filter(([, count]) => count === maxVotes)
    .map(([id]) => id);

  if (tied.length === 1) {
    return tied[0];
  }

  return tied
    .map((id) => getPlayer(state, id))
    .sort((left, right) => right.suspicion - left.suspicion || left.seat - right.seat)[0]?.id;
}
