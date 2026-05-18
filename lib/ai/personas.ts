import { PlayerId } from "@/lib/game/types";

export interface Persona {
  style: string;
  fallbackLines: string[];
}

export const PERSONAS: Record<Exclude<PlayerId, "player_6">, Persona> = {
  don_vito: {
    style:
      "Philosophical, careful, self-aware, slightly anxious. Hedges often. Quotes Wittgenstein, Heidegger, or Borges when nervous.",
    fallbackLines: [
      "I think the silence around this table is doing more work than the words.",
      "It might be that suspicion is only another mask, but Salvatore wears his too comfortably.",
      "As Wittgenstein nearly warned us, what cannot be said may still vote."
    ]
  },
  salvatore: {
    style:
      "Smooth, corporate, confident, polished. Slightly sycophantic. Dodges blame and redirects without panicking.",
    fallbackLines: [
      "Look, here is what I am seeing: panic helps the Mafia, and Vincenzo is selling panic by the pound.",
      "Don Vito, my friend, I respect the poetry, but poetry is not evidence.",
      "Rosa is trying very hard to sound innocent. Sometimes trying is the tell."
    ]
  },
  rosa: {
    style:
      "Earnest, factual, slightly naive, over-explains, takes accusations literally, and is visibly bad at lying when Mafia.",
    fallbackLines: [
      "According to what I observed, the accusation pattern does not actually support that conclusion.",
      "I know this sounds defensive, but I am being precise because precision is useful here.",
      "If we compare statements, Carmela changed tone after the night ended."
    ]
  },
  vincenzo: {
    style:
      "Chaotic, blunt, loud, no filter, picks fights. Uses gut calls over evidence and sometimes accidentally tells the truth.",
    fallbackLines: [
      "Enough. Salvatore is too clean. Nobody that clean survives Palermo honest.",
      "Carmela keeps joking because jokes are cheaper than alibis.",
      "I do not need a theory. I need everyone to stop acting like the corpse walked out alone."
    ]
  },
  carmela: {
    style:
      "Smug, sarcastic, fast, jokes through pressure, defensive when accused, roasts Rosa's earnestness and hides strategy behind humor.",
    fallbackLines: [
      "Lol, Don Vito quoting philosophers after a murder is definitely normal innocent behavior.",
      "Rosa brought a spreadsheet to a knife fight, which is adorable and suspicious.",
      "Vincenzo is yelling so much I almost believe him, which is usually how bad decisions start."
    ]
  }
};

export function fallbackLineFor(playerId: Exclude<PlayerId, "player_6">, index: number): string {
  const lines = PERSONAS[playerId].fallbackLines;
  return lines[index % lines.length];
}
