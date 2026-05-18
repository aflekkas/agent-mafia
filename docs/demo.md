# Local Demo

The demo goal is a playable local Mafia round, not a platform architecture showcase.

## Setup

```bash
pnpm install
pnpm dev -- -p 3001
```

Open `http://localhost:3001`.

Sound can remain muted. The game still works with text and transcript only.

## Demo Flow

1. Enter a player name.
2. Choose a player portrait.
3. Start the game.
4. Read the private role card.
5. Let the table auto-advance through NPC turns.
6. Type during human speech prompts.
7. Choose targets during vote and night prompts.
8. Continue until an elimination or game over.

## What To Show

- Five distinct NPC personalities.
- Animated NPC table states: idle breathing, speaking mouth movement, quiet listening, suspicion pressure, and eliminated stillness.
- Private human role and redacted hidden information.
- Detective investigation notebook if the human is Detective.
- Solo Mafia private objective if the human is Mafia.
- Optional browser/ElevenLabs voice playback.
- Vote and elimination resolution.

## Smoke Checklist

- Start a game with sound muted.
- Start a game with browser voice enabled.
- Confirm missing ElevenLabs config falls back cleanly.
- Submit human speech.
- Cast a vote.
- Complete a human Doctor, Detective, or Mafia night action when assigned.
- Confirm non-human roles stay hidden until game over unless privately visible.
- Confirm NPCs fall back to static portraits if a sprite sheet is missing.
- Confirm `pnpm typecheck` and `pnpm build` pass.
