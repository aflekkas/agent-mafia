import { GameState, Player, PlayerId, Role, TranscriptEntry } from "./types";
import { transcriptToneNote } from "./profanity";
import { analyzeSpeechStance, mentionedPlayersInText, mentionsPlayer, normalizeSpeech, shortQuote } from "./speech-analysis";

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
    return living.filter((player) => player.role !== "mafia").map((player) => player.id);
  }

  return living.filter((player) => player.id !== actorId).map((player) => player.id);
}

export function publicTranscriptSummary(state: GameState, limit = 12, options: { hideActiveVotes?: boolean } = {}): string {
  const publicEntries = state.transcript.filter((entry) => !entry.privateTo?.length && !shouldHideActiveVote(state, entry, options));
  return publicEntries
    .slice(-limit)
    .map((entry) => `${entry.speakerName}: ${entry.text}${transcriptToneNote(entry)}`)
    .join("\n");
}

export function publicConversationLedger(state: GameState, limit = 14, options: { hideActiveVotes?: boolean } = {}): string {
  const publicEntries = state.transcript.filter(
    (entry) => !entry.privateTo?.length && ["speech", "vote"].includes(entry.kind) && !shouldHideActiveVote(state, entry, options)
  );
  const lines = publicEntries.flatMap((entry) => describePublicEntry(state, entry));
  return lines.slice(-limit).join("\n");
}

function shouldHideActiveVote(state: GameState, entry: TranscriptEntry, options: { hideActiveVotes?: boolean }): boolean {
  return !!options.hideActiveVotes && state.phase === "day-vote" && entry.day === state.day && entry.kind === "vote";
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

  if (player.role === "detective") {
    const knownIdentities = state.players.filter((candidate) => candidate.detectiveKnownRole);
    if (knownIdentities.length) {
      facts.push(
        `Your private investigation results: ${knownIdentities
          .map((candidate) => `${candidate.name} is ${candidate.detectiveKnownRole}`)
          .join("; ")}. The table does not know unless you reveal it.`
      );
    } else {
      facts.push("Your private investigation results: none yet.");
    }
  }

  const privateEntries = state.transcript.filter((entry) => entry.privateTo?.includes(playerId));
  if (privateEntries.length) {
    facts.push(
      privateEntries
        .slice(-4)
        .map((entry) => `${entry.speakerName}: ${entry.text}${transcriptToneNote(entry)}`)
        .join("\n")
    );
  }

  return facts.join("\n");
}

function describePublicEntry(state: GameState, entry: TranscriptEntry): string[] {
  if (entry.kind === "vote") {
    const target = targetFromVoteText(state, entry.text);
    return target
      ? [`- ${entry.speakerName} voted for ${target.name}: "${shortQuote(entry.text)}"${transcriptToneNote(entry)}`]
      : [`- ${entry.speakerName} cast a vote: "${shortQuote(entry.text)}"${transcriptToneNote(entry)}`];
  }

  if (entry.kind !== "speech") {
    return [];
  }

  const targets = mentionedPlayersInText(state.players, entry.text, entry.speakerId as PlayerId);
  if (!targets.length) {
    return [`- ${entry.speakerName} spoke without naming a target: "${shortQuote(entry.text)}"${transcriptToneNote(entry)}`];
  }

  const stance = analyzeSpeechStance(entry.text).ledger;
  return targets.map(
    (target) => `- ${entry.speakerName} ${stance} ${target.name}: "${shortQuote(entry.text, 120)}"${transcriptToneNote(entry)}`
  );
}

function targetFromVoteText(state: GameState, text: string): Player | undefined {
  const normalized = normalizeSpeech(text);
  return state.players.find((player) => mentionsPlayer(normalized, player));
}
