export type VoiceMode = "browser" | "elevenlabs";
export type DialogMode = "exit" | "rules" | null;
export type HumanAvatarId = "player-masc" | "player-femme" | "player-androgynous";

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

export type BrowserSpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

export type ApiGameResponse = {
  game?: import("@/lib/game/types").GameState;
  error?: string;
};
