export const PLAYER_IDS = [
  "don_vito",
  "salvatore",
  "rosa",
  "vincenzo",
  "carmela",
  "player_6"
] as const;

export type PlayerId = (typeof PLAYER_IDS)[number];

export type Role = "mafia" | "detective" | "doctor" | "villager" | "unknown";

export type Phase =
  | "setup"
  | "role-reveal"
  | "night"
  | "day-discussion"
  | "day-vote"
  | "resolve-vote"
  | "game-over";

export type SpeakerId = PlayerId | "narrator" | "system";

export interface Player {
  id: PlayerId;
  name: string;
  seat: number;
  role: Role;
  detectiveKnownRole?: Role;
  alive: boolean;
  isHuman: boolean;
  suspicion: number;
  trust: number;
  notes: string[];
  voiceLabel: string;
}

export interface TranscriptEntry {
  id: string;
  day: number;
  phase: Phase;
  speakerId: SpeakerId;
  speakerName: string;
  text: string;
  kind: "speech" | "narration" | "system" | "vote" | "action";
  privateTo?: PlayerId[];
  createdAt: number;
}

export interface InnerMonologue {
  id: string;
  playerId: PlayerId;
  day: number;
  phase: Phase;
  text: string;
  createdAt: number;
}

export interface VoteRecord {
  voterId: PlayerId;
  targetId: PlayerId;
}

export interface NightActions {
  mafiaTargetId?: PlayerId;
  mafiaSkippedFirstNight?: boolean;
  doctorSaveId?: PlayerId;
  detectiveTargetId?: PlayerId;
  detectiveResult?: {
    targetId: PlayerId;
    role: Role;
  };
}

export interface TurnOrder {
  discussionQueue: PlayerId[];
  voteQueue: PlayerId[];
  nightQueue: PlayerId[];
}

export interface GameState {
  id: string;
  seed: string;
  phase: Phase;
  day: number;
  nightNumber: number;
  players: Player[];
  activeSpeakerId?: SpeakerId;
  currentPrompt?: string;
  transcript: TranscriptEntry[];
  innerMonologues: InnerMonologue[];
  votes: VoteRecord[];
  nightActions: NightActions;
  turnOrder: TurnOrder;
  winner?: "town" | "mafia";
  eliminatedThisRound?: PlayerId;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NpcTurn {
  inner_monologue: string;
  speech: string;
  vote: PlayerId | null;
  role_action: PlayerId | null;
  source: "openai" | "fallback";
}

export interface AdvanceResult {
  state: GameState;
  events: TranscriptEntry[];
  needsHuman: boolean;
}
