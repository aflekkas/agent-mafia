import {
  GameState,
  PLAYER_IDS,
  Phase,
  Player,
  PlayerId,
  Role,
  SpeakerId,
  TranscriptEntry
} from "./types";

const PLAYER_META: Record<PlayerId, Omit<Player, "role" | "alive" | "suspicion" | "trust" | "notes">> = {
  don_vito: {
    id: "don_vito",
    name: "Don Vito",
    seat: 0,
    isHuman: false,
    voiceLabel: "DON_VITO"
  },
  salvatore: {
    id: "salvatore",
    name: "Salvatore",
    seat: 1,
    isHuman: false,
    voiceLabel: "SALVATORE"
  },
  rosa: {
    id: "rosa",
    name: "Rosa",
    seat: 2,
    isHuman: false,
    voiceLabel: "ROSA"
  },
  vincenzo: {
    id: "vincenzo",
    name: "Vincenzo",
    seat: 3,
    isHuman: false,
    voiceLabel: "VINCENZO"
  },
  carmela: {
    id: "carmela",
    name: "Carmela",
    seat: 4,
    isHuman: false,
    voiceLabel: "CARMELA"
  },
  player_6: {
    id: "player_6",
    name: "Player 6",
    seat: 5,
    isHuman: true,
    voiceLabel: "PLAYER_6"
  }
};

const ROLE_BAG: Role[] = ["mafia", "mafia", "detective", "doctor", "villager", "villager"];

export function createGame(seed = `demo-${Date.now()}`): GameState {
  const roles = assignRoles(seed);
  const players = PLAYER_IDS.map((id) => ({
    ...PLAYER_META[id],
    role: roles[id],
    alive: true,
    suspicion: id === "salvatore" ? 1 : 0,
    trust: 0,
    notes: []
  }));

  const now = Date.now();
  const state: GameState = {
    id: makeId("game"),
    seed,
    phase: "role-reveal",
    day: 1,
    players,
    activeSpeakerId: "narrator",
    currentPrompt: "role-reveal-ready",
    transcript: [],
    innerMonologues: [],
    votes: [],
    nightActions: {},
    turnOrder: {
      discussionQueue: [],
      voteQueue: [],
      nightQueue: []
    },
    createdAt: now,
    updatedAt: now
  };

  return addTranscript(
    state,
    "narrator",
    "Narrator",
    "Six souls gather at the table. One chair belongs to you.",
    "narration"
  );
}

export function createScenarioSeed(name: "scenario-a" | "scenario-b"): GameState {
  const state = createGame(name);
  if (name === "scenario-a") {
    return forceRoles(state, {
      don_vito: "mafia",
      salvatore: "villager",
      rosa: "detective",
      vincenzo: "doctor",
      carmela: "mafia",
      player_6: "villager"
    });
  }

  return forceRoles(state, {
    don_vito: "villager",
    salvatore: "doctor",
    rosa: "villager",
    vincenzo: "detective",
    carmela: "mafia",
    player_6: "mafia"
  });
}

export function assignRoles(seed: string): Record<PlayerId, Role> {
  const shuffledRoles = shuffle(ROLE_BAG, seed);
  return PLAYER_IDS.reduce(
    (roles, id, index) => ({
      ...roles,
      [id]: shuffledRoles[index]
    }),
    {} as Record<PlayerId, Role>
  );
}

export function forceRoles(state: GameState, roles: Record<PlayerId, Role>): GameState {
  return touch({
    ...state,
    players: state.players.map((player) => ({
      ...player,
      role: roles[player.id]
    }))
  });
}

export function addTranscript(
  state: GameState,
  speakerId: SpeakerId,
  speakerName: string,
  text: string,
  kind: TranscriptEntry["kind"] = "speech",
  privateTo?: PlayerId[]
): GameState {
  const entry: TranscriptEntry = {
    id: makeId("entry"),
    day: state.day,
    phase: state.phase,
    speakerId,
    speakerName,
    text,
    kind,
    privateTo,
    createdAt: Date.now()
  };

  return touch({
    ...state,
    activeSpeakerId: speakerId,
    transcript: [...state.transcript, entry]
  });
}

export function touch(state: GameState): GameState {
  return {
    ...state,
    updatedAt: Date.now()
  };
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function shuffle<T>(values: T[], seed: string): T[] {
  const result = [...values];
  const rand = seededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function phaseLabel(phase: Phase): string {
  return phase
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
