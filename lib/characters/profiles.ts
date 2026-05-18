import { CharacterSetup, NPC_PLAYER_IDS, NpcPlayerId, BrowserVoiceProfile } from "@/lib/game/types";
import characterData from "./data.json";

export interface CharacterProfile {
  id: string;
  name: string;
  summary: string;
  style: string;
  fallbackLines: string[];
  portraitSrc: string;
  spriteSheetSrc?: string;
  voiceId?: string;
  packIds?: CharacterPackId[];
  chaosTier?: 1 | 2 | 3;
  voiceTone?: string;
  browserVoice: BrowserVoiceProfile;
  imagePrompt: string;
}

export const CHARACTER_PROFILES = characterData as CharacterProfile[];

export type CharacterPackId =
  | "classic-palermo"
  | "chaos-core"
  | "world-tour-weirdos"
  | "cartoon-crime-table"
  | "office-hell-mafia"
  | "mythic-reroll-chaos"
  | "flirty-noir"
  | "checked-out-table"
  | "gen-z-chaos"
  | "trap-cypher"
  | "short-form-mob"
  | "random-reroll";

export const CHARACTER_PACKS: { id: CharacterPackId; name: string; summary: string }[] = [
  {
    id: "classic-palermo",
    name: "Classic Palermo",
    summary: "Original noir table personalities"
  },
  {
    id: "chaos-core",
    name: "Chaos Core",
    summary: "Existing reroll oddballs"
  },
  {
    id: "world-tour-weirdos",
    name: "World Tour",
    summary: "Accented international table chaos"
  },
  {
    id: "cartoon-crime-table",
    name: "Cartoon Crimes",
    summary: "Mascot-grade suspicious nonsense"
  },
  {
    id: "office-hell-mafia",
    name: "Office Hell",
    summary: "Corporate dysfunction with knives"
  },
  {
    id: "mythic-reroll-chaos",
    name: "Mythic Reroll",
    summary: "Fantasy-adjacent table disasters"
  },
  {
    id: "flirty-noir",
    name: "Flirty Noir",
    summary: "Seductive, freaky lounge-table pressure"
  },
  {
    id: "checked-out-table",
    name: "Checked Out",
    summary: "Barely playing, accidentally lethal"
  },
  {
    id: "gen-z-chaos",
    name: "Gen Z Chaos",
    summary: "Fast slang, memes, and sharp suspicion"
  },
  {
    id: "trap-cypher",
    name: "Trap Cypher",
    summary: "Fictional rappers and trap-table punchlines"
  },
  {
    id: "short-form-mob",
    name: "Short-Form Mob",
    summary: "Viral boss energy without real-person likenesses"
  },
  {
    id: "random-reroll",
    name: "Random Reroll",
    summary: "Surreal one-off table weirdness"
  }
];

export const CHARACTER_RANDOM_PRESETS: { id: string; name: string; packIds?: CharacterPackId[] }[] = [
  {
    id: "balanced-chaos",
    name: "Balanced Chaos",
    packIds: [
      "world-tour-weirdos",
      "cartoon-crime-table",
      "office-hell-mafia",
      "mythic-reroll-chaos",
      "flirty-noir",
      "checked-out-table",
      "gen-z-chaos",
      "trap-cypher",
      "short-form-mob",
      "random-reroll",
      "chaos-core"
    ]
  },
  {
    id: "world-tour",
    name: "World Tour",
    packIds: ["world-tour-weirdos"]
  },
  {
    id: "cartoon-crimes",
    name: "Cartoon Crimes",
    packIds: ["cartoon-crime-table"]
  },
  {
    id: "office-hell",
    name: "Office Hell",
    packIds: ["office-hell-mafia"]
  },
  {
    id: "mythic-reroll",
    name: "Mythic Reroll",
    packIds: ["mythic-reroll-chaos"]
  },
  {
    id: "flirty-noir",
    name: "Flirty Noir",
    packIds: ["flirty-noir"]
  },
  {
    id: "checked-out",
    name: "Checked Out",
    packIds: ["checked-out-table"]
  },
  {
    id: "gen-z",
    name: "Gen Z",
    packIds: ["gen-z-chaos"]
  },
  {
    id: "trap-cypher",
    name: "Trap Cypher",
    packIds: ["trap-cypher"]
  },
  {
    id: "mob-shorts",
    name: "Mob Shorts",
    packIds: ["short-form-mob"]
  },
  {
    id: "random-reroll",
    name: "Random Reroll",
    packIds: ["random-reroll"]
  },
  {
    id: "full-roulette",
    name: "Full Roulette"
  }
];

const DEFAULT_PROFILE_PACKS: Partial<Record<string, CharacterPackId[]>> = {
  don_vito: ["classic-palermo"],
  salvatore: ["classic-palermo"],
  rosa: ["classic-palermo"],
  vincenzo: ["classic-palermo"],
  carmela: ["classic-palermo"],
  "cute-anime-girls": ["chaos-core"],
  "german-big-guy": ["chaos-core"],
  "american-dumb-bro": ["chaos-core"],
  "abrasive-sarah": ["chaos-core"],
  "turkish-berlin-guy": ["chaos-core", "world-tour-weirdos"],
  "stern-eastern-statesman": ["chaos-core"],
  "goofy-supervillain": ["chaos-core", "cartoon-crime-table"],
  "pastel-pony": ["chaos-core", "cartoon-crime-table"],
  "annoyed-male": ["chaos-core", "office-hell-mafia"],
  "clark-anime-hero": ["chaos-core", "mythic-reroll-chaos"],
  "sultry-american-female": ["chaos-core"]
};

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

export function characterPackIdsForProfile(profile: CharacterProfile): CharacterPackId[] {
  return profile.packIds?.length ? profile.packIds : (DEFAULT_PROFILE_PACKS[profile.id] ?? ["chaos-core"]);
}

export function characterProfilesForPacks(packIds: CharacterPackId[] | undefined): CharacterProfile[] {
  if (!packIds?.length) {
    return CHARACTER_PROFILES;
  }

  return CHARACTER_PROFILES.filter((profile) => {
    const profilePackIds = characterPackIdsForProfile(profile);
    return packIds.some((packId) => profilePackIds.includes(packId));
  });
}

export function uniqueRandomCharacterSetup(packIds?: CharacterPackId[]): Record<NpcPlayerId, string> {
  const pool = characterProfilesForPacks(packIds);
  const seededProfiles = packIds && packIds.length > 1 ? oneProfilePerPack(packIds) : [];
  const shuffled = shuffleProfiles([...seededProfiles, ...pool.filter((profile) => !seededProfiles.includes(profile))]);
  const enoughProfiles = shuffled.length >= NPC_PLAYER_IDS.length ? shuffled : shuffleProfiles(CHARACTER_PROFILES);

  return NPC_PLAYER_IDS.reduce(
    (setup, seatId, index) => ({
      ...setup,
      [seatId]: enoughProfiles[index % enoughProfiles.length].id
    }),
    {} as Record<NpcPlayerId, string>
  );
}

function oneProfilePerPack(packIds: CharacterPackId[]): CharacterProfile[] {
  const usedIds = new Set<string>();
  return packIds
    .map((packId) => shuffleProfiles(characterProfilesForPacks([packId])).find((profile) => !usedIds.has(profile.id)))
    .filter((profile): profile is CharacterProfile => {
      if (!profile) {
        return false;
      }
      usedIds.add(profile.id);
      return true;
    });
}

function shuffleProfiles(profiles: CharacterProfile[]): CharacterProfile[] {
  const shuffled = [...profiles];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
