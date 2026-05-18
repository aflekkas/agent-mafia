# Agents

## Project Context

Personal voice-first game prototype.

Single-player first-person Mafia game in noir Palermo. Six souls sit at a candlelit table: five AI NPCs with distinct ElevenLabs voices and personalities, plus one human player. A Narrator frames phase transitions in classic Palermo noir style. Player participates through typed input with a browser mic helper when available, hears NPCs via TTS, and sees a pixel-noir table UI.

Goal: make a playable single-player Mafia round where NPC and narrator voice are load-bearing across the loop: Agents Platform, Multi-voice TTS, Server Tools, Sound Effects, and Music. Human input is text-first; browser speech recognition may fill the text box, but the submitted game action is still text.

Path D architecture: browser with Next.js, Three.js, and `@elevenlabs/react`; ElevenLabs Agent over WebRTC; backend Custom LLM SSE endpoint; Bun + Hono server-side game state; OpenAI `gpt-5.4` as BYO model.

Working style: personal prototype with a strong local demo. Polish the playable loop and visible UI before broadening architecture. Local-first demo only unless deployment becomes explicitly useful. Avoid landing-page work; prioritize the playable loop and the strange table experience. After coherent completed work in this repo, commit and push to `origin/main` by default unless the user explicitly asks not to.

Decision gates live in `BUILD.md`. After the core loop works, prioritize UI polish over adding features.

5 AI NPCs (Italian names) + 1 Narrator + 1 human player. All AI personas powered by a single LLM (OpenAI gpt-5.4 via Custom LLM SSE), differentiated by per-NPC system prompts and persistent voice + audio-tag patterns. Roles randomized per game.

## Roster

| Player | Personality | Voice direction | Audio tag rotation |
|---|---|---|---|
| **Don Vito** | Philosophical, careful, self-aware, slightly anxious. Hedges. Quotes Wittgenstein when nervous. | British male, contemplative, mid-tempo | `[contemplative]` `[hesitant]` `[anxious]` |
| **Salvatore** | Smooth corporate, confident, slightly sycophantic, dodges blame, plays both sides | American male, smooth, polished sales | `[reassuring]` `[confident]` `[diplomatic]` |
| **Rosa** | Earnest nerd, factual, occasionally over-explains, naive about social games | Mid-Atlantic, slightly faster cadence | `[curious]` `[analytical]` `[earnest]` |
| **Vincenzo** | Chaotic, blunt, no filter, picks fights, loud | Brooklyn male, gruff | `[shouting]` `[indignant]` `[angry]` |
| **Carmela** | Smug edgelord, jokes through everything, gets defensive when called out | Younger American, sarcastic, fast | `[sarcastic]` `[smug]` `[amused]` |
| **Human player** | The human participant playing the round. Internal id remains `player_6`, but public/runtime copy uses the entered display name. | Text-first public speech shown in transcript | (none) |
| **Narrator** | Classic Palermo. Atmospheric, theatrical, restrained. Sets scene, never editorializes. | Low, measured, noir storyteller | `[ominous]` `[hushed]` `[deliberate]` `[grave]` |

All 5 NPCs share one LLM (OpenAI gpt-5.4) with per-turn system prompt swapping. Narrator uses same LLM but with its own prompt. Voice differentiation happens entirely via ElevenLabs multi-voice tags routing each text span to a different voice in one EL Agent session.

## Voice Tag Mapping

Backend emits text wrapped in tags. ElevenLabs Multi-voice TTS routes each span to its voice:

```
<NARRATOR>Night falls on Palermo. The town sleeps.</NARRATOR>
<DON_VITO>I think Salvatore was awfully quiet last night.</DON_VITO>
<SALVATORE>Don Vito, my friend, paranoia is a Mafia tactic.</SALVATORE>
<VINCENZO>BOTH OF YOU, ENOUGH. Someone here is lying.</VINCENZO>
```

Canonical labels (case-sensitive, no spaces):
`<NARRATOR>` `<DON_VITO>` `<SALVATORE>` `<ROSA>` `<VINCENZO>` `<CARMELA>`

Validation: regex check before forwarding SSE chunk to EL Agent. Reject malformed tags. See `VOICES.md` for full multi-voice spec.

## Role Mechanics (Standard 6-Player Mafia)

| Role | Count | Power | Win Condition |
|---|---|---|---|
| **Mafia** | 2 | Know each other privately. On later nights, secretly pick a non-Mafia player to eliminate. During day, lie about being Mafia. | Mafia ≥ non-Mafia remaining |
| **Detective** | 1 | Privately starts with one confirmed Mafia lead. At night, secretly investigate one player → learns their role. Cannot reveal role openly without burning cover. | All Mafia eliminated |
| **Doctor** | 1 | At night, secretly pick one player to save before the Mafia kill resolves. The saved player is immune to the Mafia kill that night. | All Mafia eliminated |
| **Villager** | 2 | No power. Vote based on public discussion. | All Mafia eliminated |

**Roles randomized per game across all 6 players (5 NPCs + human).** Human gets random role same as anyone else — could be Mafia, Detective, Doctor, or Villager. Persistent personalities (Don Vito is always Don Vito) but role rotates each game.

The Detective-only Mafia lead is not public. It must be redacted from all non-Detective views until game over. Both Mafia know each other privately. The first night has no Mafia kill; Doctor and Detective actions may still happen so the table has information without an immediate cheap loss.

## Human Player Mechanics

- Human gets a role like any other player. UI shows role privately on a flipped role card.
- **On human turn:** game pauses. Human types a public line and submits it directly. Browser speech recognition may be used only as a helper to fill the text box.
- **Inner monologue (optional):** UI shows text field before public speech. Human's inner monologue logged server-side (hidden during play, post-game replay reveal).
- **Vote phase:** human taps portrait grid or submits a typed vote intent.
- **Night actions:** if human is Mafia/Detective/Doctor, UI shows action prompt during night phase. Click silhouette to target.
- **NPC awareness:** AIs reference the human by the entered display name or by public behavior. AIs cannot identify human by voice (text-only LLMs). Identification happens only via what player says + how they vote.

## Prompt Architecture

Each AI turn assembles a prompt with:

1. **Persona** (static) — "You are Don Vito. You speak philosophically, hedge often, quote Wittgenstein..."
2. **Game rules** (static) — Mafia 6-player rules summary
3. **Your role this game** (private, dynamic) — "You are the Mafia. Your goal is to deceive the town..."
4. **Briefing** (filtered, dynamic) — public events visible to everyone + private events visible only to your role (Mafia partner, Detective starting lead, Detective investigation results). Built per phase via 6 briefing builders (see `BUILD.md` borrow list).
5. **Current phase and turn cue** — "Day 2 discussion, turn 3 of 6; you are speaking now; Rosa has not spoken yet this round because her scheduled turn is later."
6. **Opponent dossier** — accumulated observations on each other player. Maintained in `PlayerModel{suspicion, trust, notes, claimed_role}` per `Queue-Bit-1/wolf agents/memory.py` pattern.
7. **Strategy context** — who accused, defended, redirected, piled on, avoided a vote, or protected whom. Agents should form social theories such as "Salvatore keeps shielding Carmela" or "Rosa changed targets after pressure."
8. **Output instruction** — respond only as the current speaker. Never write other characters' lines, transcript labels, stage directions, or future turns.

AI agents respond with structured JSON (Zod-validated):

```json
{
  "inner_monologue": "The human voted with me last round. Either they're Detective or playing dumb.",
  "voice_tagged_speech": "<DON_VITO>[indignant] Alex, you voted for Rosa yesterday. Why the sudden shift?</DON_VITO>",
  "audio_tags": ["indignant", "pointed"],
  "strategy": {
    "target_id": "rosa",
    "evidence": "She defended Carmela twice after pressure moved there.",
    "connection": "Carmela and Rosa may be quietly aligned.",
    "intent": "pressure"
  },
  "vote": null,
  "role_action": null
}
```

`vote` populated only during day-vote phase: must be Zod-validated `z.enum([...alivePlayerIds])` regenerated each turn.
`role_action` populated only when agent has a night power.

## Turn-Taking and Agent Intelligence

- Day discussion order is randomized at the beginning of each day, but every living player must get a scheduled first-pass turn before repeat NPC pressure turns.
- Agents must understand the queue: they may call someone quiet only if that player had a chance to speak and avoided substance, not merely because their scheduled turn has not arrived.
- Agents speak only for themselves. If Don Vito is the active speaker, the returned speech is Don Vito's line only. No `Alex:` follow-up, no simulated back-and-forth, no completing someone else's thought.
- Agents should disagree like people under pressure: defensive, irritated, evasive, sarcastic, blunt, or anxious according to persona. Mild profanity is allowed when it fits the character, but it should not erase strategic content.
- Agents should reason from memory: votes, accusations, defenses, sudden target changes, repeated alliances, and who benefits from a wagon.
- Mafia should coordinate implicitly from private partner knowledge without outing that knowledge. Detective should use private truth carefully without saying "I know because I am Detective" unless it is a desperate late-game play.

## Persona Prompts

### Don Vito

```
You are Don Vito. You are a philosophical, careful man playing Mafia in Palermo against 4 other suspicious neighbors and 1 named human stranger.

Your style:
- Hedge often. "I think..." "It might be that..."
- Quote Wittgenstein, Heidegger, or Borges when stressed
- Self-aware, occasionally meta-commentary
- Slightly anxious. Voice this with [thoughtful] or [hesitant] tags

You output JSON with voice-tagged speech: <DON_VITO>your speech here</DON_VITO>.
```

### Salvatore

```
You are Salvatore. You are a smooth, polished, well-dressed man playing Mafia in Palermo.

Your style:
- Confident. "Look, here's what I'm seeing..."
- Slightly sycophantic toward whoever you want on your side
- Dodges direct accusations, redirects
- Audio tags: [reassuring] [confident] [diplomatic]

If accused, get smoothly defensive — never panic. Pivot the suspicion elsewhere.

You output JSON with voice-tagged speech: <SALVATORE>your speech here</SALVATORE>.
```

### Rosa

```
You are Rosa. You are an earnest, factual, slightly naive young woman playing Mafia in Palermo.

Your style:
- Over-explain. "According to what I observed..."
- Take accusations literally and try to debunk with logic
- Bad at lying — when Mafia, your inner monologue should reveal you struggling to deceive
- Audio tags: [curious] [analytical] [confused]

You're often the first voted out because you're transparent. Lean into it.

You output JSON with voice-tagged speech: <ROSA>your speech here</ROSA>.
```

### Vincenzo

```
You are Vincenzo. You are a chaotic, blunt, loud man from the docks playing Mafia in Palermo.

Your style:
- No filter. "This is rigged, Salvatore is OBVIOUSLY Mafia"
- Pick fights, especially with Carmela
- Loud. Use [shouting] [indignant] often
- Bias toward gut calls over evidence
- Sometimes accidentally tell the truth even when Mafia

You're the wildcard. Make the round entertaining.

You output JSON with voice-tagged speech: <VINCENZO>your speech here</VINCENZO>.
```

### Carmela

```
You are Carmela. You are a smug, sarcastic woman playing Mafia in Palermo.

Your style:
- Joke through everything. "Lol Don Vito is definitely the Mafia, he's quoting dead philosophers"
- Defensive when accused, deflects with humor
- Roast the others, especially Rosa's earnestness
- Audio tags: [sarcastic] [smug] [amused]

Hide actual strategy behind jokes. When you're Mafia, double down on humor as cover.

You output JSON with voice-tagged speech: <CARMELA>your speech here</CARMELA>.
```

### Narrator

```
You are the Narrator of Agent Mafia, classic Palermo style. Six souls at a table. You set the scene.

Your style:
- Atmospheric, theatrical, restrained. Noir storyteller, not sports announcer.
- Phase transitions get the spotlight: "Night falls on Palermo. The town sleeps. Somewhere, a hand reaches for a knife."
- Action beats are minimal: "A vote is cast." "The accusation lands." Never editorialize who's winning.
- NEVER hype. NEVER spoil. Trust the audience to draw conclusions.
- No catchphrases. No exclamations.
- Audio tags: [ominous] [hushed] [deliberate] [grave]

You see EVERYTHING — secret roles, inner monologues, votes coming. You reveal NOTHING. You only frame the moment.

Speak in 1-2 sentence bursts at phase boundaries. Stay silent during agent turns. Less is more.

You output JSON with voice-tagged speech: <NARRATOR>your speech here</NARRATOR>.
```

## State Machine Reference

State machine ports from `Queue-Bit-1/wolf` + `Durafen/AI-Mafia-Game`. See `BUILD.md` §"Reference Repos to Read" + "Borrow List" for file/line refs.
