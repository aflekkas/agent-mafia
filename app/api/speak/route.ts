import { NextResponse } from "next/server";
import { voiceIdForSpeaker } from "@/lib/voice/voice-map";
import { SpeakerId } from "@/lib/game/types";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    speakerId?: SpeakerId;
    text?: string;
  };
  const text = body.text?.trim();
  const voiceId = body.speakerId ? voiceIdForSpeaker(body.speakerId) : undefined;

  if (!process.env.ELEVENLABS_API_KEY || !voiceId || !text) {
    return NextResponse.json({
      fallback: true,
      reason: !text ? "No text supplied." : "ElevenLabs key or speaker voice id is not configured."
    });
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "xi-api-key": process.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5",
      output_format: "mp3_44100_128",
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.72,
        style: 0.35,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok || !response.body) {
    return NextResponse.json({
      fallback: true,
      reason: `ElevenLabs TTS failed with ${response.status}.`
    });
  }

  return new Response(response.body, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store"
    }
  });
}
