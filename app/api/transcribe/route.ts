import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";
import { sanitizeTextForTranscript } from "@/lib/game/profanity";

export const runtime = "nodejs";

const DEFAULT_TRANSCRIPTION_MODEL = "whisper-1";
const DEFAULT_MAX_AUDIO_BYTES = 25 * 1024 * 1024;

let client: OpenAI | undefined;

export async function POST(request: Request) {
  if (process.env.MIC_INPUT_ENABLED === "false") {
    return NextResponse.json({ error: "Mic input is disabled for this local run." }, { status: 403 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is required for mic transcription." }, { status: 503 });
  }

  const formData = await request.formData().catch(() => null);
  const audio = formData?.get("audio");

  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }

  if (audio.size > maxAudioBytes()) {
    return NextResponse.json({ error: "Audio file is larger than the transcription safety limit." }, { status: 413 });
  }

  try {
    client ??= new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const upload = await toFile(Buffer.from(await audio.arrayBuffer()), safeAudioFileName(audio), {
      type: audio.type || "audio/webm"
    });
    const transcription = await client.audio.transcriptions.create({
      file: upload,
      model: transcriptionModel(),
      response_format: "json",
      language: "en"
    });
    const text = sanitizeTextForTranscript(transcription.text ?? "").text;

    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "OpenAI transcription failed." },
      { status: 502 }
    );
  }
}

function transcriptionModel(): string {
  return process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
}

function maxAudioBytes(): number {
  const configured = Number.parseInt(process.env.MIC_INPUT_MAX_AUDIO_BYTES || "", 10);

  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_AUDIO_BYTES;
}

function safeAudioFileName(audio: File): string {
  const name = audio.name.trim().toLowerCase();
  if (/\.(webm|mp4|m4a|mp3|mpeg|mpga|wav)$/i.test(name)) {
    return name;
  }
  if (audio.type.includes("mp4")) {
    return "speech.mp4";
  }
  if (audio.type.includes("mpeg")) {
    return "speech.mp3";
  }
  if (audio.type.includes("wav")) {
    return "speech.wav";
  }
  return "speech.webm";
}
