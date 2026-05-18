# Demo Plan

This document keeps the demo focused on the personal-project experience: a local playable round, a concise product video, a short shareable clip, and a clear noir aesthetic.

## Demo Goals

| Goal | Pitch line |
|---|---|
| **Voice-first loop** | Voice is the runtime. Agents Platform, Multi-voice TTS, Scribe STT, Server Tools, Sound Effects, and Music all serve the playable round. |
| **Playable social deduction** | The human plays one round against five voiced AI NPCs and receives a random secret role like anyone else. |
| **Noir AI theater** | Reality TV with AI suspects: six souls at a candlelit Palermo table, five of them generated, one of them human. |

### Voice angle

> Voice is load-bearing across input, output, identity, and atmosphere, not bolt-on TTS. The game uses the voice stack as a coherent product:
>
> - **Agents Platform** — one agent session owns conversation, WebRTC transport, and turn-taking. The backend is the Custom LLM endpoint.
> - **Multi-voice TTS (v3 Expressive)** — six distinct voices in one agent via XML tags. Audio tags shift by phase: Mafia `[whispers]` at night, accusations `[indignant]` at vote, Narrator `[grave]` at elimination.
> - **Scribe STT** — the human plays Mafia by speaking. Their voice is captured, transcribed, and fed into game state.
> - **Sound Effects** — generative gunshot at elimination, footsteps and bells at night, candle flicker. Tied to game state, never canned.
> - **Music** — atmospheric noir bed loops between phases.
>
> Without the voice layer this is a chat log. With it, it becomes a performed game.

**Demo emphasis:** play voices back-to-back so the character distinctness is obvious. Use a whisper-to-shout cut. Show multi-voice config and the custom LLM URL only when explaining the architecture.

**Avoid:** describing the project as "we used TTS." Describe it as "voice-as-protocol" because voice carries identity, role, phase, and drama.

### Game angle

> Mafia, but you play with five voiced AIs at a candlelit table in Palermo. Each has a distinct voice and personality: Don Vito hedges philosophically, Salvatore smooth-talks, Vincenzo shouts, Carmela snarks, Rosa overshares. You get a random secret role same as anyone else: Mafia, Detective, Doctor, or Villager. You talk by voice, lie by voice, vote by voice. Inner monologues for AIs are logged and replayed at game end so you can watch the deception after the fact.

**Demo emphasis:** the player can complete a short round locally in roughly five minutes. Narrator lines frame phase transitions, the visual table communicates stakes, and speed mode keeps the run moving.

**Avoid:** competing on graphics polish alone. The product is a voice game plus social deduction with AIs at the table.

### Weirdness angle

> Six souls at a candlelit table in noir Palermo. Five of them are frontier-LLM-driven characters with distinct voices. One of them is you. Someone is Mafia. The Narrator speaks in noir. You have been talking for thirty seconds and you are already lying.

**Demo emphasis:** the premise should be legible the moment the table appears. No separate explainer surface should be needed before play starts.

## Aesthetic Direction

Noir Palermo. Three.js POV pan camera at a wooden table. Five silhouettes around in a horseshoe. Candle in the middle, flickering point light, dust motes. Pixelation post-process (`RenderPixelatedPass`, pixelSize=5). Mouse-pan +/-3 degrees, dampened. Pixel-art UI overlay (Public Pixel font, Pixelarticons).

Reference mood: Red Strings Club (neon noir bartending dialogue), Cosa Nostra (period palette), GOON CITY, Streetlight Syndicate (1920s crime), Drawn Down (table lighting). All itch.io.

Voice-reactive scene state:
- Active speaker -> billboard glows + audio waveform halo
- Narrator -> all silhouettes dim, candle brightens slightly
- Night phase -> lights drop to ~5%, only candle visible
- Elimination -> blood-red flash + gunshot SFX, billboard goes dark permanently

See `BUILD.md` section "Three.js + Pixel UI" for implementation refs.

## Demo Flow

**Setup:** local laptop, optional external monitor, speakers or headphones, and a USB mic if available.

| Time | What happens |
|---|---|
| 0:00-0:10 | POV scene is already running. Narrator: `[ominous]` "Six souls at this table..." |
| 0:10-0:20 | Player sees "You are Player 6. Speak when the mic glows. Game pauses for you." Role card flips privately. |
| 0:20-1:00 | Night 1. Player acts if Mafia, Detective, or Doctor. Otherwise sleeps. SFX bells + footsteps. |
| 1:00-3:00 | Day 1. Agent exchange, one or two player turns, voice-reactive billboards, vote phase, elimination + gunshot SFX. |
| 3:00-4:30 | Round 2 compressed. Game resolves or reaches a clear stopping point. |
| 4:30-5:00 | Optional replay beat: show hidden inner monologues that explain the deception. |

### Speed Mode

Default pacing = 90s rounds. **Speed mode** = 30s rounds with turns capped at 5s and faster TTS. Keep this as a runtime toggle.

### Pre-Staged Scenarios

- **Scenario A:** Don Vito is Mafia, plays innocent, and creates a strong "AI lying" moment.
- **Scenario B:** Salvatore betrays Carmela mid-discussion for a turncoat moment.
- **Scenario C:** Vincenzo accuses everyone and accidentally lands on the right target.

Save game state snapshots so the demo can restart into a known good run.

## Product Video Outline

Target length: 2-3 minutes.

| Time | Beat |
|---|---|
| 0:00-0:10 | Cold open: black screen, candle ignites. Don Vito voice `[whispers]` "I am the Mafia tonight. There are five other souls at this table. One of them is you." Title card: AGENT MAFIA. |
| 0:10-0:30 | Concept: "First-person Mafia in noir Palermo. You play vs 5 AI NPCs by voice. Each has a distinct ElevenLabs voice and personality." Show POV scene. |
| 0:30-1:30 | Highlight reel: accusations, votes, elimination, Narrator transition, human player turn with Scribe STT subtitle, gunshot SFX, inner-monologue replay. |
| 1:30-2:00 | Tech: one agent + six voices via multi-voice tags, custom LLM SSE, local game state, server tools, SFX/Music. |
| 2:00-2:30 | Why it matters: "LLMs become characters with voices, identities, secrets, and a seat at the table." |
| 2:30-3:00 | Close: "Agent Mafia." Demo URL if available. |

### Production Notes

- Record screen with OBS during a pre-staged Scenario A run.
- Keep voice-over minimal; let character voices carry.
- Caption every important line.
- Music: low-tempo lo-fi during explainer, candle ambient during game scenes, ominous synth at elimination.
- Prefer clear 1080p capture over complex edits.

## Shareable Clip

Target length: 30 seconds.

### Hook (0-3s)

> Title card: "We made 5 AIs play Mafia. With us."
> Cut to: Don Vito voice `[contemplative]` "Salvatore, you've been awfully quiet."

### Mid (3-20s)

Pure dialogue, no narration:
- Salvatore `[reassuring]`: "Don Vito, my friend, paranoia is a Mafia tactic."
- Vincenzo `[shouting]`: "ENOUGH. SOMEONE KILLED ROSA. WHO?"
- Carmela `[smug]`: "Lol Vincenzo just gave away he's the Detective."
- Rosa `[confused]`: "Wait, did Vincenzo actually...?"
- Player 6, Scribe-transcribed subtitle: "I think we vote Salvatore."

### Payoff (20-30s)

Narrator `[grave]`: "The town has spoken. Salvatore falls." SFX gunshot. Candle dims one notch. End card: "Agent Mafia."

## Local Demo Checklist

- Laptop power and audio output are stable.
- Mic permission flow has been tested.
- Text input fallback works.
- Mute/skip controls work.
- Scenario seeds load quickly.
- One complete run works twice in a row.
- Architecture diagram is available locally for explanation.
