# Voices (ElevenLabs)

Voice is the runtime for NPCs and narration. ElevenLabs Agents Platform owns the live conversation playback; our backend emits multi-voice tagged dialogue via Custom LLM SSE. Four ElevenLabs products stack across the loop. Pitch hook: voice load-bearing across output, identity, and atmosphere — not bolt-on TTS. Human input stays typed.

## Stacked Product Strategy (4 products)

| Product | Used for | Why |
|---|---|---|
| **Agents Platform** | Single agent session, WebRTC, owns turn-taking + audio playback | Flagship product engagement. We BYO the LLM. |
| **Multi-voice TTS (v3 Expressive)** | 6 voices in one agent: Narrator + 5 NPCs | XML voice tags route each span to a different voice. Up to 10 voices per agent. |
| **Sound Effects** | Generative gunshot, footsteps, candle flicker, distant bells | Tied to game state. Triggered from server-tool callbacks. |
| **Music** | Atmospheric noir bed loop. Phase-transition mood. | Generative ambient. Adds film-score weight without authoring music. |

Voice Changer dropped — original use case (disguise human voice from AIs) was obsolete (LLMs are text-only, never hear tone).

## Voice Picks

Pick during prep weekend by browsing ElevenLabs voice library. Validate distinctness by playing back-to-back to a stranger.

| Persona | Voice library hint | Why |
|---|---|---|
| **Don Vito** | British male, contemplative, mid-tempo | Philosophical hedger |
| **Salvatore** | American male, smooth, polished | Sales/diplomat energy |
| **Rosa** | Mid-Atlantic, slightly faster cadence | Earnest factual |
| **Vincenzo** | Brooklyn male, gruff | Loud, blunt, picks fights |
| **Carmela** | Younger American, sarcastic, fast | Smug edgelord |
| **Narrator** | Low, measured, noir storyteller | Restrained, classic Palermo |

## Multi-Voice Tag Syntax

Source: https://elevenlabs.io/docs/eleven-agents/customization/voice/multi-voice-support

- Format: `<LABEL>text</LABEL>`
- **Case-sensitive**
- Hard cap: **10 voices per agent** (we use 6, fits)
- No spaces or special chars in labels
- Unknown label → default voice, tags ignored
- Each voice can override model family (Flash, Turbo, Multilingual)

**Canonical labels (lock these):**

```
<NARRATOR>...</NARRATOR>
<DON_VITO>...</DON_VITO>
<SALVATORE>...</SALVATORE>
<ROSA>...</ROSA>
<VINCENZO>...</VINCENZO>
<CARMELA>...</CARMELA>
```

Validation: regex `<(NARRATOR|DON_VITO|SALVATORE|ROSA|VINCENZO|CARMELA)>` server-side before forwarding SSE chunk. Reject malformed tags.

**Verification:** confirm underscore-separated labels parse correctly in the ElevenLabs Agents test playground.

## Audio Tag Mapping (per-voice, per-phase)

ElevenLabs v3 supports inline tags: `[whispers]`, `[shouting]`, `[laughing]`, `[crying]`, `[angry]`, `[sarcastic]`, `[hesitant]`, etc. Up to 20 `suggested_audio_tags` per request.

### Phase-conditional

**Day discussion:**
- Default: normal speech
- Accusations: `[indignant]` `[pointed]`
- Defenses: `[reassuring]` `[exasperated]`

**Day vote:**
- All players: `[determined]` `[final]`

**Night Mafia:**
- Mafia: `[whispers]` always
- Narrator: `[hushed]` `[ominous]` framing the kill

**Elimination:**
- Narrator: `[grave]` "The town has spoken. <name> falls."
- Eliminated: `[final]` `[devastated]` for last words
- SFX: gunshot

### Per-persona defaults

| Persona | Default tags rotation |
|---|---|
| Don Vito | `[contemplative]` `[hesitant]` `[anxious]` |
| Salvatore | `[confident]` `[reassuring]` `[diplomatic]` |
| Rosa | `[curious]` `[analytical]` `[earnest]` |
| Vincenzo | `[shouting]` `[indignant]` `[angry]` |
| Carmela | `[sarcastic]` `[smug]` `[amused]` |
| Narrator | `[ominous]` `[hushed]` `[deliberate]` `[grave]` |

## Custom LLM SSE Shape (the contract with EL Agent)

Source: https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm

**EL agent → our `/v1/chat/completions`:**

POST body:
```json
{
  "messages": [{"role": "system|user|assistant", "content": "..."}],
  "model": "...",
  "temperature": 0.7,
  "max_tokens": 2000,
  "stream": true,
  "user_id": "..."
}
```

**Our response:** `Content-Type: text/event-stream`, OpenAI chunk shape:

```
data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1234567890,"model":"...","choices":[{"delta":{"content":"<DON_VITO>I think Salvatore is too smooth.</DON_VITO>"},"index":0,"finish_reason":null}]}\n\n

data: {"id":"chatcmpl-...","object":"chat.completion.chunk","created":1234567890,"model":"...","choices":[{"delta":{"content":""},"index":0,"finish_reason":"stop"}]}\n\n

data: [DONE]\n\n
```

Implementation: Bun + Hono `streamSSE` from `hono/streaming`. Per-chunk `await stream.writeSSE({data: JSON.stringify(chunk)})`. Final `await stream.writeSSE({data: '[DONE]'})`. Wrap `stream.onAbort` (Bun crash safety per honojs/hono#3064).

Secret material (OpenAI API key) lives in EL secrets manager, NOT raw headers from us.

## Server Tools (HTTP webhooks)

Source: https://elevenlabs.io/docs/eleven-agents/customization/tools/server-tools

Tool schema:
```json
{
  "type": "webhook",
  "name": "cast_vote",
  "description": "Record a player's vote during day-vote phase",
  "api_schema": {
    "url": "http://localhost:3001/tools/cast-vote",
    "method": "POST",
    "request_body_schema": {
      "type": "object",
      "properties": {
        "voter_id": {"type": "string"},
        "target_id": {"type": "string"}
      },
      "required": ["voter_id", "target_id"]
    }
  },
  "response_timeout_secs": 5
}
```

Tools to define in the agent dashboard:
- `cast_vote` — record vote
- `night_action` — Mafia kill / Doctor save / Detective investigate
- `eliminate_player` — finalize elimination, return updated state
- `reveal_role` — post-game reveal
- `get_phase` — return canonical current phase + alive list (anti-desync)

Auth options: OAuth2 / JWT / Basic / Bearer / custom headers. For local-LAN demo, plain HTTP fine.

## Client Tools (UI flourishes from agent)

For browser-side UI state changes triggered by agent:

- `dim_lights` — Three.js scene transition to night
- `flash_blood` — elimination red flash overlay
- `reveal_role_card` — flip private role card
- `pulse_speaker` — boost active speaker billboard glow

Wired via `clientTools` prop on `ConversationProvider` or `useConversation({clientTools})`.

## React SDK Integration

Source: https://elevenlabs.io/docs/eleven-agents/libraries/react
Types: https://github.com/elevenlabs/packages/blob/main/packages/react/src/conversation/types.ts

**Newer pattern (recommended):** `useConversationControls` + `useConversationStatus` wrapped in `ConversationProvider`. Granular hooks, better re-render perf.

**Returns:**
- `status` — `'disconnected' | 'connecting' | 'connected'`
- `mode` — `'speaking' | 'listening'` from the SDK, used only for agent playback state
- `isSpeaking`, `isMuted`
- Methods: `startSession({conversationToken})`, `endSession`, `sendUserMessage`, `setMuted`

**Key callbacks:**
- `onAgentToolRequest` / `onAgentToolResponse` → drive UI flourishes when server tools fire
- `onAudio` → raw audio frames for billboard glow visualization
- `onMessage` → transcript updates
- `onModeChange` → swap UI hints for agent playback state
- `onAudioAlignment` → word-level timing for caption sync

## Quickstart Pattern (Next.js)

Source: `elevenlabs/elevenlabs-examples` repo, path `agents/nextjs/quickstart/example/`

**Server route** `app/api/conversation-token/route.ts`:
- Mints WebRTC token: `new ElevenLabsClient().getWebrtcToken({ agentId })`
- Env: `ELEVENLABS_API_KEY`

**Client page** `app/page.tsx`:
- Wraps with `ConversationProvider`
- Calls `startSession({conversationToken})` from server-minted token
- No raw signed URL juggling

**UI components** — pull from `elevenlabs/ui` registry via `npx shadcn add`:
- `voice-chat-01` block as starting scaffold
- `orb.tsx`, `live-waveform.tsx` for active speaker
- `transcript-viewer.tsx` for transcript
- Avoid `voice-button.tsx`, `mic-selector.tsx`, `speech-input.tsx`, and Scribe hooks. Human input is typed.

## Sound Effects REST

Endpoint: `POST https://api.elevenlabs.io/v1/sound-generation`

Body:
```json
{
  "text": "single dramatic gunshot in a small wooden room",
  "duration": 1.5,
  "output_format": "mp3_44100_128"
}
```
Header: `xi-api-key`
Response: binary audio

Trigger from server-tool callbacks:
- `night_action` handler → footsteps + church bells (loop, 8s)
- `eliminate_player` handler → gunshot (1.5s) → dirge (3s)
- Phase transition `setup → night` → wind through window
- Phase transition `night → day` → rooster / chair scrape

Pre-cache common SFX clips in `/public/sfx/` after first generation. Don't regenerate per round.

## Music REST

Endpoint: `POST https://api.elevenlabs.io/v1/music` (also `/v1/music/stream` for streaming)

Body:
```json
{
  "prompt": "low cello drone, sparse, noir, suspended tension, no melody, Palermo at midnight",
  "music_length_ms": 60000,
  "model_id": "music_v1",
  "output_format": "mp3_44100_128"
}
```
Response: binary

Generate once at game start, loop client-side. Optional: regenerate per phase for stronger atmosphere shift (night = darker, day = ambivalent).

## Latency Targets

- **TTS TTFB:** <400ms with v3 (sub-200ms with Flash v2.5 fallback)
- **Server tool webhook round-trip:** <500ms (sync blocking via `response_timeout_secs`)
- **SFX/Music REST generation:** <3s (pre-cache common clips)

If v3 too slow for Narrator, use Flash v2.5 for Narrator only — short atmospheric lines, speed matters more than expressive range.

## Pricing Reality

Source: https://elevenlabs.io/pricing/agents

- **$0.080/min flat** (standard tier)
- **$0.160/min overage**
- Custom LLM tokens billed **separately** against EL credits (NOT bundled)
- Demo: ~12 min × $0.08 = ~$1 of agent time + OpenAI model tokens billed separately.

## Verification Checklist

1. **Voice label charset** — confirm `<DON_VITO>` (underscore) parses correctly. Validate in dashboard TTS preview, NOT in code.
2. **SSE custom LLM minimum required JSON fields** — full OpenAI shape vs `choices[].delta.content` only. Test with curl-style examples in dashboard.
3. **Server tool sync behavior** — does `eliminate_player` block agent narration until backend returns? Read tool builder UI for `expects_response`-equivalent flag (documented for client tools, may be implicit via `response_timeout_secs`).
4. **WebRTC token TTL** — how long does `getWebrtcToken` token live? Affects whether to mint per-game or per-round.

## Fallback Hierarchy

1. **Primary:** EL Agents Platform + Custom LLM + Multi-voice TTS
2. **Fallback A:** Direct multi-voice TTS WebSocket calls bypassing Agents Platform (loses turn-taking + interruption, ships voice)
3. **Fallback B:** Single-voice TTS with name prefix in transcript ("Don Vito: I think...")
4. **Fallback C (emergency):** pre-recorded canned audio per persona + text overlay

Human input is text-first. Browser speech recognition may be used as a convenience layer to fill the same submitted text box.

Decision gates for TTS and the Custom LLM SSE -> Agent loop live in `BUILD.md`.
