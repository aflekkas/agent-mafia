import { Player, PlayerId } from "./types";
import { shuffle } from "./random";

export function buildDiscussionQueueFromPlayers(players: Player[], seed: string, day: number): PlayerId[] {
  const alive = players.filter((player) => player.alive);
  const firstPass = shuffle(
    alive.map((player) => player.id),
    `${seed}:day-${day}:discussion:first`
  );
  const secondPass = shuffle(
    alive.filter((player) => !player.isHuman).map((player) => player.id),
    `${seed}:day-${day}:discussion:second`
  );

  return [...firstPass, ...secondPass];
}
