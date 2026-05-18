import { GameState, PlayerId } from "./types";

export function redactGameForPlayer(state: GameState, viewerId: PlayerId = "player_6"): GameState {
  const revealAll = state.phase === "game-over";
  const viewer = state.players.find((player) => player.id === viewerId);
  const viewerCanSeeMafia = viewer?.role === "mafia";
  const viewerCanSeeDetectiveLead = viewer?.role === "detective";
  const viewerCanSeeDetectiveResult = viewer?.role === "detective";
  const visibleTranscript = state.transcript.filter((entry) => !entry.privateTo?.length || entry.privateTo.includes(viewerId));
  const visibleActionLog =
    revealAll
      ? state.actionLog
      : (state.actionLog ?? []).filter(
          (entry) =>
            entry.actorId === viewerId ||
            entry.action === "vote" ||
            (viewerCanSeeMafia && entry.action === "mafia-kill") ||
            (viewerCanSeeDetectiveResult && entry.action === "detective-investigate")
        );

  return {
    ...state,
    activeSpeakerId: visibleTranscript.at(-1)?.speakerId ?? state.activeSpeakerId,
    players: state.players.map((player) => {
      const visiblePlayer = {
        ...player,
        detectiveKnownRole: revealAll || viewerCanSeeDetectiveLead ? player.detectiveKnownRole : undefined
      };

      if (player.id === viewerId || revealAll || (viewerCanSeeMafia && player.role === "mafia")) {
        return visiblePlayer;
      }

      if (viewerCanSeeDetectiveLead && player.detectiveKnownRole) {
        return {
          ...visiblePlayer,
          role: player.detectiveKnownRole
        };
      }

      return {
        ...visiblePlayer,
        role: "unknown",
        detectiveKnownRole: undefined
      };
    }),
    transcript: visibleTranscript,
    innerMonologues: state.phase === "game-over" ? state.innerMonologues : [],
    actionLog: visibleActionLog,
    nightActions:
      state.phase === "game-over"
        ? state.nightActions
        : viewerCanSeeDetectiveResult
          ? {
              detectiveResult: state.nightActions.detectiveResult
            }
          : {}
  };
}
