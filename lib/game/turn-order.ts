import { Player, PlayerId } from "./types";
import { shuffle } from "./random";

export function buildDiscussionQueueFromPlayers(players: Player[], seed: string, day: number): PlayerId[] {
  const aliveIds = players.filter((player) => player.alive).map((player) => player.id);
  const firstRound = shuffle(aliveIds, `${seed}:day-${day}:discussion:round-1`);
  const secondRound = avoidBoundaryRepeat(firstRound, shuffle(aliveIds, `${seed}:day-${day}:discussion:round-2`));
  return [...firstRound, ...secondRound];
}

export function buildVoteQueueFromPlayers(players: Player[], seed: string, day: number): PlayerId[] {
  return shuffle(
    players.filter((player) => player.alive).map((player) => player.id),
    `${seed}:day-${day}:vote`
  );
}

function avoidBoundaryRepeat(firstRound: PlayerId[], secondRound: PlayerId[]): PlayerId[] {
  const boundarySpeaker = firstRound.at(-1);
  if (!boundarySpeaker || secondRound[0] !== boundarySpeaker || secondRound.length < 2) {
    return secondRound;
  }

  const swapIndex = secondRound.findIndex((id) => id !== boundarySpeaker);
  if (swapIndex <= 0) {
    return secondRound;
  }

  const next = [...secondRound];
  [next[0], next[swapIndex]] = [next[swapIndex], next[0]];
  return next;
}
