import { SpeakerId } from "@/lib/game/types";

export function voiceIdForSpeaker(speakerId: SpeakerId): string | undefined {
  const envMap: Partial<Record<SpeakerId, string | undefined>> = {
    narrator: process.env.ELEVENLABS_VOICE_NARRATOR,
    don_vito: process.env.ELEVENLABS_VOICE_DON_VITO,
    salvatore: process.env.ELEVENLABS_VOICE_SALVATORE,
    rosa: process.env.ELEVENLABS_VOICE_ROSA,
    vincenzo: process.env.ELEVENLABS_VOICE_VINCENZO,
    carmela: process.env.ELEVENLABS_VOICE_CARMELA
  };

  return envMap[speakerId];
}
