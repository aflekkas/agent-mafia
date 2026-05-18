#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://localhost:3001";
const MAX_STEPS = 180;

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.baseUrl ?? DEFAULT_BASE_URL;
const gamesToRun = Number.parseInt(args.games ?? "1", 10);
const seedPrefix = args.seed ?? `cli-playtest-${Date.now()}`;
const humanName = args.name ?? "Alex";

const results = [];
for (let index = 0; index < gamesToRun; index += 1) {
  const seed = gamesToRun === 1 ? seedPrefix : `${seedPrefix}-${index + 1}`;
  results.push(await playGame(seed));
}

console.log(JSON.stringify({ baseUrl, games: results }, null, 2));

async function playGame(seed) {
  let game = await post("/api/game", {
    seed,
    humanName,
    humanRole: args.role ?? "random"
  });
  const observations = [];
  const moves = [];
  let steps = 0;

  while (steps < MAX_STEPS && game.phase !== "game-over") {
    steps += 1;

    if (game.lastError) {
      observations.push(`lastError at step ${steps}: ${game.lastError}`);
    }

    if (game.currentPrompt === "human-speech") {
      const text = chooseSpeech(game);
      moves.push({ step: steps, type: "speech", text });
      game = await post(`/api/game/${game.id}/action`, { type: "speech", text });
      continue;
    }

    if (game.currentPrompt === "human-vote") {
      const target = chooseVoteTarget(game);
      const text = chooseVoteReason(game, target);
      moves.push({ step: steps, type: "vote", target: target.name, text });
      game = await post(`/api/game/${game.id}/action`, { type: "vote", targetId: target.id, text });
      continue;
    }

    if (game.currentPrompt?.startsWith("human-night")) {
      const target = chooseNightTarget(game);
      moves.push({ step: steps, type: game.currentPrompt, target: target.name });
      game = await post(`/api/game/${game.id}/action`, { type: "night", targetId: target.id });
      continue;
    }

    game = await post(`/api/game/${game.id}/action`, { type: "advance" });
  }

  if (steps >= MAX_STEPS) {
    observations.push(`hit max step limit ${MAX_STEPS}`);
  }

  observations.push(...auditGame(game, moves));

  return {
    gameId: game.id,
    seed,
    steps,
    phase: game.phase,
    day: game.day,
    winner: game.winner ?? null,
    humanRole: game.players.find((player) => player.id === "player_6")?.role,
    moves,
    observations,
    transcript: visibleTranscript(game),
    actionLog: game.actionLog ?? []
  };
}

function chooseSpeech(game) {
  const human = humanPlayer(game);
  const latest = latestPublicSpeech(game);
  const pressure = rankedVisiblePlayers(game)[0];
  const humanSpeechCount = visibleTranscript(game).filter((entry) => entry.kind === "speech" && entry.speakerId === "player_6").length;

  if (args.provocative === "true" || args.provocative === "1") {
    if (humanSpeechCount === 0) {
      return "I am saying something deliberately useless and provocative: I might be Mafia, and someone here should call me on it.";
    }
    if (humanSpeechCount === 1) {
      return "Seriously, if everyone ignores that I just said I might be Mafia, this table is asleep.";
    }
  }

  if (!latest || latest.speakerId === "narrator") {
    return `I want an actual read from ${pressure.name}. First person who gives fog instead of a name is where I start.`;
  }

  if (human.role === "mafia") {
    const partner = visibleMafiaPartners(game)[0];
    if (partner && latest.text.includes(partner.name)) {
      return `${latest.speakerName}, that case on ${partner.name} is thin. Who benefits if we all pile there this early?`;
    }
    return `${latest.speakerName}, that sounds convenient. ${pressure.name} has been sliding through this conversation way too clean.`;
  }

  if (human.role === "detective") {
    const knownMafia = game.players.find((player) => player.id !== human.id && player.role === "mafia");
    if (knownMafia?.alive) {
      return `${knownMafia.name} is where I want pressure. I do not like how carefully people are moving around that seat.`;
    }
  }

  if (/Alex|me|you/i.test(latest.text)) {
    return `${latest.speakerName}, answer the actual point instead of turning me into the topic. Who are you pairing with that read?`;
  }

  return humanSpeechCount % 2 === 0
    ? `${latest.speakerName}, I hear that, but I want a connection. If ${pressure.name} is wrong, who is protecting them?`
    : `${pressure.name} still feels too comfortable to me. I want someone to explain who they are actually helping.`;
}

function chooseVoteTarget(game) {
  const human = humanPlayer(game);
  const candidates = game.players.filter((player) => player.alive && player.id !== human.id);
  const partners = new Set(visibleMafiaPartners(game).map((player) => player.id));
  const ranked = candidates
    .filter((player) => !partners.has(player.id))
    .sort((left, right) => scoreCandidate(game, right) - scoreCandidate(game, left) || left.seat - right.seat);
  return ranked[0] ?? candidates[0];
}

function chooseVoteReason(game, target) {
  return `The pressure pattern around ${target.name} looks least honest right now. I want that seat resolved.`;
}

function chooseNightTarget(game) {
  const human = humanPlayer(game);
  const living = game.players.filter((player) => player.alive);
  const others = living.filter((player) => player.id !== human.id);

  if (game.currentPrompt === "human-night-mafia") {
    const partners = new Set(visibleMafiaPartners(game).map((player) => player.id));
    return (
      others
        .filter((player) => !partners.has(player.id))
        .sort((left, right) => scoreCandidate(game, right) - scoreCandidate(game, left) || left.seat - right.seat)[0] ?? others[0]
    );
  }

  if (game.currentPrompt === "human-night-detective") {
    return others.filter((player) => player.role === "unknown").sort((left, right) => scoreCandidate(game, right) - scoreCandidate(game, left))[0] ?? others[0];
  }

  if (game.currentPrompt === "human-night-doctor") {
    return [human, ...others].sort((left, right) => scoreCandidate(game, right) - scoreCandidate(game, left))[0];
  }

  return others[0] ?? human;
}

function auditGame(game, moves) {
  const observations = [];
  const entries = visibleTranscript(game);

  for (const day of unique(entries.map((entry) => entry.day))) {
    const speeches = entries.filter((entry) => entry.day === day && entry.kind === "speech");
    const counts = countBy(speeches.map((entry) => entry.speakerId));
    const livingSpeakers = new Set(speeches.map((entry) => entry.speakerId));
    if (speeches.length && Math.max(...counts.values()) - Math.min(...counts.values()) > 1) {
      observations.push(`uneven speaking count on day ${day}: ${JSON.stringify(Object.fromEntries(counts))}`);
    }
    if (speeches.length && livingSpeakers.size < 3 && game.phase !== "game-over") {
      observations.push(`too few speakers on day ${day}: ${speeches.map((entry) => entry.speakerName).join(", ")}`);
    }
  }

  const voteLines = entries.filter((entry) => entry.kind === "vote");
  for (const vote of voteLines) {
    if (!/\bbecause\b|\bpattern\b|\bread\b|\bcase\b|\breason\b|\bpressure\b|\bdodg|\becho|\bsmoke\b|\bfog\b|\bcover\b|\bposition\b|\bconvincing\b|\banswer\b|\bclean\b|\bsteer|\bstall|\bshield|\balibi|\bcontradiction\b|\bhunting\b|\bscumhunting\b/i.test(vote.text)) {
      observations.push(`weak vote rationale from ${vote.speakerName}: ${vote.text}`);
    }
    if (/\b(I vote|I'm voting|I am voting|My vote is|Voting)\b/i.test(vote.text)) {
      observations.push(`ballot phrase leaked from ${vote.speakerName}: ${vote.text}`);
    }
  }

  entries.forEach((entry, index) => {
    if (entry.speakerId !== "player_6" || !/mafia|fuck|kill|destroy|crack|bait/i.test(entry.text)) {
      return;
    }
    const nextNpc = entries.slice(index + 1).find((candidate) => candidate.kind === "speech" && candidate.speakerId !== "player_6");
    if (nextNpc && !/Alex|what|fuck|talking|useful|mafia|bait|point/i.test(nextNpc.text)) {
      observations.push(`NPC may have ignored provocative human line. Human="${entry.text}" Next="${nextNpc.speakerName}: ${nextNpc.text}"`);
    }
  });

  for (const move of moves.filter((candidate) => candidate.type === "human-night-mafia")) {
    const outcome = (game.actionLog ?? []).find((entry) => entry.action === "mafia-kill" && entry.targetName === move.target);
    if (!outcome) {
      observations.push(`missing action log for human mafia kill targeting ${move.target}`);
    }
  }

  return observations;
}

function scoreCandidate(game, player) {
  const text = visibleTranscript(game)
    .map((entry) => entry.text)
    .join("\n");
  const mentions = (text.match(new RegExp(`\\b${escapeRegExp(player.name)}\\b`, "gi")) ?? []).length;
  return mentions + player.suspicion * 2 - player.trust;
}

function rankedVisiblePlayers(game) {
  const human = humanPlayer(game);
  return game.players.filter((player) => player.alive && player.id !== human.id).sort((left, right) => scoreCandidate(game, right) - scoreCandidate(game, left));
}

function visibleMafiaPartners(game) {
  const human = humanPlayer(game);
  return human.role === "mafia" ? game.players.filter((player) => player.id !== human.id && player.role === "mafia") : [];
}

function humanPlayer(game) {
  return game.players.find((player) => player.id === "player_6");
}

function latestPublicSpeech(game) {
  return (
    game.transcript.filter((entry) => !entry.privateTo?.length && entry.kind === "speech").at(-1) ??
    game.transcript.filter((entry) => !entry.privateTo?.length && entry.kind === "narration").at(-1)
  );
}

function visibleTranscript(game) {
  return game.transcript.filter((entry) => !entry.privateTo?.length || entry.privateTo.includes("player_6"));
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function unique(values) {
  return [...new Set(values)];
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  return payload.game;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, value] = arg.slice(2).split("=");
    parsed[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = value ?? argv[index + 1];
    if (value === undefined) {
      index += 1;
    }
  }
  return parsed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
