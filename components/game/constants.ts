import { PlayerId } from "@/lib/game/types";
import { HumanAvatarId } from "./types";

export const AUDIO_MUTED_STORAGE_KEY = "agent-mafia.audioMuted";
export const VOICE_MODE_STORAGE_KEY = "agent-mafia.voiceMode";
export const HUMAN_NAME_STORAGE_KEY = "agent-mafia.humanName";
export const HUMAN_AVATAR_STORAGE_KEY = "agent-mafia.humanAvatar";

export const AMBIENCE_URL = "/sfx/home-crickets.mp3";
export const HOME_AMBIENCE_VOLUME = 0.24;
export const IDLE_AMBIENCE_VOLUME = 0.07;
export const NIGHT_AMBIENCE_VOLUME = 0.18;
export const UI_CLICK_VOLUME = 0.34;
export const UI_HOVER_VOLUME = 0.11;
export const UI_START_VOLUME = 0.48;
export const DECISION_CUE_VOLUME = 0.28;
export const VOTE_CUE_VOLUME = 0.2;

export const ROLE_COPY: Record<string, string> = {
  mafia: "Lie, survive, and bring the town down to parity.",
  detective: "Investigate at night. Use truth carefully.",
  doctor: "Save one soul each night. Guess well.",
  villager: "No power. Read the room and vote.",
  unknown: "Hidden until the game ends."
};

export const HUMAN_AVATARS: { id: HumanAvatarId; label: string; src: string }[] = [
  { id: "player-masc", label: "Signore", src: "/avatars/player-masc.png" },
  { id: "player-femme", label: "Signora", src: "/avatars/player-femme.png" },
  { id: "player-androgynous", label: "Stranger", src: "/avatars/player-androgynous.png" }
];

export const PLAYER_PORTRAITS: Partial<Record<PlayerId, string>> = {
  don_vito: "/portraits/don-vito.png",
  salvatore: "/portraits/salvatore.png",
  rosa: "/portraits/rosa.png",
  vincenzo: "/portraits/vincenzo.png",
  carmela: "/portraits/carmela.png"
};
