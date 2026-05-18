# Current Architecture

Agent Mafia is a single Next.js app. Keep it that way unless the user explicitly asks for a larger platform split.

## Runtime Shape

```text
Browser
  GameShell UI
  typed human input
  optional browser mic recording helper
  optional browser speech synthesis fallback
  local ambience/UI sounds

Next.js route handlers
  /api/game
  /api/game/[gameId]
  /api/game/[gameId]/action
  /api/speak
  /api/transcribe

Server modules
  in-memory game store
  game state machine
  OpenAI NPC turn generation
  OpenAI Whisper transcription
  ElevenLabs REST TTS proxy
```

## Game State

`lib/store/game-store.ts` keeps local demo sessions in a process-global `Map`. This is enough for the current local prototype. There is no database or persistence contract.

`lib/game/types.ts` defines the canonical `GameState`. The browser should render server state and submit actions; it should not invent game facts.

Important mechanics:

- Roles are assigned in `lib/game/setup.ts`.
- The single Mafia role is private. Human Mafia see that they are alone on the role card and in a private note; NPC Mafia receive the same fact in private prompt context.
- The public client view is redacted in `lib/game/redact.ts`.
- Phase progression lives in `lib/game/advance.ts`, with night and vote resolution split into `night.ts` and `votes.ts`.
- Discussion order is generated in `lib/game/turn-order.ts`.

## API Contract

The intended active API surface is:

- `POST /api/game` - start a new game.
- `GET /api/game/[gameId]` - fetch redacted game state.
- `POST /api/game/[gameId]/action` - advance, submit speech, vote, or submit a night action.
- `POST /api/speak` - optional ElevenLabs REST TTS.
- `POST /api/transcribe` - optional OpenAI Whisper transcription for the Use Mic helper.

All game responses visible to the browser should go through `redactGameForPlayer`.

## UI Contract

The UI is a 2D CSS table, not a Three.js scene. Human input is text-first. The mic button records browser audio and uses `/api/transcribe` with OpenAI Whisper only to fill the text area.

NPC table faces keep the approved `portraitSrc` as the live visual source and apply deterministic CSS state motion to that portrait. Optional 3x3 sprite sheets from `spriteSheetSrc` can be generated for reuse, but should not replace the clean portrait art unless reviewed. Character visual states are derived from the redacted public `GameState`: idle, quiet, thinking, speaking, suspected, and eliminated. They are not model-owned hidden state and do not change the NPC JSON turn contract.

The main UI shell currently owns several concerns and should be refactored cautiously:

- game actions
- auto-advance timing
- voice playback
- ambience and UI sounds
- home screen
- table scene
- human prompt panel
- transcript and dialogs

When refactoring, preserve the playable loop before polishing structure.
