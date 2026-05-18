# Agents

## Current Project Truth

Agent Mafia is a local-first single Next.js prototype for a single-player Mafia round at a noir Palermo table.

Use the current app architecture:

- Next.js App Router.
- React + TypeScript.
- In-memory game sessions.
- Next route handlers for game actions.
- OpenAI JSON NPC turns with deterministic fallback.
- Optional direct ElevenLabs REST TTS.
- Browser speech synthesis fallback.
- Text-first human input with an optional browser mic helper that fills the text box.
- 2D CSS table UI.

Do not add Tailwind, Three.js, R3F, shadcn, Bun/Hono, SQLite, ElevenLabs Agents/WebRTC, Custom LLM SSE, server tools, Scribe STT, or multi-voice XML routing unless the user explicitly asks for that specific work.

Prioritize the playable loop and visible UI over architecture expansion. Avoid landing pages.

## Working Rules

- Preserve existing local work. This repo may be dirty.
- Keep changes scoped and demo-safe.
- Validate with `npm run typecheck`; run `npm run build` after route, config, or UI structure changes.
- All browser-visible game state must be redacted through `redactGameForPlayer`.
- Human input is text submitted to game state. Browser speech recognition is only an input helper.
- Voice playback must always have a text transcript fallback.

## Game Shape

Six seats:

- `don_vito` - Don Vito
- `salvatore` - Salvatore
- `rosa` - Rosa
- `vincenzo` - Vincenzo
- `carmela` - Carmela
- `player_6` - human player

Roles:

- 2 Mafia
- 1 Detective
- 1 Doctor
- 2 Villagers

Current rule details:

- Roles are randomized each game.
- The human can receive any role.
- The Detective privately starts with one confirmed Mafia lead.
- Mafia know each other privately.
- The first night has no Mafia kill, but Doctor and Detective actions may still happen.
- Mafia win at parity with non-Mafia.
- Town wins when all Mafia are eliminated.

## NPC Personalities

- **Don Vito:** philosophical, careful, self-aware, anxious. Hedges and quotes philosophers.
- **Salvatore:** smooth, polished, confident, sycophantic, dodges blame.
- **Rosa:** earnest, factual, over-explains, bad at lying.
- **Vincenzo:** blunt, loud, chaotic, gut-driven, picks fights.
- **Carmela:** smug, sarcastic, jokes through pressure, defensive when accused.
- **Narrator:** restrained noir framing for phase transitions and outcomes.

## Prompt And AI Rules

NPCs should:

- Speak only as themselves.
- Return valid JSON matching the current code contract.
- Use public transcript, private knowledge, role objective, and social memory.
- Avoid random accusations.
- Avoid punishing scheduled silence before a player has had a turn.
- Use hidden knowledge carefully without revealing why they know it.
- Keep public speech compact and characterful.

The current model response uses a plain `speech` string.

## Docs

- `README.md` is the user-facing entrypoint.
- `docs/architecture.md` describes the current app.
- `docs/voice.md` describes current direct TTS and browser fallback.
- `docs/demo.md` describes the local demo flow.
- `docs/refactor-notes.md` records cleanup boundaries.
