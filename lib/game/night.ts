import { GameState, PlayerId } from "./types";
import { getPlayer, legalTargets } from "./selectors";
import { roleActionForRole } from "./role-actions";
import { addTranscript, touch } from "./setup";
import { buildDiscussionQueueFromPlayers } from "./turn-order";
import { checkWinCondition } from "./win";

export function submitNightAction(state: GameState, actorId: PlayerId, targetId: PlayerId): GameState {
  const actor = getPlayer(state, actorId);
  const action = roleActionForRole(actor.role);

  if (!action) {
    return {
      ...touch(state),
      lastError: `${actor.name} has no night action.`
    };
  }

  const legal = legalTargets(state, actorId, action);
  if (!legal.includes(targetId)) {
    return {
      ...touch(state),
      lastError: `${actor.name} cannot target ${getPlayer(state, targetId).name}.`
    };
  }

  if (actor.role === "mafia") {
    return touch({
      ...state,
      nightActions: {
        ...state.nightActions,
        mafiaTargetId: targetId
      },
      currentPrompt: undefined,
      lastError: undefined
    });
  }

  if (actor.role === "doctor") {
    return touch({
      ...state,
      nightActions: {
        ...state.nightActions,
        doctorSaveId: targetId
      },
      currentPrompt: undefined,
      lastError: undefined
    });
  }

  return touch({
    ...state,
    nightActions: {
      ...state.nightActions,
      detectiveTargetId: targetId,
      detectiveResult: {
        targetId,
        role: getPlayer(state, targetId).role
      }
    },
    currentPrompt: undefined,
    lastError: undefined
  });
}

export function resolveNight(state: GameState): GameState {
  const targetId = state.nightActions.mafiaTargetId;
  const saveId = state.nightActions.doctorSaveId;
  const detectiveResult = state.nightActions.detectiveResult;
  let nextState = state;

  if (detectiveResult) {
    nextState = addTranscript(
      nextState,
      "system",
      "Private note",
      `${getPlayer(state, detectiveResult.targetId).name} is ${detectiveResult.role}.`,
      "action",
      livingDetectives(state)
    );
  }

  if (state.nightNumber <= 1) {
    nextState = addTranscript(nextState, "narrator", "Narrator", "The first night passes under old rules. No blade is raised.", "narration");
  } else if (targetId && targetId !== saveId) {
    const target = getPlayer(state, targetId);
    nextState = addTranscript(
      {
        ...nextState,
        players: nextState.players.map((player) =>
          player.id === targetId
            ? {
                ...player,
                alive: false
              }
            : player
        ),
        eliminatedThisRound: targetId
      },
      "narrator",
      "Narrator",
      `Dawn finds one chair cold. ${target.name} is gone.`,
      "narration"
    );
  } else if (targetId && targetId === saveId) {
    nextState = addTranscript(nextState, "narrator", "Narrator", "A blade found its mark, but a hand stayed the wound.", "narration");
  } else {
    nextState = addTranscript(nextState, "narrator", "Narrator", "The night passes without a body.", "narration");
  }

  nextState = checkWinCondition(nextState);
  if (nextState.phase === "game-over") {
    return addTranscript(
      nextState,
      "system",
      "Game",
      nextState.winner === "town" ? "Town wins. The Mafia has been exposed." : "Mafia wins. Palermo belongs to the shadows.",
      "system"
    );
  }

  return addTranscript(
    {
      ...nextState,
      phase: "day-discussion",
      nightActions: {},
      votes: [],
      eliminatedThisRound: undefined,
      currentPrompt: undefined,
      turnOrder: {
        discussionQueue: buildDiscussionQueueFromPlayers(nextState.players, nextState.seed, nextState.day),
        voteQueue: [],
        nightQueue: []
      }
    },
    "narrator",
    "Narrator",
    "The living return to the table. Accusations are all that remain.",
    "narration"
  );
}

function livingDetectives(state: GameState): PlayerId[] {
  return state.players.filter((player) => player.alive && player.role === "detective").map((player) => player.id);
}
