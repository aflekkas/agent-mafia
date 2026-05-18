# Portrait Generation

Use this prompt shell for character portraits so new assets match the app UI:

```text
Square 1:1 pixel-art portrait for Agent Mafia: [character description]. 16-bit noir game sprite style, crisp chunky pixels, limited Palermo candlelight palette of black, brass gold, cream, and deep red accents, head-and-shoulders character seated at a Mafia table, strong readable silhouette, dark simple background, readable at 46px and 96px, no text, no UI, no photorealism, no painterly blending, no smooth gradients.
```

For a specific character, replace `[character description]` with that character's personality and visual hook. Example:

```text
Square 1:1 pixel-art portrait for Agent Mafia: a goofy orange-haired supervillain archetype at a noir Mafia table, dramatic cape-like jacket, smug insecure grin, original character, not from any existing franchise. 16-bit noir game sprite style, crisp chunky pixels, limited Palermo candlelight palette of black, brass gold, cream, and deep red accents, head-and-shoulders character seated at a Mafia table, strong readable silhouette, dark simple background, readable at 46px and 96px, no text, no UI, no photorealism, no painterly blending, no smooth gradients.
```

The app-level reusable style prompt lives in `lib/characters/profiles.ts` as `CHARACTER_PORTRAIT_STYLE_PROMPT`. Individual character hooks live in `lib/characters/data.json`.
