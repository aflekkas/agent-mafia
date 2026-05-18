# Voice

Voice in the current app is direct TTS playback for NPCs and narration. It is not an ElevenLabs Agent/WebRTC session and does not use multi-voice XML tags.

## Playback Order

1. The game appends a public narration or speech transcript entry.
2. `GameShell` notices the latest public entry.
3. If sound is muted, playback is skipped.
4. If voice mode is Off, voice playback is skipped while ambience and UI sound effects can still play.
5. If voice mode is ElevenLabs, the browser posts `{ speakerId, text }` to `/api/speak`.
6. If `/api/speak` returns audio, the browser plays it and caches the blob for the session.
7. If ElevenLabs is unavailable, browser speech synthesis is used.

## Environment

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4-mini
OPENAI_API_MODE=responses
OPENAI_REASONING_EFFORT=low
OPENAI_MAX_OUTPUT_TOKENS=900
OPENAI_TEMPERATURE=0.62

ELEVENLABS_API_KEY=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_MAX_TTS_CHARS=900
ELEVENLABS_TTS_CACHE_ENABLED=true
ELEVENLABS_TTS_CACHE_DIR=.agent-mafia-cache/tts
ELEVENLABS_VOICE_NARRATOR=
ELEVENLABS_VOICE_DON_VITO=
ELEVENLABS_VOICE_SALVATORE=
ELEVENLABS_VOICE_ROSA=
ELEVENLABS_VOICE_VINCENZO=
ELEVENLABS_VOICE_CARMELA=
```

Only NPCs and the narrator need ElevenLabs voice IDs. Human speech is submitted as text and appears in the transcript.

## Human Dictation

The Use Mic button is a browser speech-recognition helper only. It requests microphone permission with `getUserMedia`, starts the browser `SpeechRecognition`/`webkitSpeechRecognition` API, and writes recognized words into the human text box. The player can edit the text before submitting.

Dictation requires a supported browser and a secure context such as `localhost` or HTTPS. If permission is blocked, no microphone is available, no speech is heard, or the browser speech service is unavailable, the UI reports that status and the player can keep typing.

## TTS Cache

`/api/speak` caches successful ElevenLabs MP3 responses on disk. The cache key includes speaker, voice ID, model, output format, voice settings, and normalized text, so repeated static narrator lines and repeated fallback/persona lines play without a new ElevenLabs request.

By default cache files are written under `.agent-mafia-cache/tts`, which is ignored by git. Set `ELEVENLABS_TTS_CACHE_ENABLED=false` to bypass the server cache.

## Fallbacks

- Missing ElevenLabs key or speaker voice ID: return JSON fallback and use browser speech.
- Oversized text: return JSON fallback and use browser speech.
- ElevenLabs request failure: return JSON fallback and use browser speech.
- Missing OpenAI key: NPCs use deterministic persona fallback lines and legal fallback actions.

## NPC Model

NPC turns default to `gpt-5.4-mini` through the OpenAI Responses API with `OPENAI_REASONING_EFFORT=low`. This keeps the model reasoning-capable without using the flagship `gpt-5.4` model for every table turn.

Hot-swap knobs:

- `OPENAI_MODEL` - any compatible OpenAI model ID.
- `OPENAI_API_MODE=responses` - default and preferred for reasoning models.
- `OPENAI_API_MODE=chat` - fallback path for Chat Completions-compatible models.
- `OPENAI_REASONING_EFFORT=low|medium|high` - use `medium` only if table strategy still feels too shallow.
- `OPENAI_MAX_OUTPUT_TOKENS` - includes hidden reasoning tokens for reasoning models.
- `OPENAI_TEMPERATURE` - only used on the Chat Completions fallback path.

## Current Non-Goals

- ElevenLabs Agents Platform.
- WebRTC conversation session.
- Scribe STT.
- Multi-voice XML tags.
- Custom LLM SSE.
- Server/client tool webhooks.
- Generated music/SFX APIs.
