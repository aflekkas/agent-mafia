import { GameState, PlayerId } from "./types";

export function redactGameForPlayer(state: GameState, viewerId: PlayerId = "player_6"): GameState {
  const revealAll = state.phase === "game-over";
  const viewer = state.players.find((player) => player.id === viewerId);
  const viewerCanSeeMafia = viewer?.role === "mafia";
  const viewerCanSeeDetectiveResult = viewer?.role === "detective";

  return {
    ...state,
    players: state.players.map((player) =>
      player.id === viewerId || revealAll || (viewerCanSeeMafia && player.role === "mafia")
        ? player
        : {
            ...player,
            role: "unknown"
          }
    ),
    transcript: state.transcript.filter((entry) => !entry.privateTo?.length || entry.privateTo.includes(viewerId)),
    innerMonologues: state.phase === "game-over" ? state.innerMonologues : [],
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
