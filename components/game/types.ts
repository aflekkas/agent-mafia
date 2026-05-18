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

export type BrowserSpeechRecognitionResult = {
  readonly isFinal?: boolean;
  readonly [index: number]: { transcript?: string } | undefined;
};

export type BrowserSpeechRecognitionEvent = {
  readonly resultIndex?: number;
  readonly results: ArrayLike<BrowserSpeechRecognitionResult>;
};

export type BrowserSpeechRecognitionErrorEvent = {
  readonly error?: string;
  readonly message?: string;
};

export type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onnomatch: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type BrowserSpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

export type ApiGameResponse = {
  game?: import("@/lib/game/types").GameState;
  error?: string;
};
