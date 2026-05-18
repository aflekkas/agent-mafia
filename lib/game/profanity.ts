import { Filter } from "bad-words";
import { analyzeSpeechStance, mentionedPlayersInText } from "./speech-analysis";
import { GameState, PlayerId, SpeakerId, TranscriptEntry } from "./types";

const filter = new Filter({ placeHolder: "#" });

const APP_BLOCKED_WORDS = [
  "bullshit",
  "bullshitting",
  "bullshitted",
  "goddamn",
  "goddammit",
  "goddamnit",
  "motherfucker",
  "motherfuckers",
  "motherfucking",
  "fucked",
  "fucker",
  "fuckers",
  "shitty",
  "assholes",
  "fag",
  "fags",
  "faggot",
  "faggots",
  "fagot",
  "fagots",
  "dyke",
  "dykes",
  "tranny",
  "trannies",
  "nigga",
  "niggas",
  "nigger",
  "niggers",
  "chink",
  "chinks",
  "spic",
  "spics",
  "kike",
  "kikes",
  "retard",
  "retards"
];
const APP_BLOCKED_WORD_SET = new Set(APP_BLOCKED_WORDS);

filter.addWords(...APP_BLOCKED_WORDS);

export interface SanitizedText {
  text: string;
  profanityCount: number;
}

export function sanitizeTextForTranscript(input: string): SanitizedText {
  const compact = input.replace(/\s+/g, " ").trim();
  if (!compact) {
    return {
      text: "",
      profanityCount: 0
    };
  }

  const cleaned = censorProfaneWords(compact);

  return {
    text: cleaned,
    profanityCount: countCensoredWords(cleaned)
  };
}

export function sanitizeTextDraft(input: string): SanitizedText {
  const cleaned = censorProfaneWords(input);

  return {
    text: cleaned,
    profanityCount: countCensoredWords(cleaned)
  };
}

export function sanitizeHumanName(input: string): string {
  return sanitizeTextForTranscript(input).text;
}

export function moderationForTranscript(
  state: GameState,
  speakerId: SpeakerId,
  kind: TranscriptEntry["kind"],
  text: string,
  profanityCount: number
): TranscriptEntry["moderation"] {
  if (!profanityCount) {
    return undefined;
  }

  const context = profanityContextFor(state, speakerId, kind, text);

  return {
    profanityCount,
    profanityContext: `used profanity ${context}`
  };
}

export function transcriptToneNote(entry: TranscriptEntry): string {
  if (!entry.moderation) {
    return "";
  }

  const count = entry.moderation.profanityCount;
  const label = count === 1 ? "one profane word" : `${count} profane words`;
  return ` [tone: ${entry.moderation.profanityContext}; ${label}]`;
}

function profanityContextFor(
  state: GameState,
  speakerId: SpeakerId,
  kind: TranscriptEntry["kind"],
  text: string
): string {
  if (kind === "vote") {
    return "while justifying a vote";
  }

  if (!isPlayerIdForContext(speakerId)) {
    return "while narrating the table";
  }

  const targets = mentionedPlayersInText(state.players, text, speakerId).map((player) => player.name);
  if (!targets.length) {
    return "while speaking with visible emotion";
  }

  const stance = analyzeSpeechStance(text).ledger;
  return `while ${stance} ${targets.join(" and ")}`;
}

function countCensoredWords(text: string): number {
  return text.match(/[\p{L}\p{N}]?#{1,}[\p{L}\p{N}]?/gu)?.length ?? 0;
}

function censorProfaneWords(text: string): string {
  return text.replace(/[\p{L}\p{N}_@$!+*-]+/gu, (word) => (isProfaneWord(word) ? softCensorWord(word) : word));
}

function isProfaneWord(word: string): boolean {
  if (word.includes("#")) {
    return false;
  }

  const normalized = word.toLowerCase().replace(/[!+*$@]/g, (character) => substitutions[character] ?? character);
  return APP_BLOCKED_WORD_SET.has(normalized) || filter.isProfane(word);
}

function softCensorWord(word: string): string {
  const characters = [...word];
  if (characters.length <= 2) {
    return "#".repeat(characters.length);
  }

  return `${characters[0]}${"#".repeat(characters.length - 2)}${characters[characters.length - 1]}`;
}

function isPlayerIdForContext(speakerId: SpeakerId): speakerId is PlayerId {
  return speakerId !== "narrator" && speakerId !== "system";
}

const substitutions: Record<string, string> = {
  "!": "i",
  "+": "t",
  "*": "",
  $: "s",
  "@": "a"
};
