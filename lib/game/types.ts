export const NPC_PLAYER_IDS = [
  "don_vito",
  "salvatore",
  "rosa",
  "vincenzo",
  "carmela"
] as const;

export const PLAYER_IDS = [
  ...NPC_PLAYER_IDS,
  "player_6"
] as const;

export type PlayerId = (typeof PLAYER_IDS)[number];
export type NpcPlayerId = (typeof NPC_PLAYER_IDS)[number];

export type Role = "mafia" | "detective" | "doctor" | "villager" | "unknown";
export type PlayableRole = Exclude<Role, "unknown">;
export type HumanRolePreference = PlayableRole | "random";

export type Phase =
  | "setup"
  | "role-reveal"
  | "night"
  | "day-discussion"
  | "day-vote"
  | "resolve-vote"
  | "game-over";

export type SpeakerId = PlayerId | "narrator" | "system";

export interface BrowserVoiceProfile {
  gender: "masculine" | "feminine";
  names: string[];
  rate?: number;
  pitch?: number;
}

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
  characterId?: string;
  characterSummary?: string;
  portraitSrc?: string;
  spriteSheetSrc?: string;
  personalityStyle?: string;
  fallbackLines?: string[];
  voiceId?: string;
  browserVoice?: BrowserVoiceProfile;
}

export interface TranscriptEntry {
  id: string;
  day: number;
  phase: Phase;
  speakerId: SpeakerId;
  speakerName: string;
  text: string;
  kind: "speech" | "narration" | "system" | "vote" | "action";
  moderation?: {
    profanityCount: number;
    profanityContext: string;
  };
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
  rationaleText?: string;
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

export interface ActionLogEntry {
  id: string;
  day: number;
  phase: Phase;
  actorId: PlayerId;
  actorName: string;
  action: "mafia-kill" | "doctor-save" | "detective-investigate" | "vote";
  targetId: PlayerId;
  targetName: string;
  outcome: "submitted" | "rejected" | "resolved" | "blocked" | "skipped";
  detail: string;
  createdAt: number;
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
  actionLog: ActionLogEntry[];
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

export type CharacterSetup = Partial<Record<NpcPlayerId, string>>;
