# Refactor Notes

This file records the current cleanup direction so future work stays scoped to the existing app.

## Keep

- Single Next.js app.
- In-memory local sessions.
- Text-first human input.
- 2D CSS table.
- Deterministic client-owned character visual states.
- OpenAI NPC JSON turns.
- Deterministic fallback turns.
- Direct ElevenLabs REST TTS.
- Browser speech synthesis fallback.
- Local ambience and UI sounds.

## Avoid Unless Explicitly Requested

- Tailwind migration.
- Three.js/R3F.
- Bun/Hono split.
- SQLite persistence.
- ElevenLabs Agents/WebRTC.
- Custom LLM SSE.
- shadcn.
- Broad platform architecture.

## Cleanup Targets

- Remove stale API routes that bypass redaction.
- Keep one shared seeded shuffle helper.
- Keep one shared role-action helper.
- Keep one shared speech mention/stance helper.
- Split large UI code by current behavior boundaries.
- Keep docs describing the code that exists today.
- Keep character asset generation scriptable through `generate:character` and `generate:character-states`.
