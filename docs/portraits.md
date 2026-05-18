# Character Asset Generation

Character assets are local files referenced by `lib/characters/data.json`.

Each NPC profile can have:

- `portraitSrc` - static square portrait fallback.
- `spriteSheetSrc` - optional 3x3 animated-state sprite sheet.

The live table keeps `portraitSrc` as the approved visual source and applies deterministic CSS state motion to that clean portrait. `spriteSheetSrc` is still generated as a reusable state asset, but it should not replace the table portrait unless the sheet visually matches the approved portrait style.

## Static Portraits

Use this prompt shell for static character portraits so new assets match the app UI:

```text
Square 1:1 pixel-art portrait for Agent Mafia: [character description]. 16-bit noir game sprite style, crisp chunky pixels, limited Palermo candlelight palette of black, brass gold, cream, and deep red accents, head-and-shoulders character seated at a Mafia table, strong readable silhouette, dark simple background, readable at 46px and 96px, no text, no UI, no photorealism, no painterly blending, no smooth gradients.
```

The app-level reusable style prompt lives in `lib/characters/profiles.ts` as `CHARACTER_PORTRAIT_STYLE_PROMPT`. Individual character hooks live in `lib/characters/data.json`.

Existing missing portraits can be generated with:

```bash
pnpm generate:characters -- --dry-run
pnpm generate:characters
```

## Animated State Sprite Sheets

Sprite sheets are square 3x3 PNG files under `public/portraits/sprites/`.

Frame order is fixed, left to right, top to bottom:

1. idle neutral breathing frame
2. idle alternate breathing frame
3. quiet guarded listening frame
4. speaking mouth-open frame
5. speaking mouth-mid frame
6. speaking mouth-closed expressive frame
7. thinking under pressure frame
8. suspected tense defensive frame
9. eliminated desaturated fallen-silent frame

Generate or refresh sheets with:

```bash
pnpm generate:character-states -- --dry-run --ids=all
pnpm generate:character-states -- --ids=all --concurrency=1
pnpm generate:character-states -- --ids=don_vito,rosa --force --concurrency=1
```

By default, the generator derives sheets locally from each current portrait so the output stays as crisp and pixelated as the approved art. Use `--ai` only for an experimental expressive sprite-sheet generation pass:

```bash
pnpm generate:character-states -- --ids=don_vito --ai --force
```

AI-generated sheets must be visually reviewed before they are used in the table UI.

## New Characters

Use `generate:character` for an agent-friendly, non-interactive new-character workflow:

```bash
pnpm generate:character -- \
  --id=paranoid-tailor \
  --name="Marco Needle" \
  --summary="Paranoid Palermo tailor" \
  --description="A twitchy old tailor who notices clothing, posture, and nervous hands." \
  --voice-gender=masculine
```

The script validates or creates the profile metadata, writes the static portrait, derives the 3x3 sprite sheet from that approved portrait, and appends the profile to `lib/characters/data.json`. Use `--dry-run` first when giving an agent a new character brief.

Useful flags:

- `--voice-id=<elevenlabs id>` to attach an explicit ElevenLabs voice.
- `--fallback-line="..."` repeated three or more times to avoid AI-drafted fallback copy.
- `--metadata-only`, `--portrait-only`, or `--sprites-only` for partial updates.
- `--ai-sprites` to opt into AI-generated expressive sprite sheets after the portrait is made.
- `--force` to replace an existing generated asset or update an existing profile.

`OPENAI_API_KEY` is required for generated copy or image assets. Browser voice defaults are used when no ElevenLabs voice ID is supplied.
