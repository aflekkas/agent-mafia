import { CharacterSetup, NPC_PLAYER_IDS, NpcPlayerId, BrowserVoiceProfile } from "@/lib/game/types";
import characterData from "./data.json";

export interface CharacterProfile {
  id: string;
  name: string;
  summary: string;
  style: string;
  fallbackLines: string[];
  portraitSrc: string;
  voiceId?: string;
  browserVoice: BrowserVoiceProfile;
  imagePrompt: string;
}

export const CHARACTER_PROFILES = characterData as CharacterProfile[];

export const CHARACTER_PORTRAIT_STYLE_PROMPT =
  "Square 1:1 pixel-art portrait for Agent Mafia, 16-bit noir game sprite style, crisp chunky pixels, limited Palermo candlelight palette of black, brass gold, cream, and deep red accents, head-and-shoulders character seated at a Mafia table, strong readable silhouette, dark simple background, readable at 46px and 96px, no text, no UI, no photorealism, no painterly blending, no smooth gradients.";

export function characterPortraitGenerationPrompt(profile: CharacterProfile): string {
  return `${profile.imagePrompt} ${CHARACTER_PORTRAIT_STYLE_PROMPT}`;
}

export const DEFAULT_CHARACTER_SETUP: Record<NpcPlayerId, string> = {
  don_vito: "don_vito",
  salvatore: "salvatore",
  rosa: "rosa",
  vincenzo: "vincenzo",
  carmela: "carmela"
};

export const CHARACTER_PRESETS: { id: string; name: string; setup: Record<NpcPlayerId, string> }[] = [
  {
    id: "classic",
    name: "Classic Palermo",
    setup: DEFAULT_CHARACTER_SETUP
  },
  {
    id: "greek-table",
    name: "Greek Table",
    setup: {
      don_vito: "deep-greek-male",
      salvatore: "normal-greek-guy",
      rosa: "wispy-greek-woman",
      vincenzo: "grumpy-greek-guy",
      carmela: "female-greek"
    }
  },
  {
    id: "chaos",
    name: "Chaos Table",
    setup: {
      don_vito: "goofy-supervillain",
      salvatore: "american-dumb-bro",
      rosa: "cute-anime-girls",
      vincenzo: "german-big-guy",
      carmela: "pastel-pony"
    }
  }
];

export function characterProfileById(characterId: string | undefined): CharacterProfile | undefined {
  return CHARACTER_PROFILES.find((profile) => profile.id === characterId);
}

export function characterProfileForSeat(seatId: NpcPlayerId, setup: CharacterSetup = {}): CharacterProfile {
  const requestedId = setup[seatId] ?? DEFAULT_CHARACTER_SETUP[seatId];
  return characterProfileById(requestedId) ?? characterProfileById(DEFAULT_CHARACTER_SETUP[seatId]) ?? CHARACTER_PROFILES[0];
}

export function normalizeCharacterSetup(setup: CharacterSetup | undefined): Record<NpcPlayerId, string> {
  const usedIds = new Set<string>();
  return NPC_PLAYER_IDS.reduce((nextSetup, seatId) => {
    const requestedProfile = characterProfileForSeat(seatId, setup);
    const profile = usedIds.has(requestedProfile.id) ? firstAvailableProfile(usedIds, seatId) : requestedProfile;
    usedIds.add(profile.id);
    return {
      ...nextSetup,
      [seatId]: profile.id
    };
  }, {} as Record<NpcPlayerId, string>);
}

function firstAvailableProfile(usedIds: Set<string>, seatId: NpcPlayerId): CharacterProfile {
  const defaultProfile = characterProfileById(DEFAULT_CHARACTER_SETUP[seatId]);
  if (defaultProfile && !usedIds.has(defaultProfile.id)) {
    return defaultProfile;
  }

  return CHARACTER_PROFILES.find((profile) => !usedIds.has(profile.id)) ?? CHARACTER_PROFILES[0];
}

export function uniqueRandomCharacterSetup(): Record<NpcPlayerId, string> {
  const shuffled = [...CHARACTER_PROFILES].sort(() => Math.random() - 0.5);

  return NPC_PLAYER_IDS.reduce(
    (setup, seatId, index) => ({
      ...setup,
      [seatId]: shuffled[index % shuffled.length].id
    }),
    {} as Record<NpcPlayerId, string>
  );
}
