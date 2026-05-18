import { GameState, PlayerId, VoteRecord } from "./types";
import { aliveIds, getPlayer, legalTargets } from "./selectors";
import { addActionLog, addTranscript, touch } from "./setup";
import { checkWinCondition } from "./win";

export function submitVote(state: GameState, voterId: PlayerId, targetId: PlayerId, rationaleText?: string): GameState {
  const legal = legalTargets(state, voterId, "vote");
  const voter = getPlayer(state, voterId);
  const declaredTargetId = explicitVoteTargetFromText(state, rationaleText, legal, voterId);
  const finalTargetId = declaredTargetId ?? (legal.includes(targetId) ? targetId : legal[0] ?? targetId);

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
      targetId: finalTargetId,
      rationaleText: rationaleText?.replace(/\s+/g, " ").trim() || undefined
    }
  ];

  const target = getPlayer(state, finalTargetId);
  const text = voter.isHuman
    ? formatHumanVoteText(target.name, rationaleText, voter.name) ?? fallbackVoteText(voter.name, target.name, target.suspicion)
    : formatNpcVoteText(target.name, rationaleText, voter.name) ?? fallbackVoteText(voter.name, target.name, target.suspicion);

  return addTranscript(
    addActionLog(
      {
        ...state,
        votes,
        lastError: undefined
      },
      {
        actorId: voterId,
        actorName: voter.name,
        action: "vote",
        targetId: finalTargetId,
        targetName: target.name,
        outcome: "submitted",
        detail: text
      }
    ),
    voterId,
    voter.name,
    text,
    "vote"
  );
}

function formatHumanVoteText(targetName: string, rationaleText: string | undefined, voterName: string): string | undefined {
  const trimmed = rationaleText?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return undefined;
  }

  return formatNpcVoteText(targetName, trimmed, voterName);
}

function formatNpcVoteText(targetName: string, rationaleText: string | undefined, voterName: string): string | undefined {
  const trimmed = rationaleText?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return undefined;
  }

  const target = escapeRegExp(targetName);
  const thirdPersonVote = new RegExp(`^votes?\\s+(?:for\\s+)?${target}\\b`, "i");
  if (thirdPersonVote.test(trimmed)) {
    return cleanVoteSpeech(trimmed.replace(thirdPersonVote, voteLead(voterName, targetName)), targetName);
  }

  const firstPersonVote = new RegExp(`^i\\s+vote\\s+(?:for\\s+)?${target}\\b`, "i");
  if (firstPersonVote.test(trimmed)) {
    return cleanVoteSpeech(trimmed.replace(firstPersonVote, voteLead(voterName, targetName)), targetName);
  }

  const firstPersonVoting = new RegExp(`^i(?:['’]m|\\s+am)\\s+voting\\s+(?:for\\s+)?${target}\\b`, "i");
  if (firstPersonVoting.test(trimmed)) {
    return cleanVoteSpeech(trimmed.replace(firstPersonVoting, voteLead(voterName, targetName)), targetName);
  }

  const myVoteIs = new RegExp(`^my\\s+vote(?:\\s+is|['’]s)\\s+(?:for\\s+)?${target}\\b`, "i");
  if (myVoteIs.test(trimmed)) {
    return cleanVoteSpeech(trimmed.replace(myVoteIs, voteLead(voterName, targetName)), targetName);
  }

  const imOnTarget = new RegExp(`^i(?:['’]m|\\s+am)\\s+on\\s+${target}\\b`, "i");
  if (imOnTarget.test(trimmed)) {
    return cleanVoteSpeech(trimmed.replace(imOnTarget, voteLead(voterName, targetName)), targetName);
  }

  const votingTarget = new RegExp(`^voting\\s+(?:for\\s+)?${target}\\b`, "i");
  if (votingTarget.test(trimmed)) {
    return cleanVoteSpeech(trimmed.replace(votingTarget, voteLead(voterName, targetName)), targetName);
  }

  const targetGetsVote = new RegExp(`^${target}\\s+(?:gets|has)\\s+(?:my|the)\\s+vote\\b`, "i");
  if (targetGetsVote.test(trimmed)) {
    return cleanVoteSpeech(trimmed.replace(targetGetsVote, voteLead(voterName, targetName)), targetName);
  }

  const rationale = stripLeadingTargetSentence(stripEmbeddedVoteDeclarations(stateAgnosticVoteText(trimmed), targetName), targetName);
  return joinVoteSpeech(voteLead(voterName, targetName), rationale || voteRationale("", targetName, 0));
}

function explicitVoteTargetFromText(
  state: GameState,
  text: string | undefined,
  legalTargetsForVoter: PlayerId[],
  voterId: PlayerId
): PlayerId | null {
  const trimmed = text?.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return null;
  }

  const legalPlayers = legalTargetsForVoter.map((id) => getPlayer(state, id));
  const declarations = legalPlayers.flatMap((player) => explicitVoteDeclarationsForPlayer(trimmed, player.name).map((index) => ({ index, id: player.id })));
  const first = declarations.sort((left, right) => left.index - right.index)[0];
  if (first?.id && first.id !== voterId) {
    return first.id;
  }

  return null;
}

function explicitVoteDeclarationsForPlayer(text: string, targetName: string): number[] {
  const target = escapeRegExp(targetName);
  return [
    ...matchIndexes(text, new RegExp(`\\bi\\s+vote\\s+(?:for\\s+)?${target}\\b`, "gi")),
    ...matchIndexes(text, new RegExp(`\\bi(?:['’]m|\\s+am)\\s+voting\\s+(?:for\\s+)?${target}\\b`, "gi")),
    ...matchIndexes(text, new RegExp(`\\bmy\\s+vote(?:\\s+is|['’]s)\\s+(?:for\\s+)?${target}\\b`, "gi")),
    ...matchIndexes(text, new RegExp(`\\bi(?:['’]m|\\s+am)\\s+on\\s+${target}\\b`, "gi")),
    ...matchIndexes(text, new RegExp(`\\bvoting\\s+(?:for\\s+)?${target}\\b`, "gi")),
    ...matchIndexes(text, new RegExp(`\\b${target}\\s+(?:gets|has)\\s+(?:my|the)\\s+vote\\b`, "gi"))
  ];
}

function matchIndexes(text: string, regex: RegExp): number[] {
  return [...text.matchAll(regex)].map((match) => match.index ?? 0);
}

function fallbackVoteText(voterName: string, targetName: string, suspicion: number): string {
  return joinVoteSpeech(voteLead(voterName, targetName), voteRationale(voterName, targetName, suspicion));
}

function voteLead(voterName: string, targetName: string): string {
  if (voterName === "Vincenzo") {
    return `${targetName}. That's where I'm landing.`;
  }
  if (voterName === "Carmela") {
    return `${targetName}. Cute story, ugly pattern.`;
  }
  if (voterName === "Rosa") {
    return `${targetName}. The pattern points there.`;
  }
  if (voterName === "Don Vito") {
    return `${targetName}. I may be wrong, but that is where I land.`;
  }
  if (voterName === "Salvatore") {
    return `${targetName}. That is the cleanest read on the table.`;
  }
  return `${targetName}. That is my call.`;
}

function voteRationale(voterName: string, targetName: string, suspicion: number): string {
  if (suspicion >= 3) {
    return `Too many shadows have gathered around that seat. I will not ignore that.`;
  }
  if (voterName === "Vincenzo") {
    return `My gut says it, and my gut has kept me alive.`;
  }
  if (voterName === "Carmela") {
    return `The performance is getting stale.`;
  }
  if (voterName === "Rosa") {
    return `The pattern is not conclusive, but it is the clearest one I see.`;
  }
  if (voterName === "Don Vito") {
    return `I may be wrong, but hesitation is also a choice.`;
  }
  return `That is the cleanest read I can make right now.`;
}

function joinVoteSpeech(lead: string, rationale: string): string {
  const cleanLead = lead.replace(/\s+/g, " ").trim();
  const cleanRationale = rationale.replace(/\s+/g, " ").trim();
  if (!cleanRationale) {
    return cleanLead;
  }
  return `${/[.!?]$/.test(cleanLead) ? cleanLead : `${cleanLead}.`} ${cleanRationale}`;
}

function cleanVoteSpeech(text: string, targetName: string): string {
  return stripEmbeddedVoteDeclarations(text, targetName)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripEmbeddedVoteDeclarations(text: string, targetName: string): string {
  const target = escapeRegExp(targetName);
  return text
    .replace(new RegExp(`\\b(?:so\\s+)?i\\s+vote\\s+(?:for\\s+)?${target}\\b\\s*(?:,?\\s*and\\s*)?`, "gi"), "")
    .replace(new RegExp(`\\b(?:so\\s+)?i(?:['’]m|\\s+am)\\s+voting\\s+(?:for\\s+)?${target}\\b\\s*(?:,?\\s*and\\s*)?`, "gi"), "")
    .replace(new RegExp(`\\b(?:so\\s+)?i(?:['’]m|\\s+am)\\s+on\\s+${target}\\b\\s*(?:,?\\s*and\\s*)?`, "gi"), "")
    .replace(new RegExp(`\\bmy\\s+vote(?:\\s+is|['’]s)\\s+(?:for\\s+)?${target}\\b\\s*(?:,?\\s*and\\s*)?`, "gi"), "")
    .replace(new RegExp(`\\bvoting\\s+(?:for\\s+)?${target}\\b\\s*(?:,?\\s*and\\s*)?`, "gi"), "")
    .replace(new RegExp(`\\b${target}\\s+(?:gets|has)\\s+(?:my|the)\\s+vote\\b\\s*(?:,?\\s*and\\s*)?`, "gi"), "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .replace(/\bso\s+(?=[,.!?]|$)/gi, "")
    .trim();
}

function stripLeadingTargetSentence(text: string, targetName: string): string {
  const target = escapeRegExp(targetName);
  return text
    .replace(new RegExp(`^${target}\\s*[.:,;-]+\\s*`, "i"), "")
    .trim();
}

function stateAgnosticVoteText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
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
        day: state.day + 1,
        nightNumber: state.nightNumber + 1,
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
      nightNumber: nextState.nightNumber + 1,
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
