import { addTranscript, makeId, touch } from "./setup";
import { resolveNight, submitNightAction } from "./night";
import { alivePlayers, getHuman, getPlayer, livingRole } from "./selectors";
import { submitVote, resolveVote } from "./votes";
import { GameState, InnerMonologue, NpcTurn, Player, PlayerId } from "./types";

const MEMORY_NOTE_LIMIT = 8;

export async function advanceGame(input: GameState): Promise<GameState> {
  const state = {
    ...input,
    lastError: undefined
  };

  if (state.phase === "game-over") {
    return state;
  }

  if (state.currentPrompt) {
    return state;
  }

  if (state.phase === "role-reveal" || state.phase === "setup") {
    return enterNight(state);
  }

  if (state.phase === "night") {
    return advanceNight(state);
  }

  if (state.phase === "day-discussion") {
    return advanceDiscussion(state);
  }

  if (state.phase === "day-vote") {
    return advanceVote(state);
  }

  if (state.phase === "resolve-vote") {
    return resolveVote(state);
  }

  return state;
}

export function submitHumanSpeech(state: GameState, text: string): GameState {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      ...touch(state),
      lastError: "Say something before submitting."
    };
  }

  const queue = state.turnOrder.discussionQueue;
  const nextQueue = queue[0] === "player_6" ? queue.slice(1) : queue;
  const human = state.players.find((player) => player.id === "player_6");

  return applyHumanSpeechSuspicion(
    addTranscript(
      {
        ...state,
        currentPrompt: undefined,
        turnOrder: {
          ...state.turnOrder,
          discussionQueue: nextQueue
        },
        lastError: undefined
      },
      "player_6",
      human?.name ?? "Player 6",
      trimmed,
      "speech"
    ),
    trimmed
  );
}

function enterNight(state: GameState): GameState {
  return addTranscript(
    {
      ...state,
      phase: "night",
      currentPrompt: undefined,
      votes: [],
      nightActions: {},
      turnOrder: {
        discussionQueue: [],
        voteQueue: [],
        nightQueue: []
      }
    },
    "narrator",
    "Narrator",
    "Night falls on Palermo. The town sleeps, but not every hand is idle.",
    "narration"
  );
}

async function advanceNight(state: GameState): Promise<GameState> {
  const human = getHuman(state);

  if (human.alive && human.role === "doctor" && !state.nightActions.doctorSaveId) {
    return addTranscript(
      {
        ...state,
        currentPrompt: "human-night-doctor"
      },
      "narrator",
      "Narrator",
      "Doctor, wake quietly. Choose one soul to guard from the dark.",
      "narration",
      ["player_6"]
    );
  }

  const doctor = firstNpcOrFirst(livingRole(state, "doctor"));
  if (!state.nightActions.doctorSaveId && doctor) {
    return runNpcNightAction(state, doctor);
  }

  if (human.alive && human.role === "detective" && !state.nightActions.detectiveTargetId) {
    return addTranscript(
      {
        ...state,
        currentPrompt: "human-night-detective"
      },
      "narrator",
      "Narrator",
      "Detective, open your eyes. Point to the lie you want unmasked.",
      "narration",
      ["player_6"]
    );
  }

  const detective = firstNpcOrFirst(livingRole(state, "detective"));
  if (!state.nightActions.detectiveTargetId && detective) {
    return runNpcNightAction(state, detective);
  }

  if (state.nightNumber <= 1 && !state.nightActions.mafiaSkippedFirstNight) {
    return touch({
      ...state,
      nightActions: {
        ...state.nightActions,
        mafiaSkippedFirstNight: true
      }
    });
  }

  if (human.alive && human.role === "mafia" && !state.nightActions.mafiaTargetId) {
    return addTranscript(
      {
        ...state,
        currentPrompt: "human-night-mafia"
      },
      "narrator",
      "Narrator",
      "Mafia, open your eyes. Choose who does not see the morning.",
      "narration",
      ["player_6"]
    );
  }

  const aliveMafia = livingRole(state, "mafia");
  if (!state.nightActions.mafiaTargetId && aliveMafia.length) {
    const mafiaActor = firstNpcOrFirst(aliveMafia);
    if (mafiaActor) {
      return runNpcNightAction(state, mafiaActor);
    }
  }

  return resolveNight(state);
}

async function runNpcNightAction(state: GameState, actor: Player): Promise<GameState> {
  const turn = await generateNpcTurnForPlayer(state, actor);
  const targetId = turn.role_action;
  const withMind = addInnerMonologue(state, actor.id, turn.inner_monologue);

  if (!targetId) {
    return touch(withMind);
  }

  return submitNightAction(withMind, actor.id, targetId);
}

async function advanceDiscussion(state: GameState): Promise<GameState> {
  if (state.currentPrompt === "human-speech") {
    return state;
  }

  const queue = state.turnOrder.discussionQueue;
  const [speakerId, ...remaining] = queue;

  if (!speakerId) {
    return addTranscript(
      {
        ...state,
        phase: "day-vote",
        currentPrompt: undefined,
        votes: [],
        turnOrder: {
          discussionQueue: [],
          voteQueue: buildVoteQueue(state),
          nightQueue: []
        }
      },
      "narrator",
      "Narrator",
      "The talk curdles into a vote.",
      "narration"
    );
  }

  const speaker = getPlayer(state, speakerId);
  if (!speaker.alive) {
    return touch({
      ...state,
      turnOrder: {
        ...state.turnOrder,
        discussionQueue: remaining
      }
    });
  }

  if (speaker.isHuman) {
    return addTranscript(
      {
        ...state,
        currentPrompt: "human-speech",
        turnOrder: {
          ...state.turnOrder,
          discussionQueue: queue
        }
      },
      "narrator",
      "Narrator",
      "The table turns to you. Speak carefully.",
      "narration",
      ["player_6"]
    );
  }

  const turn = await generateNpcTurnForPlayer(state, speaker);
  const withMind = addInnerMonologue(state, speaker.id, turn.inner_monologue);
  const withSpeech = addTranscript(
    {
      ...withMind,
      currentPrompt: undefined,
      turnOrder: {
        ...withMind.turnOrder,
        discussionQueue: remaining
      }
    },
    speaker.id,
    speaker.name,
    turn.speech,
    "speech"
  );

  return applySuspicionFromSpeech(withSpeech, turn.speech, speaker.id);
}

function buildVoteQueue(state: GameState): PlayerId[] {
  const alive = alivePlayers(state).sort((left, right) => left.seat - right.seat);
  return alive.map((player) => player.id);
}

async function advanceVote(state: GameState): Promise<GameState> {
  if (state.currentPrompt === "human-vote") {
    return state;
  }

  const queue = state.turnOrder.voteQueue;
  const [voterId, ...remaining] = queue;

  if (!voterId) {
    return resolveVote(state);
  }

  const voter = getPlayer(state, voterId);
  if (!voter.alive) {
    return touch({
      ...state,
      turnOrder: {
        ...state.turnOrder,
        voteQueue: remaining
      }
    });
  }

  if (voter.isHuman && !state.votes.some((vote) => vote.voterId === voter.id)) {
    return addTranscript(
      {
        ...state,
        currentPrompt: "human-vote",
        turnOrder: {
          ...state.turnOrder,
          voteQueue: queue
        }
      },
      "narrator",
      "Narrator",
      "Your hand is on the ballot. Choose who leaves the table.",
      "narration",
      ["player_6"]
    );
  }

  if (voter.isHuman) {
    return touch({
      ...state,
      currentPrompt: undefined,
      turnOrder: {
        ...state.turnOrder,
        voteQueue: remaining
      }
    });
  }

  const turn = await generateNpcTurnForPlayer(state, voter);
  const withMind = addInnerMonologue(state, voter.id, turn.inner_monologue);
  const voted = submitVote(withMind, voter.id, turn.vote ?? fallbackVoteTarget(state, voter.id));

  return touch({
    ...voted,
    turnOrder: {
      ...voted.turnOrder,
      voteQueue: remaining
    }
  });
}

export function submitHumanVote(state: GameState, targetId: PlayerId): GameState {
  const voted = submitVote(state, "player_6", targetId);
  const queue = voted.turnOrder.voteQueue;
  const nextQueue = queue[0] === "player_6" ? queue.slice(1) : queue.filter((id) => id !== "player_6");
  return touch({
    ...voted,
    currentPrompt: undefined,
    turnOrder: {
      ...voted.turnOrder,
      voteQueue: nextQueue
    }
  });
}

export function submitHumanNightAction(state: GameState, targetId: PlayerId): GameState {
  const human = getHuman(state);
  const target = getPlayer(state, targetId);
  const withAction = submitNightAction(state, "player_6", targetId);
  if (withAction.lastError) {
    return withAction;
  }

  const roleText =
    human.role === "mafia"
      ? `You chose ${target.name}. The rest of the table will learn the result at dawn.`
      : human.role === "doctor"
        ? `You chose to protect ${target.name}.`
        : human.role === "detective"
          ? `You investigated ${target.name}.`
          : `You chose ${target.name}.`;

  return addTranscript(withAction, "system", "Private note", roleText, "action", ["player_6"]);
}

function addInnerMonologue(state: GameState, playerId: PlayerId, text: string): GameState {
  const entry: InnerMonologue = {
    id: makeId("mind"),
    playerId,
    day: state.day,
    phase: state.phase,
    text,
    createdAt: Date.now()
  };

  return touch({
    ...state,
    innerMonologues: [...state.innerMonologues, entry]
  });
}

async function generateNpcTurnForPlayer(state: GameState, player: Player): Promise<NpcTurn> {
  const { generateNpcTurn } = await import("@/lib/ai/generate-npc-turn");
  return generateNpcTurn(state, player);
}

function firstNpcOrFirst(players: Player[]): Player | undefined {
  return players.find((player) => !player.isHuman) ?? players[0];
}

function fallbackVoteTarget(state: GameState, voterId: PlayerId): PlayerId {
  const voter = getPlayer(state, voterId);
  const targets = alivePlayers(state).filter((player) => player.id !== voterId);
  const preferred = targets
    .filter((player) => (voter.role === "mafia" ? player.role !== "mafia" : player.role === "mafia"))
    .sort((left, right) => right.suspicion - left.suspicion || left.seat - right.seat)[0];
  return (preferred ?? targets[0]).id;
}

function applySuspicionFromSpeech(state: GameState, speech: string, speakerId: PlayerId): GameState {
  return applySpeechMemory(state, speech, speakerId, 1);
}

function applyHumanSpeechSuspicion(state: GameState, speech: string): GameState {
  return applySpeechMemory(state, speech, "player_6", 2);
}

function applySpeechMemory(state: GameState, speech: string, speakerId: PlayerId, pressureWeight: number): GameState {
  const lowered = normalizeSpeech(speech);
  const speaker = getPlayer(state, speakerId);
  const mentionedIds = state.players
    .filter((player) => player.id !== speakerId && player.alive && mentionsPlayer(lowered, player))
    .map((player) => player.id);
  const stance = speechStance(speech);
  const targetNames = mentionedIds.map((id) => getPlayer(state, id).name);

  if (!mentionedIds.length) {
    return touch(state);
  }

  return touch({
    ...state,
    players: state.players.map((player) => {
      if (!player.alive) {
        return player;
      }

      if (player.id === speakerId) {
        return {
          ...player,
          notes: addMemoryNote(player.notes, `You ${stance.self} ${targetNames.join(" and ")}: "${shortQuote(speech)}"`)
        };
      }

      if (!mentionedIds.includes(player.id)) {
        return player;
      }

      if (stance.kind === "defense") {
        return {
          ...player,
          trust: player.trust + 1,
          notes: addMemoryNote(player.notes, `${speaker.name} defended you: "${shortQuote(speech)}"`)
        };
      }

      return {
        ...player,
        suspicion: player.suspicion + pressureWeight,
        notes: addMemoryNote(player.notes, `${speaker.name} ${stance.target} you: "${shortQuote(speech)}"`)
      };
    })
  });
}

function addMemoryNote(notes: string[], note: string): string[] {
  return [...notes, note].slice(-MEMORY_NOTE_LIMIT);
}

function speechStance(speech: string): { kind: "pressure" | "defense"; self: string; target: string } {
  const lowered = normalizeSpeech(speech);
  const defense =
    /\b(trust|believe|innocent|clear|cleared|not mafia|not the mafia|isn't mafia|is not mafia|leave .* alone|wrong about|back off)\b/.test(
      lowered
    );
  const accusation =
    /\b(mafia|lying|liar|lie|suspicious|suspect|guilty|dodg|cover|alibi|knife|murder|corpse|quiet|too clean|changed|performance|voted|panic|bullshit|damn)\b/.test(
      lowered
    );
  const question = /[?]|\b(why|what|how|explain|answer|tell me)\b/.test(lowered);

  if (defense && !accusation) {
    return { kind: "defense", self: "defended", target: "defended" };
  }
  if (question && accusation) {
    return { kind: "pressure", self: "pressed", target: "pressed" };
  }
  if (question) {
    return { kind: "pressure", self: "questioned", target: "questioned" };
  }
  return { kind: "pressure", self: "challenged", target: "challenged" };
}

function mentionsPlayer(normalizedSpeech: string, player: Player): boolean {
  const fullName = normalizeSpeech(player.name);
  const firstName = fullName.split(" ")[0];
  return wordIncludes(normalizedSpeech, fullName) || wordIncludes(normalizedSpeech, firstName);
}

function wordIncludes(text: string, value: string): boolean {
  if (!value) {
    return false;
  }

  return new RegExp(`(^|\\W)${escapeRegExp(value)}(\\W|$)`, "i").test(text);
}

function shortQuote(text: string): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 96 ? `${compact.slice(0, 93)}...` : compact;
}

function normalizeSpeech(text: string): string {
  return text.toLowerCase().replace(/[’]/g, "'");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
