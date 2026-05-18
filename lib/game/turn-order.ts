import { Player, PlayerId } from "./types";
import { shuffle } from "./random";

export function buildDiscussionQueueFromPlayers(players: Player[], seed: string, day: number): PlayerId[] {
  const aliveIds = players.filter((player) => player.alive).map((player) => player.id);
  const firstRound = shuffle(aliveIds, `${seed}:day-${day}:discussion:round-1`);
  const secondRound = shuffle(aliveIds, `${seed}:day-${day}:discussion:round-2`);
  return [...firstRound, ...secondRound];
}

export function buildVoteQueueFromPlayers(players: Player[], seed: string, day: number): PlayerId[] {
  return shuffle(
    players.filter((player) => player.alive).map((player) => player.id),
    `${seed}:day-${day}:vote`
  );
}
