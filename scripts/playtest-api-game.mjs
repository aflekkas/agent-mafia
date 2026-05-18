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
  observations.push(...auditPrivateNotes(game));

  return {
    gameId: game.id,
    seed,
    steps,
    phase: game.phase,
    day: game.day,
    winner: game.winner ?? null,
    humanRole: game.players.find((player) => player.id === "player_6")?.role,
    roleCounts: countRoles(game),
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
    return pickLine(game, "opening", [
      `I'm starting with ${pressure.name}. That seat feels too comfortable, so give me your first real read.`,
      `${pressure.name}, I want your first suspicion. Who looks wrong to you, and what did they actually do?`,
      `Before this gets theatrical, ${pressure.name}, give me the player you trust least right now.`
    ]);
  }

  if (human.role === "mafia") {
    const partner = visibleMafiaPartners(game)[0];
    if (partner && latest.text.includes(partner.name)) {
      return pickLine(game, "mafia-partner-defense", [
        `${latest.speakerName}, I don't think that case on ${partner.name} is earned yet. What did they actually do besides get named?`,
        `That feels too easy on ${partner.name}. ${latest.speakerName}, who gets safer if everyone follows that push?`,
        `${partner.name} may be messy, but this pile-on is cleaner than the case. I want the motive, not the headline.`
      ]);
    }
    return pickLine(game, "mafia-redirect", [
      `${latest.speakerName}, that lands a little too neatly. ${pressure.name} keeps surviving every turn without having to bleed for a read.`,
      `I don't buy how quickly that became the room's favorite answer. ${pressure.name} is getting treated like background noise, and I hate that.`,
      `${pressure.name} is where I want the table looking. The pressure keeps passing around them like everyone agreed not to touch it.`
    ]);
  }

  if (human.role === "detective") {
    const knownMafia = game.players.find((player) => player.id !== human.id && player.role === "mafia");
    if (knownMafia?.alive) {
      return pickLine(game, "detective-known-mafia", [
        `${knownMafia.name} is where I want pressure. Watch how carefully people move when that seat gets named.`,
        `Keep eyes on ${knownMafia.name}. The reactions around that name matter more to me than the speech itself.`,
        `${knownMafia.name} is not sitting right with me. I want answers there before the table drifts somewhere convenient.`
      ]);
    }
  }

  if (mentionsHuman(latest.text, human.name)) {
    return pickLine(game, "human-addressed", [
      `${latest.speakerName}, I'm not dodging. My read is ${pressure.name}, because the room keeps giving that seat room to breathe.`,
      `${latest.speakerName}, fair question. I still think ${pressure.name} is the better pressure point, and I want to see who hates that.`,
      `I'll answer cleanly: ${pressure.name} bothers me most right now. The timing around that seat feels rehearsed.`
    ]);
  }

  return pickLine(game, `generic-${humanSpeechCount}`, [
    `${latest.speakerName}, I hear the point, but the jump from suspicion to certainty feels too fast. ${pressure.name} is still the seat I want tested.`,
    `${latest.speakerName}, that might be right, but I want motive. Who gets safer if the table follows that read?`,
    `${pressure.name} still feels too comfortable to me. I want someone to explain why that seat keeps escaping real pressure.`,
    `I want less chorus and more receipts. ${pressure.name} has been in the middle of too many turns without owning the mess.`
  ]);
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
  return pickLine(game, `vote-${target.id}`, [
    `${target.name} keeps ending up near the heat without giving me a read I can trust. I want that seat resolved.`,
    `The timing around ${target.name} looks least honest to me. Too many turns bend around that seat.`,
    `${target.name} has the weakest position left on the table. The answers there feel managed, not hunted.`,
    `I keep coming back to ${target.name}. If that read is wrong, the reactions to it should still tell us something.`
  ]);
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
    if (!/\bbecause\b|\bpattern\b|\bread\b|\bcase\b|\breason\b|\bpressure\b|\bdodg|\becho|\bsmoke\b|\bfog\b|\bcover\b|\bposition\b|\bconvincing\b|\banswer\b|\bclean\b|\bsteer|\bstall|\bshield|\balibi|\bcontradiction\b|\bhunting\b|\bscumhunting\b|\bevasion\b|\btiming\b|\bmanaged\b|\bbenefit\b|\bmotive\b|\bexposed\b|\buntouchable\b|\buseful\b|\brunning the room\b/i.test(vote.text)) {
      observations.push(`weak vote rationale from ${vote.speakerName}: ${vote.text}`);
    }
    if (/^\s*(?:I vote|I'm voting|I am voting|My vote is)\b/i.test(vote.text)) {
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

  const roleCounts = countRoles(game);
  if (game.phase === "game-over" && (roleCounts.mafia !== 2 || roleCounts.detective !== 1 || roleCounts.doctor !== 1 || roleCounts.villager !== 2)) {
    observations.push(`bad role distribution: ${JSON.stringify(roleCounts)}`);
  }

  const tableText = entries.map((entry) => entry.text).join("\n");
  const stockPhraseCount = (tableText.match(/\b(fog|perfume|clean pair|clean name)\b/gi) ?? []).length;
  if (stockPhraseCount > 10) {
    observations.push(`stock phrase repetition too high: ${stockPhraseCount}`);
  }

  return observations;
}

function auditPrivateNotes(game) {
  const observations = [];
  const human = humanPlayer(game);
  const roleCounts = countRoles(game);
  const privateNotes = game.transcript.filter((entry) => entry.privateTo?.includes(human.id));

  if (roleCounts.mafia === 2 && human.role === "mafia") {
    const partnerNote = privateNotes.find((entry) => /Your Mafia partner is/i.test(entry.text));
    if (!partnerNote) {
      observations.push("human Mafia private note did not name the Mafia partner");
    }
  }

  for (const entry of privateNotes) {
    if (/You are the only Mafia/i.test(entry.text) && roleCounts.mafia === 2) {
      observations.push(`stale solo-Mafia private note: ${entry.text}`);
    }
    if (/\bplayer_[0-9]+\b/i.test(entry.text)) {
      observations.push(`private note leaked storage id: ${entry.text}`);
    }
  }

  return observations;
}

function countRoles(game) {
  const counts = { mafia: 0, detective: 0, doctor: 0, villager: 0, unknown: 0 };
  for (const player of game.players) {
    counts[player.role] = (counts[player.role] ?? 0) + 1;
  }
  return counts;
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
    game.transcript.filter((entry) => entry.day === game.day && !entry.privateTo?.length && entry.kind === "speech").at(-1) ??
    game.transcript.filter((entry) => entry.day === game.day && !entry.privateTo?.length && entry.kind === "narration").at(-1)
  );
}

function mentionsHuman(text, humanName) {
  return new RegExp(`\\b${escapeRegExp(humanName)}\\b`, "i").test(text);
}

function pickLine(game, key, options) {
  const transcriptSize = visibleTranscript(game).length;
  const humanSpeechCount = visibleTranscript(game).filter((entry) => entry.kind === "speech" && entry.speakerId === "player_6").length;
  const latest = latestPublicSpeech(game);
  const source = `${game.seed}:${key}:${transcriptSize}:${humanSpeechCount}:${latest?.speakerId ?? "none"}`;
  return options[Math.abs(hashString(source)) % options.length];
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return hash;
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
