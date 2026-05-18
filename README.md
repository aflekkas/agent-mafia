# Agent Mafia

Single-player first-person Mafia game in noir Palermo. Six souls at a candlelit table. Five are AI NPCs (Don Vito, Salvatore, Rosa, Vincenzo, Carmela) with distinct ElevenLabs voices and personalities. One is you. Someone is Mafia. The Narrator speaks in classic Palermo noir. You play by speaking into a mic, accusing, lying, voting.

Built as a personal voice-first game prototype.

## One-Sentence Pitch

> First-person Mafia in noir Palermo where you play against five voiced AI NPCs around a candlelit table — and one of them is the Mafia.

## Product Pillars

| Pillar | Hook |
|---|---|
| **Voice-first loop** | Voice is the runtime. ElevenLabs Agents Platform, Multi-voice TTS, Scribe STT, Server Tools, Sound Effects, and Music make the characters feel present. |
| **Playable social deduction** | Real Mafia mechanics: the player receives a random role, speaks during their turn, votes, lies, and can win or lose. |
| **Noir AI theater** | Six souls at a candlelit table. Five are AIs. One is you. The Narrator speaks in restrained Palermo noir. |

## Design Priorities

- **Human-player layer.** Without it, this is a show. With it, it is an actual social-deduction game.
- **Voice as protocol.** Voice carries identity, role, phase, and atmosphere instead of acting as bolt-on narration.
- **A distinctive premise.** The table should feel weird immediately: five voiced AI suspects and one human participant.
- **Visual signature** — Three.js POV pan camera, pixelated post-process, candlelit table, dark/gloomy. Indie aesthetic, anti-generic.
- **Shareable moments.** Agent personalities, narrator delivery, and the human at the table should produce short, memorable clips.

## Files

- `CLAUDE.md` — Claude context and decisions
- `AGENTS.md` — 5 personas (Italian names) + Narrator + human player mechanics + voice tag mapping
- `VOICES.md` — ElevenLabs stack (Agents/TTS/STT/SFX/Music), voice picks, audio tags, Custom LLM SSE
- `BUILD.md` — architecture + implementation spine + decision gates + prep checklist + risks + reference repos + borrow list
- `DEMO.md` — local demo flow, video outline, shareable clip direction, and aesthetic direction

## Status

Personal prototype planning phase. Current focus is defining the playable loop, voice architecture, visual direction, and fallback paths before expanding implementation scope.
