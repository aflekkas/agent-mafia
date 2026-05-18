# Agent Mafia

Agent Mafia is a local-first single-player Mafia prototype set around a noir Palermo table. You play one human seat against five LLM-driven NPCs: Don Vito, Salvatore, Rosa, Vincenzo, and Carmela. The app runs a real six-player Mafia loop with hidden roles, private knowledge, night actions, discussion, votes, eliminations, and win/loss checks.

The current build is intentionally simple: one Next.js app, a 2D CSS table UI, OpenAI-backed NPC turns with deterministic fallbacks, optional ElevenLabs REST TTS, and browser voice fallback. Human input is text-first; the mic button is only a browser speech-recognition helper that fills the text box.

## Status

This repo is the playable local demo version of the project. It does not currently use Three.js, Tailwind, shadcn, Bun/Hono, SQLite, ElevenLabs Agents/WebRTC, Custom LLM SSE, or multi-voice XML routing.

Implemented today:

- Six fixed seats: five NPCs plus the human player.
- Random roles: two Mafia, one Detective, one Doctor, two Villagers.
- Detective-only starting Mafia lead.
- Mafia partner visibility.
- First-night safety with Doctor/Detective actions still allowed.
- Randomized day discussion order with NPC pressure turns.
- OpenAI NPC dialogue and decisions, with fallback lines/actions when no API key is configured.
- Direct ElevenLabs TTS by speaker when voice IDs are configured.
- Browser speech synthesis fallback.
- Local ambience and UI sound effects from `public/sfx`.
- Text transcript, vote board, role card, pause/new-game controls, and avatar/portrait UI.
- Full local game logs written to `.agent-mafia-logs/` for debugging bad conversations.

## Run Locally

```bash
npm install
npm run dev -- -p 3001
```

Open `http://localhost:3001`.

Useful checks:

```bash
npm run typecheck
npm run build
```

## Local Conversation Logs

Every started or updated game writes a full JSON snapshot to `.agent-mafia-logs/`, which is intentionally gitignored. Use `.agent-mafia-logs/latest.json` for the most recent game, or a specific `.agent-mafia-logs/<game-id>.json` file when comparing an exact transcript, hidden roles, votes, inner monologues, and state.

## Environment

Copy `.env.example` to `.env` and fill only what you need.

- `OPENAI_API_KEY` enables generated NPC turns.
- Without `OPENAI_API_KEY`, the game still plays with deterministic fallback turns.
- `ELEVENLABS_API_KEY` plus per-speaker voice IDs enables REST TTS.
- Without ElevenLabs config, browser speech synthesis is used.

## Current Stack

- Next.js App Router
- React
- TypeScript
- OpenAI SDK
- Zod
- Pixelarticons
- Plain CSS in `app/globals.css`
- In-memory local game sessions

## Project Structure

- `app/` - Next routes and global CSS.
- `components/GameShell.tsx` - current game UI shell.
- `lib/game/` - game state, role setup, phase advancement, votes, night actions, redaction, selectors.
- `lib/ai/` - NPC personas, prompts, OpenAI turn generation, fallback turns.
- `lib/voice/` - speaker-to-ElevenLabs voice ID mapping.
- `public/avatars/` and `public/portraits/` - player and NPC table portraits.
- `public/sfx/` - local ambience and UI sounds.
- `docs/` - current architecture, voice, demo, and cleanup notes.

## Docs

- `docs/architecture.md` - how the current app works.
- `docs/voice.md` - current voice/TTS behavior and env vars.
- `docs/demo.md` - local demo runbook.
- `docs/refactor-notes.md` - cleanup findings and maintenance notes.
- `AGENTS.md` - instructions for coding agents working in this repo.
