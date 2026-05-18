# Build

System architecture, implementation spine, prep checklist, risks, reference repos, and borrow list. Single source of truth for execution.

## System Diagram (Path D)

```
[Browser — Next.js 15 + Three.js POV scene]
  ├─ @elevenlabs/react useConversationControls + useConversationStatus (WebRTC, Scribe STT, multi-voice TTS)
  ├─ Three.js canvas (POV at table, 5 silhouette billboards, candle particle, RenderPixelatedPass)
  └─ Pixel-art UI overlay (vote buttons, role card, push-to-talk)
        │ player mic → Scribe STT inside Agent
        ▼
[ElevenLabs Agent — hosted]
  ├─ Scribe STT (~150ms)
  ├─ Multi-voice TTS (XML voice tags <NARRATOR>, <DON_VITO>, <SALVATORE>, <ROSA>, <VINCENZO>, <CARMELA>)
  ├─ Turn-taking model
  ├─ WebRTC transport (echo cancellation, noise suppression)
  └─ Custom LLM proxy → POSTs OpenAI-shaped SSE to our backend
        │
        ▼
[Bun + Hono backend — our Custom LLM endpoint]
  ├─ /v1/chat/completions (Hono streamSSE, OpenAI-compat chunks, [DONE] terminator)
  ├─ Game state machine (pure-function reducer, frozen TS types)
  ├─ Per-NPC private role memory (Mafia/Detective/Doctor view filtered)
  ├─ Turn order arbitration (deterministic rotation)
  ├─ Briefing builder (6 phase-specific renderers, never raw events)
  ├─ Single LLM call per NPC turn → emit text with `<NPC>...</NPC>` voice tags
  ├─ Server tool webhooks: cast_vote, night_action, eliminate_player, reveal_role
  └─ SFX + Music REST calls at phase transitions
        │
        ▼
[Single LLM provider — OpenAI gpt-4.1-mini via OpenAI API]
   (cheap, fast TTFB, JSON output good, BYO via Custom LLM URL in EL agent dashboard)
```

## Tech Stack

### Backend
- **Bun + Hono** — single binary, websocket-friendly, native SSE via `hono/streaming`
- **TypeScript** — uniform across frontend/backend, strict mode
- **SQLite** (`bun:sqlite`) — append-only event log + per-NPC inner-monologue log
- **Single LLM:** OpenAI gpt-4.1-mini (service-account key, swap to `gpt-4.1-nano` if cost spikes)
- **Zod** — schema validation for vote integrity (dynamic `z.enum([...alivePlayerNames])` per turn)

### Frontend
- **Next.js 15** (App Router)
- **`@react-three/fiber`** + **`@react-three/drei`** — Three.js declarative
- **`three/examples/jsm/postprocessing/RenderPixelatedPass`** — pixelation post-process
- **`@elevenlabs/react`** — `useConversationControls` + `useConversationStatus` + `ConversationProvider`
- **Tailwind** — layout, custom CSS variables for noir palette (`--bg: #0a0908`, `--ink: #e7d8c9`, `--blood: #a4161a`, `--candle: #d4a574`)
- **shadcn primitives** stripped + restyled (no default look)

### Voice (ElevenLabs)
- **Agents Platform** — single agent session, WebRTC, owns turn-taking
- **Multi-voice TTS** — `<LABEL>text</LABEL>` per character, 6 voices total (under 10-voice cap)
- **Scribe STT** — built into Agent, ~150ms latency
- **Sound Effects** — `POST /v1/sound-generation`, generative gunshot/footsteps/bells
- **Music** — `POST /v1/music`, atmospheric noir bed loop

### Hosting
- Local-first for demo. Backend on MacBook over LAN, frontend on `localhost:3000`. No cloud deploy.

## Data Flow Per Round (single-player, 6 players)

1. Backend assigns roles randomly: 2 Mafia, 1 Detective, 1 Doctor, 2 Villagers across human + 5 NPCs.
2. **Setup phase:** Narrator opens scene. Role card flipped privately to human.
3. **Night phase:**
   - Backend builds night-mafia briefing for both Mafia (filtered to mafia-channel events). LLM picks kill target. If human is Mafia: UI prompts pick.
   - Doctor save target chosen. Detective investigation chosen.
   - Server tools mutate state. SFX bells + footsteps play via REST.
4. **Day-discuss phase:**
   - Narrator announces dawn + who died (if anyone).
   - Turn rotation: `start = (turn-1) % alive.length` per Durafen pattern.
   - For each NPC turn: backend builds discussion briefing (filtered public events + own private notes). LLM emits `<NPC_NAME>...</NPC_NAME>` tagged speech. EL TTS routes per voice. Speaker billboard glows (audio-reactive).
   - Human turn: mic icon glows. Player speaks. Scribe STT → confirm dialog → submit to game state.
   - 3 turns/player capped. Inner monologues logged to SQLite (hidden during play).
5. **Day-vote phase:**
   - 30s timer. Each NPC submits vote via Zod-validated structured output (`z.enum([...alivePlayerNames])`).
   - Human taps portrait or speaks vote. Tally on screen.
6. **Resolve:** Narrator announces verdict. SFX gunshot. Eliminated billboard goes dark.
7. Loop until win condition.

## Implementation Spine

| Stage | Block | Output |
|---|---|---|
| 1 | **Setup + scaffold** | Bootstrap the runnable app. Bun+Hono server skeleton if needed. Next.js 15 + R3F starter (`pmndrs/react-three-next`). Env vars loaded (OpenAI, ElevenLabs). `@elevenlabs/react` quickstart wired. |
| 2 | **Game engine v0** | Mafia state machine for 6 players (2/1/1/2). Pure-function reducer, frozen TS types ported from `Queue-Bit-1/wolf` `state.py` + `events.py`. Random role assignment. Phase transitions. Vote tally + tiebreak. Win condition. SQLite event log table. Unit tests. |
| 3 | **NPC turn loop + Custom LLM SSE** | Hono `streamSSE` `/v1/chat/completions` endpoint (OpenAI-compat). Per-NPC briefing builder (6 phase-specific renderers, Durafen 3-channel log split). LLM call -> emit text with `<NPC_NAME>` voice tags. Server tools webhooks: cast_vote, night_action, eliminate_player, reveal_role. |
| 4 | **ElevenLabs Agent + multi-voice TTS** | EL agent dashboard: 6 voices configured, custom LLM URL set. `useConversationControls` + `useConversationStatus` in Next.js play multi-voice output. Scribe STT for player input. **Decision gate: voice working?** |
| 5 | **Three.js POV scene** | R3F canvas mounted. 5 sprite billboards (TSL `billboarding()`). Candle particle (`LucaAngioloni/SmokeGL` pattern) + flickering point light. Mouse-pan camera lerp +/-3 degrees. Audio-reactive billboard glow (`THREE.AudioAnalyser` -> uniform). **Decision gate: 3D rendering?** else 2D fallback. |
| 6 | **SFX + Music + atmospheric polish** | Sound Effects `POST /v1/sound-generation`: gunshot at elim, footsteps + bells at night. Music `POST /v1/music`: noir bed loop. RenderPixelatedPass (pixelSize=5). OutputPass. Phase transition lighting (intensity=0 to disable, never add/remove lights). |
| 7 | **Pixel-art UI + post-game replay** | shadcn buttons restyled with pixel font (Public Pixel CC0). Custom role card (Mono10 OFL). Inner monologue replay UI (basic timeline reading from SQLite). Phase transition narrator overlay. |
| 8 | **Demo readiness** | 3 pre-staged seeds. Speed mode with capped turns. One short local round rehearsed end to end. Product video and shareable clip captured if useful. |

## Decision Gates

| Gate | Check | Fallback |
|---|---|---|
| 1 | Game state machine working text-only? | Simplify to 4-player config |
| 2 | Multi-voice TTS streaming end-to-end? | Single-voice TTS with name prefix in transcript |
| 3 | Three.js scene rendering with billboards? | Drop to 2D static noir + CSS `image-rendering: pixelated` |
| 4 | Custom LLM SSE -> EL Agent loop working? | Direct TTS calls bypassing Agents Platform |
| 5 | Core loop playable? | Stop adding features; fix and polish only |

## Team Roles

- **Alex:** backend (state machine, custom LLM SSE, server tools), voice pipeline glue
- **Frontend partner:** Three.js POV scene, pixel UI, demo polish if collaborating
- **Optional 3rd:** game logic testing harness, or designer for assets

Solo possible but caps the scope.

---

# Setup Checklist

### Account signups
- [ ] **ElevenLabs** — https://elevenlabs.io. Free tier 10k chars/mo. Validate v3 audio tags + multi-voice tag syntax in playground
- [x] **OpenAI API** — primary LLM, gpt-4.1-mini. Service-account key in `.env` (`OPENAI_API_KEY`)
- [ ] **Google AI Studio** — fallback, Gemini 2.5 Flash free tier
- [ ] **Anthropic console** — fallback LLM, fund $5
- [ ] **Groq console** — fallback Llama, free tier

### Research
- [ ] Read all reference repo files listed in §"Reference Repos to Read" below
- [ ] Listen to ElevenLabs voice library, shortlist 6 voices: Don Vito (British male, contemplative), Salvatore (American male, smooth), Rosa (mid-Atlantic, faster cadence), Vincenzo (Brooklyn male, gruff), Carmela (younger American, sarcastic), Narrator (low, measured, noir storyteller)
- [ ] Validate audio tags work on chosen voices: `[contemplative] [reassuring] [curious] [shouting] [sarcastic] [ominous] [grave] [hushed]`
- [ ] Validate multi-voice XML tag syntax (`<DON_VITO>text</DON_VITO>`) renders correctly in EL Agents test playground
- [ ] Verify server tool sync behavior (`response_timeout_secs` blocks agent narration?)
- [ ] Verify WebRTC token TTL (mint per-game vs per-round)
- [ ] Verify minimum required SSE chunk fields (full OpenAI shape vs `choices[].delta.content` only)
- [ ] Mood-board pixel-art Palermo: Red Strings Club, Cosa Nostra, GOON CITY, Streetlight Syndicate, Drawn Down (itch.io)

### Asset shortlist
- [ ] **Pixel fonts (free):** Public Pixel (CC0), monogram (OFL), Floppy Pixel Refreshed (OFL), Mono10 (OFL — perfect for HUD numbers), Avenue Pixel (OFL)
- [ ] **Pixel icons (free):** Pixelarticons (MIT, npm `pixelarticons`), Kenney 1-Bit Pack (CC0)
- [ ] **NPC silhouette placeholders:** itch.io "Detective Portraits" pixel pack
- [ ] **Free 3D table + candle assets:** Sketchfab CC0 search

### Local demo logistics
- [ ] Equipment: MacBook, USB mic, headphones or speakers, dongles, power cable
- [ ] Backup: text input mode, browser speech fallback, deterministic scenario seeds
- [ ] Demo support: local architecture diagram, one known-good scenario, mute/skip controls

---

# Risks + Mitigations

### 1. Multi-voice tag misroute
**Risk:** LLM emits malformed `<LABEL>` markup → EL TTS falls back to default voice for whole stream.
**Mitigation:** prompt-strict tag emission, server-side regex validation before forwarding SSE chunk, Flash v2.5 fallback for Narrator only.

### 2. Custom LLM SSE timeout
**Risk:** EL Agent expects sub-second first-token TTFB; cold model call can stall.
**Mitigation:** warm gpt-4.1-mini on app boot (prime with empty-context request), cache common Narrator phrases, send `: keepalive\n\n` SSE comment during long thinking.

### 3. Game state desync
**Risk:** server tool writes mutate state but EL Agent prompt context drifts.
**Mitigation:** server tool returns canonical state snapshot, briefing includes current phase + alive list every turn.

### 4. Three.js perf on demo laptop
**Risk:** postprocessing + WebRTC audio = stutter.
**Mitigation:** `setPixelRatio(1)`, RenderPixelatedPass with high `pixelSize` = fewer pixels, low-poly billboards, capped 30fps, NO bloom.

### 5. STT misrecognition
**Risk:** Scribe transcribes player speech as nonsense.
**Mitigation:** show transcript w/ confirm button before submitting. Fallback: text input mode.

### 6. WebRTC mic permissions block
**Risk:** player can't speak.
**Mitigation:** dry-run mic flow with several people before sharing the demo. Fallback: text input mode.

### 7. Polish over function
**Risk:** spend hours 17-22 polishing, never test full flow.
**Mitigation:** require a full local rehearsal before adding visual extras.

---

# Reference Repos to Read

## Mafia engine spine (TS port targets)

- **`Durafen/AI-Mafia-Game`** — closest direct prior art. Read: `engine.py:740-1159` (master loop), `engine.py:646-704` (parallel vote collector), `schemas.py` (whole file — `TurnOutput`, `LogEntry`, `GameState`). Port: 3-channel log split (public/mafia/cop), turn rotation `(turn-1) % alive.length`, deterministic phase order.
- **`Queue-Bit-1/wolf`** — highest architectural quality. Read: `engine/state.py:13-45` (frozen GameState), `engine/events.py` (11 frozen event types — direct map to SQLite row schema), `engine/resolver.py` (priority 10/15/20 with doctor-save), `engine/phase.py` (7-member enum), `agents/briefing_builder.py` (6 phase-specific builders, invariant: never hand raw events to LLM), `comms/channel.py:8-95` (abstract Channel), `agents/memory.py:8-18` (PlayerModel{suspicion, trust, notes}).

## Inspiration only (pattern, not code)

- **`niveck/LLMafia`** — async turn-taking. Read: `llm_players/schedule_then_generate_player.py:24-92` (decide-then-write pattern). Borrow scheduling-token for "shouldSpeak" check during day-discuss. Skip filesystem IPC.
- **`agentscope-ai/agentscope`** `examples/game/werewolves/structured_model.py:17-114` — dynamic pydantic enum constraint. Mirror in Zod: regenerate vote schema each turn from `state.players.filter(p => p.alive).map(p => p.id)`. Non-negotiable for vote integrity.
- **`xuyuzhuang11/Werewolf`** `chatarena/environments/werewolf.py:339-401` — `visible_to=[names]` per-message visibility filter. Simpler than wolf's channel ABC. **Use this for our 24h scope.**
- **`oil-oil/wolfcha`** — only TS Mafia repo. Read: `src/lib/streaming-speech-parser.ts` (segment-emission timing pattern). Skip: 65KB+ God files (`game-master.ts`, `useGameLogic.ts`).

## Skip
- `hiper2d/mafia-gpt` (OpenAI Assistants tied)
- `PranavMishra17/Mafia-Boardgame-via-Agents` (notebook)
- `WuJunde/werewolf_ai_agents` (chatarena fork)

## ElevenLabs Agents Platform

- **Custom LLM SSE shape** — https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm. Body received: `{messages, model, temperature, max_tokens, stream:true, user_id}`. Reply: `text/event-stream`, chunks `data: {OpenAI-shaped json}\n\n`, terminator `data: [DONE]\n\n`.
- **Multi-voice tags** — https://elevenlabs.io/docs/eleven-agents/customization/voice/multi-voice-support. Format `<LABEL>text</LABEL>`, case-sensitive, 10-voice cap, no spaces in label.
- **Server tools** — https://elevenlabs.io/docs/eleven-agents/customization/tools/server-tools. JSON schema definition, sync blocking via `response_timeout_secs`.
- **Client tools** — https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools. UI flourishes (candle dim, blood splash).
- **React SDK** — https://elevenlabs.io/docs/eleven-agents/libraries/react. `useConversationControls` + `useConversationStatus` (newer) or unified `useConversation`.
- **Quickstart** — `elevenlabs/elevenlabs-examples` repo, `agents/nextjs/quickstart/example/`. Read: `app/api/conversation-token/route.ts` (server-mints WebRTC token), `app/page.tsx` (client wires).
- **UI components** — `elevenlabs/ui` registry. Components for active speaker (`orb.tsx`, `live-waveform.tsx`), push-to-talk (`voice-button.tsx`, `mic-selector.tsx`), transcript (`transcript-viewer.tsx`), STT (`speech-input.tsx` + `hooks/use-scribe.ts`). Pre-built blocks: `voice-chat-01..03`, `transcriber-01`, `speaker-01`. Install via `npx shadcn add` from registry.
- **Types** — https://github.com/elevenlabs/packages — `packages/react/src/conversation/types.ts` for callback signatures.

## Hono SSE + SQLite

- **Hono `streamSSE`** — https://hono.dev/docs/helpers/streaming. Wrap `stream.onAbort` defensively (Bun crash issue honojs/hono#3064).
- **Pattern:** `hellokaton/hono-stream-example` `src/index.ts:37-49`.
- **SQLite event log:** append-only schema `event_id, stream_id, event_type, payload, created_at, aggregate_id, event_version, actor, channel`. Ref: `mattbishop/sql-event-store`. Skip snapshots for 24h scope.

## Three.js + Pixel UI

- **Pixelation pass:** `RenderPixelatedPass` from `three/addons/postprocessing/RenderPixelatedPass.js`. Demo: https://threejs.org/examples/webgl_postprocessing_pixel.html. Recommended `pixelSize=5-6, normalEdgeStrength=0.3, depthEdgeStrength=0.4`. Lock `setPixelRatio(1)`.
- **POV camera lerp** (manual, NOT FirstPersonControls): `KerimKochekov/Threejs-museum`, `jsantell/three-simple-fp-controls`. Pattern: `targetYaw = mouseX * degToRad(3)`, lerp factor 0.05.
- **Sprite billboards:** TSL `billboarding()` (horizontal-only) > `THREE.Sprite` for character figures. Refs: `knowercoder/threejs-sprite-utils`.
- **Candle flicker:** `LucaAngioloni/SmokeGL` (particle vertex attrs pattern), `yomotsu/VolumetricFire` fallback. Light recipe: `intensity = base + noise1D(t*8)*0.3 + (Math.random()<0.02 ? -0.4 : 0)`.
- **Audio-reactive glow:** `sampstrong/audio-reactive-threejs` (clean Analyser→uniform), `kuhung/audiovisualizer` (AudioManager/SceneManager split).
- **R3F + Next.js 15 starter:** `pmndrs/react-three-next`. Bootstrap: `npx create-r3f-app next agent-mafia-frontend -ts`. Note: `transpilePackages: ['three']` in `next.config.ts`. Canvas via `next/dynamic` with `ssr: false`.
- **UI overlay:** sibling div route — `<Canvas>` + absolute positioned `<div className="pointer-events-none">` with `<button className="pointer-events-auto">`. NOT drei `<Hud>`, NOT pmndrs/uikit.
- **Performance:** <100 draw calls, <150k tris. Never add/remove lights at runtime (use `intensity = 0`). NO bloom. Cap 30fps.

## 2D Fallback (decision gate hour 14)

If Three.js scene not rendered + lit by hour 14: kill Canvas, ship 2D.
- Static noir image `/public/scene.webp` (gen'd or hand-drawn — table + 5 silhouettes + candle)
- CSS `image-rendering: pixelated` on downscaled-then-upscaled wrapper
- Active speaker: CSS `box-shadow` glow + `transform: scale()` pulse, driven by `getByteFrequencyData()` writing CSS variable in `requestAnimationFrame`
- Night phase: `filter: brightness(0.05)`
- Elimination: red `mix-blend-mode: multiply` div overlay
- Time cost: ~2h vs ~8h. Don't sunk-cost the 3D path.

---

# Borrow List (priority order)

1. **Schema (top priority).** Port `wolf/engine/events.py` event union + `wolf/engine/state.py` `GameState` to TS frozen types (readonly + `as const`). Add Durafen `TurnOutput{strategy, speech, vote}` from `schemas.py`. Use Zod `z.enum([...alivePlayerNames])` per agentscope `Literal[tuple(...)]` for vote validity.
2. **Three-channel log.** Durafen's `public_logs` / `mafia_logs` / `cop_logs` triple. One SQLite `events` table with `channel` column (`'public'|'mafia'|'detective'|'private:<player_id>'`). Briefing builder filters by `(player_role, channel)` per xuyuzhuang11's `visible_to` model.
3. **Briefing builder.** Wolf invariant: never hand raw events to LLM. 6 builders: `briefForNightMafia`, `briefForNightDoctor`, `briefForNightDetective`, `briefForDayDiscuss`, `briefForDayVote`, `briefForReflection`.
4. **Phase reducer.** Pure functions. `enterPhase(state, phase) → events`, `resolveNight(state) → events` (wolf priority 10/15/20), `tallyVote(state) → events` (Durafen `Promise.all`).
5. **Day-discuss turn order.** Durafen rotation: `start = (turn-1) % alive.length`. Skip async scheduling for v1.
6. **PlayerModel belief state.** Wolf `agents/memory.py` `{suspicion, trust, notes, claimed_role}`. Renders as Recharts radar/bar charts in scene UI (post-game replay).
7. **Vote integrity via structured output.** Zod `z.enum([...alivePlayerNames])` regenerated each turn.
8. **SSE endpoint.** Hono `streamSSE` + hellokaton pattern. Per-chunk `writeSSE({data})`, terminator `writeSSE({data: '[DONE]'})`. Wrap `stream.onAbort`.
9. **Multi-voice XML pull-tokenizer.** ~50 lines. Emits `{speaker, text}` segments as each closing `</LABEL>` arrives. Borrow wolfcha `streaming-speech-parser` debounced segment-emission timing.
10. **EL UI components.** `npx shadcn add` from `elevenlabs/ui` registry. Pull `voice-chat-01` block as starting point, restyle aggressively.

---

# Target File Shape

```
agent-mafia/
├── apps/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── server.ts                    # Hono app
│   │   │   ├── llm/
│   │   │   │   ├── chat-completions.ts      # OpenAI-compat SSE endpoint
│   │   │   │   ├── briefing-builder.ts      # 6 phase-specific renderers
│   │   │   │   ├── prompt-assembly.ts       # per-NPC turn prompt
│   │   │   │   └── voice-tag-tokenizer.ts   # pull-tokenizer for <LABEL>
│   │   │   ├── game/
│   │   │   │   ├── state.ts                 # frozen TS types
│   │   │   │   ├── events.ts                # event union (port from wolf)
│   │   │   │   ├── reducer.ts               # applyEvent pure fn
│   │   │   │   ├── roles.ts                 # role assignment
│   │   │   │   ├── phases.ts                # phase transitions
│   │   │   │   ├── votes.ts                 # tally + tiebreak (Zod enum)
│   │   │   │   ├── resolver.ts              # night resolution priority 10/15/20
│   │   │   │   ├── memory.ts                # PlayerModel belief state
│   │   │   │   └── win-condition.ts
│   │   │   ├── tools/
│   │   │   │   ├── cast-vote.ts             # server tool webhook
│   │   │   │   ├── night-action.ts
│   │   │   │   ├── eliminate-player.ts
│   │   │   │   └── reveal-role.ts
│   │   │   ├── voice/
│   │   │   │   ├── sfx.ts                   # POST /v1/sound-generation
│   │   │   │   └── music.ts                 # POST /v1/music
│   │   │   └── db/
│   │   │       └── events.ts                # SQLite event log + inner monologue
│   └── frontend/
│       ├── app/
│       │   ├── page.tsx                     # main game scene
│       │   ├── layout.tsx
│       │   ├── globals.css
│       │   └── api/
│       │       └── conversation-token/
│       │           └── route.ts             # mint EL WebRTC token
│       ├── components/
│       │   ├── Scene.tsx                    # R3F Canvas
│       │   ├── NPCBillboard.tsx             # sprite billboard w/ glow uniform
│       │   ├── Candle.tsx                   # particle + flicker shader
│       │   ├── PixelationPass.tsx           # RenderPixelatedPass wrapper
│       │   ├── PushToTalk.tsx               # mic button (uses speech-input.tsx)
│       │   ├── VoteGrid.tsx                 # portrait grid
│       │   ├── RoleCard.tsx                 # private role reveal
│       │   ├── NarratorOverlay.tsx          # phase transition text
│       │   └── ReplayTimeline.tsx           # post-game inner monologue (stretch)
│       └── lib/
│           └── elevenlabs.ts                # ConversationProvider setup
└── prompts/
    ├── narrator.md
    ├── don-vito.md
    ├── salvatore.md
    ├── rosa.md
    ├── vincenzo.md
    └── carmela.md
```
