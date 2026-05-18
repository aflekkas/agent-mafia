import { Player, PlayerId } from "./types";

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

function shuffle<T>(values: T[], seed: string): T[] {
  const result = [...values];
  const rand = seededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rand() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return () => {
    hash += 0x6d2b79f5;
    let value = hash;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
