# Voice

Voice in the current app is direct TTS playback for NPCs and narration. It is not an ElevenLabs Agent/WebRTC session and does not use multi-voice XML tags.

## Playback Order

1. The game appends a public narration or speech transcript entry.
2. `GameShell` notices the latest public entry.
3. If sound is muted, playback is skipped.
4. If voice mode is ElevenLabs, the browser posts `{ speakerId, text }` to `/api/speak`.
5. If `/api/speak` returns audio, the browser plays it and caches the blob for the session.
6. If ElevenLabs is unavailable, browser speech synthesis is used.

## Environment

```env
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.4

ELEVENLABS_API_KEY=
ELEVENLABS_TTS_MODEL=eleven_flash_v2_5
ELEVENLABS_MAX_TTS_CHARS=900
ELEVENLABS_VOICE_NARRATOR=
ELEVENLABS_VOICE_DON_VITO=
ELEVENLABS_VOICE_SALVATORE=
ELEVENLABS_VOICE_ROSA=
ELEVENLABS_VOICE_VINCENZO=
ELEVENLABS_VOICE_CARMELA=
```

Only NPCs and the narrator need ElevenLabs voice IDs. Human speech is submitted as text and appears in the transcript.

## Fallbacks

- Missing ElevenLabs key or speaker voice ID: return JSON fallback and use browser speech.
- Oversized text: return JSON fallback and use browser speech.
- ElevenLabs request failure: return JSON fallback and use browser speech.
- Missing OpenAI key: NPCs use deterministic persona fallback lines and legal fallback actions.

## Current Non-Goals

- ElevenLabs Agents Platform.
- WebRTC conversation session.
- Scribe STT.
- Multi-voice XML tags.
- Custom LLM SSE.
- Server/client tool webhooks.
- Generated music/SFX APIs.
