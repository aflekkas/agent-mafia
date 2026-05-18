import { GameState, PlayerId } from "./types";
import { getPlayer, legalTargets } from "./selectors";
import { roleActionForRole } from "./role-actions";
import { addActionLog, addTranscript, touch } from "./setup";
import { buildDiscussionQueueFromPlayers } from "./turn-order";
import { checkWinCondition } from "./win";

export function submitNightAction(state: GameState, actorId: PlayerId, targetId: PlayerId): GameState {
  const actor = getPlayer(state, actorId);
  const action = roleActionForRole(actor.role);

  if (!action) {
    return addActionLog(
      {
        ...touch(state),
        lastError: `${actor.name} has no night action.`
      },
      {
        actorId,
        actorName: actor.name,
        action: "mafia-kill",
        targetId,
        targetName: getPlayer(state, targetId).name,
        outcome: "rejected",
        detail: `${actor.name} has no night action.`
      }
    );
  }

  const legal = legalTargets(state, actorId, action);
  if (!legal.includes(targetId)) {
    const target = getPlayer(state, targetId);
    return addActionLog(
      {
        ...touch(state),
        lastError: `${actor.name} cannot target ${target.name}.`
      },
      {
        actorId,
        actorName: actor.name,
        action,
        targetId,
        targetName: target.name,
        outcome: "rejected",
        detail: `${actor.name} cannot target ${target.name}.`
      }
    );
  }

  const target = getPlayer(state, targetId);
  const withLog = addActionLog(state, {
    actorId,
    actorName: actor.name,
    action,
    targetId,
    targetName: target.name,
    outcome: "submitted",
    detail: `${actor.name} submitted ${action} targeting ${target.name}.`
  });

  if (actor.role === "mafia") {
    return touch({
      ...withLog,
      nightActions: {
        ...withLog.nightActions,
        mafiaTargetId: targetId
      },
      currentPrompt: undefined,
      lastError: undefined
    });
  }

  if (actor.role === "doctor") {
    return touch({
      ...withLog,
      nightActions: {
        ...withLog.nightActions,
        doctorSaveId: targetId
      },
      currentPrompt: undefined,
      lastError: undefined
    });
  }

  return touch({
    ...withLog,
    players: withLog.players.map((player) =>
      player.id === targetId
        ? {
            ...player,
            detectiveKnownRole: target.role
          }
        : player
    ),
    nightActions: {
      ...withLog.nightActions,
      detectiveTargetId: targetId,
      detectiveResult: {
        targetId,
        role: target.role
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

  if (state.nightNumber === 0) {
    if (targetId) {
      const target = getPlayer(state, targetId);
      nextState = addActionLog(nextState, {
        actorId: livingMafia(state)[0] ?? "player_6",
        actorName: "Mafia",
        action: "mafia-kill",
        targetId,
        targetName: target.name,
        outcome: "skipped",
        detail: `First night rule blocked the Mafia kill on ${target.name}.`
      });
    }
    nextState = addTranscript(nextState, "narrator", "Narrator", "The first night passes under old rules. No blade is raised.", "narration");
  } else if (targetId && targetId !== saveId) {
    const target = getPlayer(state, targetId);
    nextState = addTranscript(
      addActionLog(
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
        {
          actorId: livingMafia(state)[0] ?? "player_6",
          actorName: "Mafia",
          action: "mafia-kill",
          targetId,
          targetName: target.name,
          outcome: "resolved",
          detail: `Mafia kill resolved on ${target.name}.`
        }
      ),
      "narrator",
      "Narrator",
      `Dawn finds one chair cold. ${target.name} is gone.`,
      "narration"
    );
  } else if (targetId && targetId === saveId) {
    const target = getPlayer(state, targetId);
    nextState = addTranscript(
      addTranscript(
        addActionLog(nextState, {
          actorId: livingMafia(state)[0] ?? "player_6",
          actorName: "Mafia",
          action: "mafia-kill",
          targetId,
          targetName: target.name,
          outcome: "blocked",
          detail: `Doctor save blocked the Mafia kill on ${target.name}.`
        }),
        "system",
        "Private note",
        `Your strike on ${target.name} was blocked. Someone protected them.`,
        "action",
        livingMafia(state)
      ),
      "narrator",
      "Narrator",
      `A blade found ${target.name}, but a hand stayed the wound.`,
      "narration"
    );
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

function livingMafia(state: GameState): PlayerId[] {
  return state.players.filter((player) => player.alive && player.role === "mafia").map((player) => player.id);
}
