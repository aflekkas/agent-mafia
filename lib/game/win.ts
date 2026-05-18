import { GameState } from "./types";
import { mafiaPlayers, townPlayers } from "./selectors";
import { touch } from "./setup";

export function checkWinCondition(state: GameState): GameState {
  const mafia = mafiaPlayers(state);
  const town = townPlayers(state);

  if (mafia.length === 0) {
    return touch({
      ...state,
      phase: "game-over",
      winner: "town",
      currentPrompt: undefined,
      turnOrder: {
        discussionQueue: [],
        voteQueue: [],
        nightQueue: []
      }
    });
  }

  if (mafia.length >= town.length && state.day > 1) {
    return touch({
      ...state,
      phase: "game-over",
      winner: "mafia",
      currentPrompt: undefined,
      turnOrder: {
        discussionQueue: [],
        voteQueue: [],
        nightQueue: []
      }
    });
  }

  return state;
}
