import OpenAI from "openai";
import { z } from "zod";
import { GameState, NpcTurn, Player, PlayerId } from "@/lib/game/types";
import { legalTargets } from "@/lib/game/selectors";
import { fallbackLineFor } from "./personas";
import { buildNpcPrompt } from "./prompts";

const turnSchema = z.object({
  inner_monologue: z.string().min(1).max(600),
  speech: z.string().min(1).max(700),
  vote: z.string().nullable(),
  role_action: z.string().nullable()
});

let client: OpenAI | undefined;

export async function generateNpcTurn(state: GameState, player: Player): Promise<NpcTurn> {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackNpcTurn(state, player, "OpenAI key is not configured.");
  }

  try {
    client ??= new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "You generate one compact Mafia NPC turn. You are state-aware, theatrical, and strict about JSON output."
        },
        {
          role: "user",
          content: buildNpcPrompt(state, player)
        }
      ],
      temperature: 0.85,
      max_tokens: 420,
      response_format: {
        type: "json_object"
      }
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      return fallbackNpcTurn(state, player, "OpenAI returned no content.");
    }

    const parsed = turnSchema.parse(JSON.parse(raw));
    return normalizeTurn(state, player, parsed);
  } catch (error) {
    return fallbackNpcTurn(state, player, error instanceof Error ? error.message : "OpenAI generation failed.");
  }
}

function normalizeTurn(
  state: GameState,
  player: Player,
  parsed: z.infer<typeof turnSchema>
): NpcTurn {
  const legalVoteTargets = legalTargets(state, player.id, "vote");
  const legalRoleTargets = roleActionTargets(state, player);
  const vote = parsed.vote && isPlayerId(parsed.vote) && legalVoteTargets.includes(parsed.vote) ? parsed.vote : null;
  const roleAction =
    parsed.role_action && isPlayerId(parsed.role_action) && legalRoleTargets.includes(parsed.role_action)
      ? parsed.role_action
      : null;

  return {
    inner_monologue: parsed.inner_monologue.trim(),
    speech: parsed.speech.trim(),
    vote,
    role_action: roleAction
  };
}

function fallbackNpcTurn(state: GameState, player: Player, reason: string): NpcTurn {
  const legalVoteTargets = legalTargets(state, player.id, "vote");
  const legalRoleTargets = roleActionTargets(state, player);
  const target = chooseFallbackTarget(state, legalVoteTargets, player.id);
  const roleTarget = chooseFallbackTarget(state, legalRoleTargets, player.id);

  return {
    inner_monologue: `Fallback turn used: ${reason}`,
    speech: fallbackLineFor(player.id as Exclude<PlayerId, "player_6">, state.transcript.length + player.seat),
    vote: state.phase === "day-vote" ? target : null,
    role_action: state.phase === "night" ? roleTarget : null
  };
}

function roleActionTargets(state: GameState, player: Player): PlayerId[] {
  if (player.role === "mafia") {
    return legalTargets(state, player.id, "mafia-kill");
  }
  if (player.role === "doctor") {
    return legalTargets(state, player.id, "doctor-save");
  }
  if (player.role === "detective") {
    return legalTargets(state, player.id, "detective-investigate");
  }
  return [];
}

function chooseFallbackTarget(state: GameState, targets: PlayerId[], actorId: PlayerId): PlayerId | null {
  if (!targets.length) {
    return null;
  }

  return targets
    .map((id) => state.players.find((player) => player.id === id))
    .filter(Boolean)
    .sort((left, right) => {
      if (!left || !right) {
        return 0;
      }
      const actorBias = left.id === actorId ? 1 : 0;
      return right.suspicion - left.suspicion || actorBias || left.seat - right.seat;
    })[0]?.id ?? targets[0];
}

function isPlayerId(value: string): value is PlayerId {
  return ["don_vito", "salvatore", "rosa", "vincenzo", "carmela", "player_6"].includes(value);
}
