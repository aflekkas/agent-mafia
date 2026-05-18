import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { sanitizeTextForTranscript } from "@/lib/game/profanity";
import { voiceIdForSpeaker } from "@/lib/voice/voice-map";
import { SpeakerId } from "@/lib/game/types";

export const runtime = "nodejs";

const OUTPUT_FORMAT = "mp3_44100_128";
const DEFAULT_ELEVENLABS_TIMEOUT_MS = 8000;
const VOICE_SETTINGS = {
  stability: 0.42,
  similarity_boost: 0.72,
  style: 0.35,
  use_speaker_boost: true
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as {
    speakerId?: SpeakerId;
    voiceId?: string;
    text?: string;
  };
  const text = normalizeSpeechText(body.text);
  const voiceId = normalizeVoiceId(body.voiceId) ?? (body.speakerId ? voiceIdForSpeaker(body.speakerId) : undefined);
  const modelId = process.env.ELEVENLABS_TTS_MODEL || "eleven_flash_v2_5";
  const configuredMaxCharacters = Number.parseInt(process.env.ELEVENLABS_MAX_TTS_CHARS || "900", 10);
  const maxCharacters = Number.isFinite(configuredMaxCharacters) ? configuredMaxCharacters : 900;
  const configuredTimeout = Number.parseInt(process.env.ELEVENLABS_TTS_TIMEOUT_MS || String(DEFAULT_ELEVENLABS_TIMEOUT_MS), 10);
  const timeoutMs = Number.isFinite(configuredTimeout) ? configuredTimeout : DEFAULT_ELEVENLABS_TIMEOUT_MS;

  if (!process.env.ELEVENLABS_API_KEY || !voiceId || !text) {
    return NextResponse.json({
      fallback: true,
      reason: !text ? "No text supplied." : "ElevenLabs key or speaker voice id is not configured."
    });
  }

  if (text.length > maxCharacters) {
    return NextResponse.json({
      fallback: true,
      reason: `Text is longer than the ElevenLabs safety limit of ${maxCharacters} characters.`
    });
  }

  const cacheKey = ttsCacheKey({
    voiceId,
    modelId,
    outputFormat: OUTPUT_FORMAT,
    voiceSettings: VOICE_SETTINGS,
    text
  });
  const cacheFilePath = path.join(ttsCacheDir(), `${cacheKey}.mp3`);
  const cacheEnabled = process.env.ELEVENLABS_TTS_CACHE_ENABLED !== "false";

  if (cacheEnabled) {
    const cachedAudio = await readCachedAudio(cacheFilePath);
    if (cachedAudio) {
      return audioResponse(cachedAudio, "hit");
    }
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "xi-api-key": process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        output_format: OUTPUT_FORMAT,
        voice_settings: VOICE_SETTINGS
      })
    }, timeoutMs);
  } catch (error) {
    return NextResponse.json({
      fallback: true,
      reason: isAbortError(error) ? "ElevenLabs TTS timed out." : "ElevenLabs TTS request failed."
    });
  }

  if (!response.ok || !response.body) {
    return NextResponse.json({
      fallback: true,
      reason: `ElevenLabs TTS failed with ${response.status}.`
    });
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (cacheEnabled) {
    await writeCachedAudio(cacheFilePath, audio);
  }

  return audioResponse(audio, cacheEnabled ? "miss" : "disabled");
}

function audioResponse(audio: Uint8Array, cacheStatus: "hit" | "miss" | "disabled") {
  const body = audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "content-type": "audio/mpeg",
      "cache-control": "no-store",
      "x-agent-mafia-tts-cache": cacheStatus
    }
  });
}

function normalizeSpeechText(text: string | undefined): string | undefined {
  const normalized = text?.trim().replace(/\s+/g, " ");
  return normalized ? sanitizeTextForTranscript(normalized).text : normalized;
}

function normalizeVoiceId(voiceId: string | undefined): string | undefined {
  const normalized = voiceId?.trim();
  return normalized || undefined;
}

function ttsCacheKey(input: {
  voiceId: string;
  modelId: string;
  outputFormat: string;
  voiceSettings: typeof VOICE_SETTINGS;
  text: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function ttsCacheDir() {
  return path.join(/*turbopackIgnore: true*/ process.cwd(), process.env.ELEVENLABS_TTS_CACHE_DIR || ".agent-mafia-cache/tts");
}

async function readCachedAudio(filePath: string): Promise<Buffer | undefined> {
  try {
    return await readFile(filePath);
  } catch {
    return undefined;
  }
}

async function writeCachedAudio(filePath: string, audio: Uint8Array) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `${path.basename(filePath)}.${randomUUID()}.tmp`);

  try {
    await mkdir(directory, { recursive: true });
    await writeFile(tempPath, audio);
    await rename(tempPath, filePath);
  } catch {
    // Caching is opportunistic; playback should not fail because the cache could not be written.
  }
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
