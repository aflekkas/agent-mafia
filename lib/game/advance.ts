import { generateNpcTurn } from "@/lib/ai/generate-npc-turn";
import { addTranscript, makeId, touch } from "./setup";
import { resolveNight, submitNightAction } from "./night";
import { alivePlayers, getHuman, getPlayer, livingRole } from "./selectors";
import { submitVote, resolveVote } from "./votes";
import { GameState, InnerMonologue, Player, PlayerId } from "./types";

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
      "Player 6",
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

  return resolveNight(state);
}

async function runNpcNightAction(state: GameState, actor: Player): Promise<GameState> {
  const turn = await generateNpcTurn(state, actor);
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

  const turn = await generateNpcTurn(state, speaker);
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

  const turn = await generateNpcTurn(state, voter);
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

function buildDiscussionQueue(state: GameState): PlayerId[] {
  const alive = alivePlayers(state).sort((left, right) => left.seat - right.seat);
  const human = alive.find((player) => player.isHuman);
  const npcs = alive.filter((player) => !player.isHuman);
  const firstSpeaker = npcs[0]?.id;
  const remainingNpcs = npcs.slice(1).map((player) => player.id);
  const humanId = human?.id;
  const roundOne = [firstSpeaker, humanId, ...remainingNpcs].filter(Boolean) as PlayerId[];
  const roundTwo = [...npcs.map((player) => player.id), humanId].filter(Boolean) as PlayerId[];
  const roundThree = npcs.map((player) => player.id);
  return [...roundOne, ...roundTwo, ...roundThree];
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

function firstNpcOrFirst(players: Player[]): Player | undefined {
  return players.find((player) => !player.isHuman) ?? players[0];
}

function fallbackVoteTarget(state: GameState, voterId: PlayerId): PlayerId {
  const voter = getPlayer(state, voterId);
  const targets = alivePlayers(state).filter((player) => player.id !== voterId);
  const demoSafeTargets =
    state.day === 1 && targets.length > 1 && voterId !== "player_6"
      ? targets.filter((player) => player.id !== "player_6")
      : targets;
  const preferred = targets
    .filter((player) => demoSafeTargets.includes(player))
    .filter((player) => (voter.role === "mafia" ? player.role !== "mafia" : player.role === "mafia"))
    .sort((left, right) => right.suspicion - left.suspicion || left.seat - right.seat)[0];
  return (preferred ?? demoSafeTargets[0] ?? targets[0]).id;
}

function applySuspicionFromSpeech(state: GameState, speech: string, speakerId: PlayerId): GameState {
  const lowered = speech.toLowerCase();
  return touch({
    ...state,
    players: state.players.map((player) => {
      if (player.id === speakerId || !player.alive) {
        return player;
      }
      const firstName = player.name.toLowerCase().split(" ")[0];
      const mentioned = lowered.includes(firstName) || lowered.includes(player.name.toLowerCase());
      return mentioned
        ? {
            ...player,
            suspicion: player.suspicion + 1
          }
        : player;
    })
  });
}

function applyHumanSpeechSuspicion(state: GameState, speech: string): GameState {
  const lowered = speech.toLowerCase();
  const vague = lowered.length < 55 || /\b(not sure|listening|maybe|i guess|hard to say)\b/.test(lowered);

  return touch({
    ...state,
    players: state.players.map((player) => {
      if (!player.alive) {
        return player;
      }
      if (player.id === "player_6") {
        return vague
          ? {
              ...player,
              suspicion: player.suspicion + 1,
              notes: [...player.notes, "Player 6 sounded vague under pressure."]
            }
          : player;
      }
      const firstName = player.name.toLowerCase().split(" ")[0];
      const mentioned = lowered.includes(firstName) || lowered.includes(player.name.toLowerCase());
      return mentioned
        ? {
            ...player,
            suspicion: player.suspicion + 2
          }
        : player;
    })
  });
}
