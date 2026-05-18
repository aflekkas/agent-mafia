import { GameState, Player, PlayerId } from "@/lib/game/types";
import { legalTargets, privateKnowledgeFor, publicTranscriptSummary } from "@/lib/game/selectors";
import { PERSONAS } from "./personas";

export function buildNpcPrompt(state: GameState, player: Player): string {
  const persona = PERSONAS[player.id as Exclude<PlayerId, "player_6">];
  const alive = state.players
    .filter((candidate) => candidate.alive)
    .map((candidate) => `${candidate.name}${candidate.id === player.id ? " (you)" : ""}`)
    .join(", ");
  const legalVoteTargets = legalTargets(state, player.id, "vote").map((id) => nameFor(state, id));
  const roleActionTargets = roleActionTargetNames(state, player);

  return [
    `You are ${player.name}, an AI NPC in a 6-player Mafia game set at a noir Palermo table.`,
    `Your style: ${persona.style}`,
    "You must play to win according to your secret role while staying entertaining for the human player.",
    "Never reveal hidden roles unless the public transcript already revealed them.",
    "Keep public speech to 1-2 short sentences.",
    "Output only valid JSON. No markdown.",
    "",
    `Current day: ${state.day}`,
    `Current phase: ${state.phase}`,
    `Alive players: ${alive}`,
    privateKnowledgeFor(state, player.id),
    "",
    `Recent public transcript:\n${publicTranscriptSummary(state) || "No one has spoken yet."}`,
    latestHumanInstruction(state),
    "",
    `Legal vote targets by name: ${legalVoteTargets.join(", ") || "none"}`,
    `Legal role-action targets by name: ${roleActionTargets.join(", ") || "none"}`,
    "",
    "Return JSON with this exact shape:",
    '{ "inner_monologue": "private thought", "speech": "public speech", "vote": null, "role_action": null }',
    "For day-vote, set vote to a player id from the legal list.",
    "For night action, set role_action to a player id from the legal list.",
    "For day-discussion, vote and role_action must be null.",
    `Valid player ids: ${state.players.map((candidate) => candidate.id).join(", ")}`
  ].join("\n");
}

function latestHumanInstruction(state: GameState): string {
  const latestHuman = state.transcript
    .filter((entry) => entry.speakerId === "player_6" && entry.kind === "speech")
    .at(-1);

  if (!latestHuman) {
    return "Player 6 has not spoken publicly yet. Notice that silence if it matters.";
  }

  return [
    `Player 6 most recently said: "${latestHuman.text}"`,
    "You should react to Player 6's actual words when relevant. If they were vague, call that out. If they accused someone, defend, agree, or redirect."
  ].join("\n");
}

function roleActionTargetNames(state: GameState, player: Player): string[] {
  if (player.role === "mafia") {
    return legalTargets(state, player.id, "mafia-kill").map((id) => nameFor(state, id));
  }
  if (player.role === "doctor") {
    return legalTargets(state, player.id, "doctor-save").map((id) => nameFor(state, id));
  }
  if (player.role === "detective") {
    return legalTargets(state, player.id, "detective-investigate").map((id) => nameFor(state, id));
  }
  return [];
}

function nameFor(state: GameState, id: PlayerId): string {
  return state.players.find((player) => player.id === id)?.name ?? id;
}
