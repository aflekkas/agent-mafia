import { HumanAvatarId } from "./types";

export const AUDIO_MUTED_STORAGE_KEY = "agent-mafia.audioMuted";
export const VOICE_MODE_STORAGE_KEY = "agent-mafia.voiceMode";
export const HUMAN_NAME_STORAGE_KEY = "agent-mafia.humanName";
export const HUMAN_AVATAR_STORAGE_KEY = "agent-mafia.humanAvatar";
export const CHARACTER_SETUP_STORAGE_KEY = "agent-mafia.characterSetup";
export const HUMAN_ROLE_STORAGE_KEY = "agent-mafia.humanRole";

export const AMBIENCE_URL = "/sfx/home-crickets.mp3";
export const HOME_AMBIENCE_VOLUME = 0.24;
export const IDLE_AMBIENCE_VOLUME = 0.07;
export const NIGHT_AMBIENCE_VOLUME = 0.18;
export const UI_CLICK_VOLUME = 0.34;
export const UI_HOVER_VOLUME = 0.11;
export const UI_START_VOLUME = 0.48;
export const DECISION_CUE_VOLUME = 0.28;
export const VOTE_CUE_VOLUME = 0.2;
export const SHIELD_CUE_VOLUME = 0.26;

export const ROLE_COPY: Record<string, string> = {
  mafia: "Lie, survive, and bring the town down to parity.",
  detective: "Investigate at night. Use truth carefully.",
  doctor: "Save one soul each night. Guess well.",
  villager: "No power. Read the room and vote.",
  unknown: "Hidden until the game ends."
};

export const HUMAN_AVATARS: { id: HumanAvatarId; label: string; src: string }[] = [
  { id: "player-masc", label: "Portrait 1", src: "/avatars/player-masc.png" },
  { id: "player-femme", label: "Portrait 2", src: "/avatars/player-femme.png" },
  { id: "player-androgynous", label: "Portrait 3", src: "/avatars/player-androgynous.png" },
  { id: "player-04", label: "Portrait 4", src: "/avatars/player-04.png" },
  { id: "player-05", label: "Portrait 5", src: "/avatars/player-05.png" },
  { id: "player-06", label: "Portrait 6", src: "/avatars/player-06.png" },
  { id: "player-07", label: "Portrait 7", src: "/avatars/player-07.png" },
  { id: "player-08", label: "Portrait 8", src: "/avatars/player-08.png" },
  { id: "player-09", label: "Portrait 9", src: "/avatars/player-09.png" }
];
