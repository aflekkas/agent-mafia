import { Player, PlayerId } from "./types";
import { shuffle } from "./random";

export function buildDiscussionQueueFromPlayers(players: Player[], seed: string, day: number): PlayerId[] {
  return shuffle(
    players.filter((player) => player.alive).map((player) => player.id),
    `${seed}:day-${day}:discussion`
  );
}

export function buildVoteQueueFromPlayers(players: Player[], seed: string, day: number): PlayerId[] {
  return shuffle(
    players.filter((player) => player.alive).map((player) => player.id),
    `${seed}:day-${day}:vote`
  );
}
