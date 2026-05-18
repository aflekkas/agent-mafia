import { Player, PlayerId } from "./types";

export interface SpeechStance {
  kind: "pressure" | "defense";
  self: string;
  target: string;
  ledger: string;
}

export function mentionedPlayersInText(players: Player[], text: string, speakerId?: PlayerId): Player[] {
  const normalized = normalizeSpeech(text);
  return players.filter((player) => player.id !== speakerId && player.alive && mentionsPlayer(normalized, player));
}

export function mentionsPlayer(normalizedText: string, player: Player): boolean {
  const fullName = normalizeSpeech(player.name);
  const firstName = fullName.split(" ")[0];
  return wordIncludes(normalizedText, fullName) || wordIncludes(normalizedText, firstName);
}

export function analyzeSpeechStance(text: string): SpeechStance {
  const lowered = normalizeSpeech(text);
  const defense =
    /\b(trust|believe|innocent|clear|cleared|not mafia|not the mafia|isn't mafia|is not mafia|leave .* alone|wrong about|back off)\b/.test(
      lowered
    );
  const accusation =
    /\b(mafia|lying|liar|lie|suspicious|suspect|guilty|dodg|cover|alibi|knife|murder|corpse|quiet|too clean|changed|performance|voted|panic|bullshit|damn)\b/.test(
      lowered
    );
  const question = /[?]|\b(why|what|how|explain|answer|tell me)\b/.test(lowered);

  if (defense && !accusation) {
    return { kind: "defense", self: "defended", target: "defended", ledger: "defended" };
  }
  if (question && accusation) {
    return { kind: "pressure", self: "pressed", target: "pressed", ledger: "pressed" };
  }
  if (question) {
    return { kind: "pressure", self: "questioned", target: "questioned", ledger: "questioned" };
  }
  if (defense) {
    return { kind: "defense", self: "defended", target: "defended", ledger: "defended" };
  }
  if (accusation) {
    return { kind: "pressure", self: "challenged", target: "challenged", ledger: "challenged" };
  }
  return { kind: "pressure", self: "challenged", target: "challenged", ledger: "addressed" };
}

export function shortQuote(text: string, maxLength = 96): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 3)}...` : compact;
}

export function normalizeSpeech(text: string): string {
  return text.toLowerCase().replace(/[’]/g, "'");
}

function wordIncludes(text: string, value: string): boolean {
  if (!value) {
    return false;
  }

  return new RegExp(`(^|\\W)${escapeRegExp(value)}(\\W|$)`, "i").test(text);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
