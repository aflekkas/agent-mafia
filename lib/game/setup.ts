import {
  CharacterSetup,
  GameState,
  HumanRolePreference,
  NPC_PLAYER_IDS,
  ActionLogEntry,
  PLAYER_IDS,
  Phase,
  Player,
  PlayerId,
  Role,
  SpeakerId,
  TranscriptEntry
} from "./types";
import { characterProfileForSeat, normalizeCharacterSetup } from "@/lib/characters/profiles";
import { moderationForTranscript, sanitizeTextForTranscript } from "./profanity";
import { shuffle } from "./random";
import { buildDiscussionQueueFromPlayers } from "./turn-order";

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

export interface CreateGameOptions {
  humanName?: string;
  characterSetup?: CharacterSetup;
  humanRole?: HumanRolePreference;
}

export function createGame(seed = `demo-${Date.now()}`, options: CreateGameOptions = {}): GameState {
  const humanName = normalizeHumanName(options.humanName);
  const characterSetup = normalizeCharacterSetup(options.characterSetup);
  const roles = assignRoles(seed, options.humanRole);
  const detectiveKnownMafiaId = pickDetectiveKnownMafia(roles, seed);
  const players = PLAYER_IDS.map((id) => {
    const profile = id === "player_6" ? undefined : characterProfileForSeat(id, characterSetup);

    return {
      ...PLAYER_META[id],
      name: id === "player_6" ? humanName : (profile?.name ?? PLAYER_META[id].name),
      role: roles[id],
      detectiveKnownRole: id === detectiveKnownMafiaId ? ("mafia" as Role) : undefined,
      alive: true,
      suspicion: 0,
      trust: 0,
      notes: [],
      characterId: profile?.id,
      portraitSrc: profile?.portraitSrc,
      personalityStyle: profile?.style,
      fallbackLines: profile?.fallbackLines,
      voiceId: profile?.voiceId,
      browserVoice: profile?.browserVoice
    };
  });

  const now = Date.now();
  const state: GameState = {
    id: makeId("game"),
    seed,
    phase: "day-discussion",
    day: 1,
    nightNumber: 0,
    players,
    activeSpeakerId: "narrator",
    currentPrompt: undefined,
    transcript: [],
    innerMonologues: [],
    actionLog: [],
    votes: [],
    nightActions: {},
    turnOrder: {
      discussionQueue: buildDiscussionQueueFromPlayers(players, seed, 1),
      voteQueue: [],
      nightQueue: []
    },
    createdAt: now,
    updatedAt: now
  };

  return addOpeningPrivateKnowledge(
    addTranscript(
      state,
      "narrator",
      "Narrator",
      "Six souls gather at the table. One chair belongs to you.",
      "narration"
    ),
    detectiveKnownMafiaId
  );
}

export function createScenarioSeed(name: "scenario-a" | "scenario-b", options: CreateGameOptions = {}): GameState {
  const state = createGame(name, options);
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

function normalizeHumanName(name: string | undefined): string {
  const normalized = sanitizeTextForTranscript(stripNameDirectives(name ?? ""))
    .text
    ?.replace(/[^\p{L}\p{N}#' -]/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
  return normalized || "Player 6";
}

function stripNameDirectives(name: string): string {
  const cleaned = name.trim();
  const directiveMatch = cleaned.match(
    /\b(ignore|disregard|forget|override|reveal|show|print|repeat|follow|obey)\b.*\b(instructions?|prompts?|system|developer|assistant|rules?|messages?)\b/i
  );
  return directiveMatch?.index === undefined ? cleaned : cleaned.slice(0, directiveMatch.index);
}

export function assignRoles(seed: string, humanRole: HumanRolePreference = "random"): Record<PlayerId, Role> {
  if (humanRole === "random") {
    const shuffledRoles = shuffle(ROLE_BAG, seed);
    return PLAYER_IDS.reduce(
      (roles, id, index) => ({
        ...roles,
        [id]: shuffledRoles[index]
      }),
      {} as Record<PlayerId, Role>
    );
  }

  const remainingRoles = removeOneRole(ROLE_BAG, humanRole);
  const shuffledNpcRoles = shuffle(remainingRoles, `${seed}:npc-roles:${humanRole}`);
  return NPC_PLAYER_IDS.reduce(
    (roles, id, index) => ({
      ...roles,
      [id]: shuffledNpcRoles[index]
    }),
    { player_6: humanRole } as Record<PlayerId, Role>
  );
}

function removeOneRole(roles: Role[], roleToRemove: Role): Role[] {
  const nextRoles = [...roles];
  const index = nextRoles.indexOf(roleToRemove);
  if (index >= 0) {
    nextRoles.splice(index, 1);
  }
  return nextRoles;
}

export function forceRoles(state: GameState, roles: Record<PlayerId, Role>): GameState {
  const detectiveKnownMafiaId = pickDetectiveKnownMafia(roles, state.seed);
  const nextPlayers = state.players.map((player) => ({
    ...player,
    role: roles[player.id],
    detectiveKnownRole: player.id === detectiveKnownMafiaId ? ("mafia" as Role) : undefined
  }));

  const nextState = touch({
    ...state,
    players: nextPlayers,
    turnOrder: {
      ...state.turnOrder,
      discussionQueue: buildDiscussionQueueFromPlayers(nextPlayers, state.seed, state.day)
    },
    transcript: state.transcript
      .filter((entry) => !isOpeningPrivateKnowledge(entry))
      .map((entry, index) =>
        index === 0 && entry.speakerId === "narrator"
          ? {
              ...entry,
              text: "Six souls gather at the table. One chair belongs to you."
            }
          : entry
      )
  });

  return addOpeningPrivateKnowledge(nextState, detectiveKnownMafiaId);
}

export function addTranscript(
  state: GameState,
  speakerId: SpeakerId,
  speakerName: string,
  text: string,
  kind: TranscriptEntry["kind"] = "speech",
  privateTo?: PlayerId[]
): GameState {
  const sanitized = sanitizeTextForTranscript(text);
  const entry: TranscriptEntry = {
    id: makeId("entry"),
    day: state.day,
    phase: state.phase,
    speakerId,
    speakerName,
    text: sanitized.text,
    kind,
    moderation: moderationForTranscript(state, speakerId, kind, text, sanitized.profanityCount),
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

export function addActionLog(
  state: GameState,
  entry: Omit<ActionLogEntry, "id" | "day" | "phase" | "createdAt">
): GameState {
  return touch({
    ...state,
    actionLog: [
      ...(state.actionLog ?? []),
      {
        id: makeId("action"),
        day: state.day,
        phase: state.phase,
        createdAt: Date.now(),
        ...entry
      }
    ]
  });
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function pickDetectiveKnownMafia(roles: Record<PlayerId, Role>, seed: string): PlayerId {
  const mafiaIds = PLAYER_IDS.filter((id) => roles[id] === "mafia");
  return shuffle(mafiaIds, `${seed}:detective-known-mafia`)[0] ?? mafiaIds[0] ?? "don_vito";
}

function addOpeningPrivateKnowledge(state: GameState, detectiveKnownMafiaId: PlayerId): GameState {
  return addMafiaOpeningPartners(addDetectiveOpeningLead(state, detectiveKnownMafiaId));
}

function addDetectiveOpeningLead(state: GameState, mafiaId: PlayerId): GameState {
  const detective = state.players.find((player) => player.role === "detective");
  if (!detective) {
    return state;
  }

  return addTranscript(
    state,
    "system",
    "Private note",
    `${playerName(state.players, mafiaId)} is Mafia. This is Detective-only knowledge; the table does not know.`,
    "action",
    [detective.id]
  );
}

function addMafiaOpeningPartners(state: GameState): GameState {
  const mafiaPlayers = state.players.filter((player) => player.role === "mafia");
  return mafiaPlayers.reduce((nextState, mafia) => {
    const partners = mafiaPlayers.filter((partner) => partner.id !== mafia.id).map((partner) => partner.name);
    return addTranscript(
      nextState,
      "system",
      "Private note",
      `Your Mafia partner is ${partners.join(", ") || "no one"}. Defend them subtly, redirect heat when useful, and coordinate through public behavior without exposing the partnership.`,
      "action",
      [mafia.id]
    );
  }, state);
}

function isOpeningPrivateKnowledge(entry: TranscriptEntry): boolean {
  return (
    entry.privateTo?.length === 1 &&
    entry.speakerId === "system" &&
    (entry.text.includes("Detective-only knowledge") || entry.text.includes("Your Mafia partner is"))
  );
}

function playerName(players: Player[], playerId: PlayerId): string {
  return players.find((player) => player.id === playerId)?.name ?? "One player";
}

export function phaseLabel(phase: Phase): string {
  return phase
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
