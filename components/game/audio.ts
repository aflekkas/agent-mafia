import { BrowserVoiceProfile, Player, SpeakerId, TranscriptEntry } from "@/lib/game/types";
import type { CharacterProfile } from "@/lib/characters/profiles";
import { VoiceMode } from "./types";

type BrowserVoiceGender = "masculine" | "feminine";

const SPEAKER_VOICE_PREFERENCES: Partial<Record<SpeakerId, { gender: BrowserVoiceGender; names: string[] }>> = {
  narrator: {
    gender: "masculine",
    names: ["Daniel", "Fred", "Grandpa", "Google UK English Male", "Microsoft George", "Microsoft David"]
  },
  don_vito: {
    gender: "masculine",
    names: ["Daniel", "Google UK English Male", "Microsoft George", "Alex", "Microsoft David"]
  },
  salvatore: {
    gender: "masculine",
    names: ["Alex", "Microsoft Guy", "Microsoft David", "Google UK English Male", "Tom"]
  },
  rosa: {
    gender: "feminine",
    names: ["Samantha", "Victoria", "Google US English", "Microsoft Jenny", "Microsoft Zira"]
  },
  vincenzo: {
    gender: "masculine",
    names: ["Fred", "Ralph", "Microsoft Guy", "Alex", "Microsoft David"]
  },
  carmela: {
    gender: "feminine",
    names: ["Samantha", "Victoria", "Microsoft Aria", "Microsoft Jenny", "Google US English"]
  }
};

const GENDERED_BROWSER_VOICE_NAMES: Record<BrowserVoiceGender, string[]> = {
  masculine: [
    "Alex",
    "Daniel",
    "Fred",
    "George",
    "Google UK English Male",
    "Grandpa",
    "Guy",
    "Microsoft David",
    "Microsoft George",
    "Microsoft Guy",
    "Ralph",
    "Thomas",
    "Tom"
  ],
  feminine: [
    "Allison",
    "Aria",
    "Ava",
    "Google US English",
    "Jenny",
    "Karen",
    "Moira",
    "Samantha",
    "Susan",
    "Tessa",
    "Victoria",
    "Zira"
  ]
};

const browserVoiceCache = new Map<string, SpeechSynthesisVoice | null>();

export async function speakEntry(
  entry: TranscriptEntry,
  voiceMode: VoiceMode,
  elevenLabsAudioCache: Map<string, Blob>,
  setStatus: (status: string) => void,
  players: Player[] = []
) {
  if (entry.kind !== "speech" && entry.kind !== "narration" && entry.kind !== "vote") {
    return;
  }

  if (voiceMode === "off") {
    return;
  }

  const speaker = players.find((player) => player.id === entry.speakerId);

  if (voiceMode === "elevenlabs") {
    const explicitVoiceId = speaker?.voiceId;
    const cacheKey = explicitVoiceId ? `${explicitVoiceId}:${entry.text}` : undefined;
    const cachedAudio = cacheKey ? elevenLabsAudioCache.get(cacheKey) : undefined;
    if (cachedAudio) {
      await playAudioBlob(cachedAudio);
      setStatus("Played cached ElevenLabs voice.");
      return;
    }

    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: entry.speakerId,
          voiceId: speaker?.voiceId,
          text: entry.text
        })
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("audio/")) {
        const blob = await response.blob();
        if (cacheKey) {
          elevenLabsAudioCache.set(cacheKey, blob);
        }
        await playAudioBlob(blob);
        setStatus("Played ElevenLabs voice.");
        return;
      }
    } catch {
      // Browser speech fallback below.
    }
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(browserSpeechTextFor(entry));
    utterance.rate = browserVoiceRateFor(entry.speakerId, speaker?.browserVoice);
    utterance.pitch = pitchFor(entry.speakerId, speaker?.browserVoice);
    utterance.volume = entry.speakerId === "narrator" ? 0.92 : 1;
    utterance.voice = browserVoiceFor(entry.speakerId, speaker?.browserVoice);
    setStatus(voiceMode === "elevenlabs" ? "ElevenLabs unavailable; played browser voice." : "Played browser voice.");
    await playBrowserUtterance(utterance);
  }
}

export async function speakCharacterPreview({
  speakerId,
  profile,
  elevenLabsAudioCache
}: {
  speakerId: SpeakerId;
  profile: CharacterProfile;
  elevenLabsAudioCache: Map<string, Blob>;
}) {
  const text = previewSpeechTextFor(profile);
  const requestSpeakerId = profile.voiceId ? undefined : speakerId;
  const cacheKey = `${profile.voiceId ?? `seat:${speakerId}`}:${text}`;
  const cachedAudio = elevenLabsAudioCache.get(cacheKey);

  if (cachedAudio) {
    await playAudioBlob(cachedAudio);
    return;
  }

  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        speakerId: requestSpeakerId,
        voiceId: profile.voiceId,
        text
      })
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (response.ok && contentType.includes("audio/")) {
      const blob = await response.blob();
      elevenLabsAudioCache.set(cacheKey, blob);
      await playAudioBlob(blob);
      return;
    }
  } catch {
    // Browser speech fallback below.
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = browserVoiceRateFor(speakerId, profile.browserVoice);
    utterance.pitch = pitchFor(speakerId, profile.browserVoice);
    utterance.volume = 1;
    utterance.voice = browserVoiceFor(speakerId, profile.browserVoice);
    await playBrowserUtterance(utterance);
  }
}

function previewSpeechTextFor(profile: CharacterProfile): string {
  return profile.fallbackLines[0] ?? `${profile.name}. I am listening to every silence at this table.`;
}

function browserSpeechTextFor(entry: TranscriptEntry): string {
  if (entry.kind === "vote" && entry.speakerId !== "player_6") {
    return entry.text;
  }

  return `${entry.speakerName}. ${entry.text}`;
}

async function playAudioBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed."));
      void audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function playBrowserUtterance(utterance: SpeechSynthesisUtterance) {
  await new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
}

function pitchFor(speakerId: SpeakerId, profile?: BrowserVoiceProfile): number {
  if (profile?.pitch) {
    return profile.pitch;
  }
  if (speakerId === "rosa") {
    return 1.18;
  }
  if (speakerId === "carmela") {
    return 1.08;
  }
  if (speakerId === "vincenzo") {
    return 0.78;
  }
  if (speakerId === "narrator" || speakerId === "don_vito") {
    return 0.72;
  }
  return 0.95;
}

function browserVoiceRateFor(speakerId: SpeakerId, profile?: BrowserVoiceProfile): number {
  if (profile?.rate) {
    return profile.rate;
  }
  if (speakerId === "vincenzo") {
    return 1.12;
  }
  if (speakerId === "carmela") {
    return 1.06;
  }
  if (speakerId === "rosa") {
    return 1.03;
  }
  if (speakerId === "narrator") {
    return 0.78;
  }
  if (speakerId === "don_vito") {
    return 0.86;
  }
  return 0.94;
}

function browserVoiceFor(speakerId: SpeakerId, profile?: BrowserVoiceProfile): SpeechSynthesisVoice | null {
  const cacheKey = `${speakerId}:${profile?.names.join("|") ?? "default"}`;
  if (browserVoiceCache.has(cacheKey)) {
    return browserVoiceCache.get(cacheKey) ?? null;
  }

  const voices = window.speechSynthesis.getVoices();
  const preference = profile ?? SPEAKER_VOICE_PREFERENCES[speakerId];
  const preferred = preference?.names ?? [];
  const genderedFallbacks = preference ? GENDERED_BROWSER_VOICE_NAMES[preference.gender] : [];

  const selected =
    findVoiceByName(voices, preferred) ??
    findVoiceByName(voices, genderedFallbacks) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en") && voice.localService) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null;

  if (selected || voices.length > 0) {
    browserVoiceCache.set(cacheKey, selected);
  }

  return selected;
}

function findVoiceByName(voices: SpeechSynthesisVoice[], names: string[]): SpeechSynthesisVoice | undefined {
  return names
    .map((name) => voices.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase())))
    .find(Boolean);
}
