import { GameState, PlayerId, VoteRecord } from "./types";
import { aliveIds, getPlayer, legalTargets } from "./selectors";
import { addTranscript, touch } from "./setup";
import { checkWinCondition } from "./win";

export function submitVote(state: GameState, voterId: PlayerId, targetId: PlayerId): GameState {
  const legal = legalTargets(state, voterId, "vote");
  const voter = getPlayer(state, voterId);
  const safeLegal =
    state.day === 1 && !voter.isHuman && legal.length > 1 ? legal.filter((id) => id !== "player_6") : legal;
  const finalTargetId = safeLegal.includes(targetId) ? targetId : safeLegal[0] ?? targetId;

  if (!legal.includes(finalTargetId)) {
    return {
      ...touch(state),
      lastError: `${voter.name} cannot vote for ${getPlayer(state, finalTargetId).name}.`
    };
  }

  const votes = [
    ...state.votes.filter((vote) => vote.voterId !== voterId),
    {
      voterId,
      targetId: finalTargetId
    }
  ];

  const target = getPlayer(state, finalTargetId);
  return addTranscript(
    {
      ...state,
      votes,
      lastError: undefined
    },
    voterId,
    voter.name,
    voter.isHuman ? `votes for ${target.name}.` : `votes for ${target.name}. ${voteRationale(voter.name, target.name, target.suspicion)}`,
    "vote"
  );
}

function voteRationale(voterName: string, targetName: string, suspicion: number): string {
  if (suspicion >= 3) {
    return `${targetName} has drawn too many shadows. I will not ignore that.`;
  }
  if (voterName === "Vincenzo") {
    return `${targetName}. My gut says it, and my gut has kept me alive.`;
  }
  if (voterName === "Carmela") {
    return `${targetName}, because the performance is getting stale.`;
  }
  if (voterName === "Rosa") {
    return `${targetName}. The pattern is not conclusive, but it is the clearest one I see.`;
  }
  if (voterName === "Don Vito") {
    return `${targetName}. I may be wrong, but hesitation is also a choice.`;
  }
  return `${targetName} is the cleanest vote I can make right now.`;
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
