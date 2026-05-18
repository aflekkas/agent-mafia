export type VoiceMode = "off" | "browser" | "elevenlabs";
export type DialogMode = "exit" | "rules" | null;
export type HumanAvatarId =
  | "player-masc"
  | "player-femme"
  | "player-androgynous"
  | "player-04"
  | "player-05"
  | "player-06"
  | "player-07"
  | "player-08"
  | "player-09";

export type ApiGameResponse = {
  game?: import("@/lib/game/types").GameState;
  error?: string;
};
