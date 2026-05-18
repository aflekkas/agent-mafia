# Agent Mafia

Single-player first-person Mafia game in noir Palermo. Six souls at a candlelit table. Five are AI NPCs (Don Vito, Salvatore, Rosa, Vincenzo, Carmela) with distinct ElevenLabs voices and personalities. One is you. Two are Mafia. The Narrator speaks in classic Palermo noir. You play by typing accusations, lies, and votes, with an optional browser mic helper for filling the text box.

Built as a personal voice-first game prototype.

## One-Sentence Pitch

> First-person Mafia in noir Palermo where you play against five voiced AI NPCs around a candlelit table — and two of them are Mafia.

## Product Pillars

| Pillar | Hook |
|---|---|
| **Voiced table loop** | NPC and narrator voices, Sound Effects, and Music make the characters feel present while human input stays text-first. |
| **Playable social deduction** | Real Mafia mechanics: the player receives a random role, speaks during their turn, votes, lies, and can win or lose. |
| **Noir AI theater** | Six souls at a candlelit table. Five are AIs. One is you. The Narrator speaks in restrained Palermo noir. |

## Design Priorities

- **Human-player layer.** Without it, this is a show. With it, it is an actual social-deduction game.
- **Voice as performance.** NPC and narrator voice carries identity, role, phase, and atmosphere instead of acting as bolt-on narration.
- **A distinctive premise.** The table should feel weird immediately: five voiced AI suspects and one human participant.
- **Visual signature** — Three.js POV pan camera, pixelated post-process, candlelit table, dark/gloomy. Indie aesthetic, anti-generic.
- **Shareable moments.** Agent personalities, narrator delivery, and the human at the table should produce short, memorable clips.

## Run Locally

This project uses `npm`.

```bash
npm install
npm run dev -- -p 3001
```

Open `http://localhost:3001`.

Optional AI/voice keys live in `.env`. Copy `.env.example` if needed. With no ElevenLabs key, the app keeps a browser voice fallback. Human input is text-first.

## Files

- `CLAUDE.md` — Claude context and decisions
- `AGENTS.md` — 5 personas (Italian names) + Narrator + human player mechanics + voice tag mapping
- `VOICES.md` — ElevenLabs stack (Agents/TTS/SFX/Music), voice picks, audio tags, Custom LLM SSE
- `BUILD.md` — architecture + implementation spine + decision gates + prep checklist + risks + reference repos + borrow list
- `DEMO.md` — local demo flow, video outline, shareable clip direction, and aesthetic direction

## Status

Phase 1 is a local playable prototype: real role assignment, detective-only Mafia lead, Mafia partner awareness, first-night safety, night actions, randomized day discussion, voting, elimination, win/loss checks, OpenAI-backed NPC dialogue with fallbacks, Player 6 input, transcript, role card, noir table UI, pause/new-game controls, and in-app sound controls.
