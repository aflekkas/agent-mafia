import { GameState, Phase, PlayerId, TranscriptEntry } from "@/lib/game/types";
import { sanitizeTextDraft, sanitizeTextForTranscript } from "@/lib/game/profanity";
import {
  HOME_AMBIENCE_VOLUME,
  IDLE_AMBIENCE_VOLUME,
  NIGHT_AMBIENCE_VOLUME,
  HUMAN_AVATARS
} from "./constants";
import { ApiGameResponse, HumanAvatarId } from "./types";

export function buttonFromEventTarget(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement) || button.disabled || button.dataset.sfx === "none") {
    return null;
  }

  return button;
}

export function ambienceVolumeFor(game: GameState | null, isHome: boolean): number {
  if (isHome) {
    return HOME_AMBIENCE_VOLUME;
  }

  if (game?.phase === "night") {
    return NIGHT_AMBIENCE_VOLUME;
  }

  return IDLE_AMBIENCE_VOLUME;
}

export function ambienceLoopBounds(buffer: AudioBuffer): { start: number; end: number } {
  const channel = buffer.getChannelData(0);
  const threshold = 0.003;
  let startFrame = 0;
  let endFrame = channel.length - 1;

  while (startFrame < channel.length && Math.abs(channel[startFrame]) < threshold) {
    startFrame += 1;
  }

  while (endFrame > startFrame && Math.abs(channel[endFrame]) < threshold) {
    endFrame -= 1;
  }

  const padFrames = Math.floor(buffer.sampleRate * 0.03);
  const start = Math.max(0, startFrame + padFrames) / buffer.sampleRate;
  const end = Math.min(channel.length - 1, Math.max(startFrame + padFrames + 1, endFrame - padFrames)) / buffer.sampleRate;

  return end - start > 0.25 ? { start, end } : { start: 0, end: buffer.duration };
}

export function automaticAdvanceDelay(
  game: GameState,
  latestEntry: TranscriptEntry | null,
  latestEntryWasPlayed: boolean,
  audioMuted: boolean
): number {
  if (!audioMuted && latestEntryWasPlayed) {
    return 250;
  }

  if (game.phase === "day-vote" || latestEntry?.kind === "vote") {
    return 550;
  }

  if (latestEntry?.kind === "speech") {
    return 1200;
  }

  return 750;
}

export async function readGameResponse(response: Response): Promise<GameState> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const apiError = contentType.includes("application/json") ? await readApiError(response) : undefined;
    throw new Error(apiError ?? `Game server returned ${response.status}. Check the terminal for the API error.`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Game server returned a non-JSON response. Check the terminal for the API error.");
  }

  const data = (await response.json().catch(() => null)) as ApiGameResponse | null;
  if (!data?.game) {
    throw new Error(data?.error ?? "Game server response did not include a game.");
  }

  return data.game;
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function nameFor(game: GameState, id: PlayerId): string {
  return game.players.find((player) => player.id === id)?.name ?? id;
}

export function formatPhase(phase: Phase): string {
  return phase
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

export function normalizeHumanName(name: string): string {
  const normalized = sanitizeHumanNameDraft(name).trim();

  return normalized || "Player";
}

export function sanitizeHumanNameDraft(name: string): string {
  return sanitizeTextDraft(stripNameDirectives(name))
    .text
    .replace(/[^\p{L}\p{N}#' -]/gu, "")
    .replace(/\s+/g, " ")
    .slice(0, 24);
}

export function sanitizeHumanTextDraft(text: string): string {
  return sanitizeTextDraft(text).text;
}

export function isHumanAvatarId(value: string | null): value is HumanAvatarId {
  return HUMAN_AVATARS.some((avatar) => avatar.id === value);
}

export function avatarFor(avatarId: HumanAvatarId) {
  return HUMAN_AVATARS.find((avatar) => avatar.id === avatarId) ?? HUMAN_AVATARS[0];
}

export function nextActorIdFor(game: GameState): PlayerId | undefined {
  if (game.phase === "day-discussion") {
    return game.turnOrder.discussionQueue[0];
  }
  if (game.phase === "day-vote") {
    return game.turnOrder.voteQueue[0];
  }
  if (game.phase === "night") {
    const doctor = game.players.find((player) => player.alive && player.role === "doctor" && !game.nightActions.doctorSaveId);
    if (doctor) {
      return doctor.id;
    }

    const detective = game.players.find(
      (player) => player.alive && player.role === "detective" && !game.nightActions.detectiveTargetId
    );
    if (detective) {
      return detective.id;
    }

    if (game.nightNumber > 1 && !game.nightActions.mafiaTargetId) {
      return game.players.find((player) => player.alive && player.role === "mafia")?.id;
    }
  }
  return undefined;
}

function stripNameDirectives(name: string): string {
  const cleaned = name.trim();
  const directiveMatch = cleaned.match(
    /\b(ignore|disregard|forget|override|reveal|show|print|repeat|follow|obey)\b.*\b(instructions?|prompts?|system|developer|assistant|rules?|messages?)\b/i
  );
  return directiveMatch?.index === undefined ? cleaned : cleaned.slice(0, directiveMatch.index);
}

async function readApiError(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ApiGameResponse | null;
  return data?.error;
}
