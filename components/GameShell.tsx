"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GameState, Phase, Player, PlayerId, SpeakerId, TranscriptEntry } from "@/lib/game/types";

type ApiGameResponse = {
  game: GameState;
  error?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
};

type BrowserSpeechWindow = Window & {
  SpeechRecognition?: new () => BrowserSpeechRecognition;
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition;
};

type VoiceMode = "browser" | "elevenlabs";

const AUDIO_MUTED_STORAGE_KEY = "agent-mafia.audioMuted";

const ROLE_COPY: Record<string, string> = {
  mafia: "Lie, survive, and bring the town down to parity.",
  detective: "Investigate at night. Use truth carefully.",
  doctor: "Save one soul each night. Guess well.",
  villager: "No power. Read the room and vote.",
  unknown: "Hidden until the game ends."
};

export function GameShell() {
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [humanText, setHumanText] = useState("");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [audioMuted, setAudioMuted] = useState(true);
  const voiceMode: VoiceMode = "browser";
  const spokenEntryRef = useRef<string | null>(null);
  const elevenLabsAudioCacheRef = useRef<Map<string, Blob>>(new Map());

  const human = useMemo(() => game?.players.find((player) => player.id === "player_6"), [game]);
  const latestPublicEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length).at(-1) ?? null;
  }, [game]);

  useEffect(() => {
    const storedMute = window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY);
    const shouldMute = storedMute === null ? true : storedMute === "true";
    window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, String(shouldMute));
    setAudioMuted(shouldMute);
    if (shouldMute && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  useEffect(() => {
    if (!latestPublicEntry || spokenEntryRef.current === latestPublicEntry.id) {
      return;
    }
    spokenEntryRef.current = latestPublicEntry.id;
    if (audioMuted) {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setStatus("Sound muted.");
      return;
    }
    void speakEntry(latestPublicEntry, voiceMode, elevenLabsAudioCacheRef.current, setStatus);
  }, [audioMuted, latestPublicEntry, voiceMode]);

  useEffect(() => {
    if (!game || busy || game.currentPrompt || game.phase === "game-over") {
      return;
    }

    const delay = game.phase === "role-reveal" ? 3600 : latestPublicEntry?.kind === "speech" ? 3200 : 1600;
    const timer = window.setTimeout(() => {
      void advance(false);
    }, delay);

    return () => window.clearTimeout(timer);
  });

  async function start(seed?: string) {
    setBusy(true);
    setStatus("Starting game.");
    try {
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed })
      });
      const data = (await response.json()) as ApiGameResponse;
      setGame(data.game);
      setHumanText("");
      spokenEntryRef.current = null;
      setStatus(seed ? `Loaded ${seed}.` : "New game started.");
    } finally {
      setBusy(false);
    }
  }

  async function advance(loop = false) {
    if (!game || busy) {
      return;
    }

    setBusy(true);
    setStatus(loop ? "Advancing to next player decision." : "Advancing.");
    try {
      let current = game;
      const maxSteps = loop ? 12 : 1;
      for (let step = 0; step < maxSteps; step += 1) {
        if (current.currentPrompt || current.phase === "game-over") {
          break;
        }
        const response = await fetch(`/api/game/${current.id}/action`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type: "advance" })
        });
        const data = (await response.json()) as ApiGameResponse;
        current = data.game;
        setGame(current);
        if (current.currentPrompt || current.phase === "game-over") {
          break;
        }
      }
      setStatus(current.currentPrompt ? "Your move." : current.phase === "game-over" ? "Game over." : "Advanced.");
    } finally {
      setBusy(false);
    }
  }

  async function submitSpeech() {
    if (!game || !humanText.trim()) {
      return;
    }
    setBusy(true);
    setStatus("Submitting your speech.");
    try {
      const response = await fetch(`/api/game/${game.id}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "speech", text: humanText })
      });
      const data = (await response.json()) as ApiGameResponse;
      setGame(data.game);
      setHumanText("");
      setStatus("Speech submitted.");
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const speechWindow = window as BrowserSpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Speech recognition is not available in this browser. Type your line instead.");
      return;
    }

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) {
        setHumanText((existing) => `${existing}${existing ? " " : ""}${transcript}`.trim());
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setStatus("Mic capture failed. Type your line instead.");
    };
    recognition.onend = () => {
      setListening(false);
    };
    setListening(true);
    setStatus("Listening.");
    recognition.start();
  }

  async function submitVote(targetId: PlayerId) {
    if (!game) {
      return;
    }
    setBusy(true);
    setStatus("Casting vote.");
    try {
      const response = await fetch(`/api/game/${game.id}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "vote", targetId })
      });
      const data = (await response.json()) as ApiGameResponse;
      setGame(data.game);
      setStatus("Vote cast.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNightAction(targetId: PlayerId) {
    if (!game) {
      return;
    }
    setBusy(true);
    setStatus("Submitting night action.");
    try {
      const response = await fetch(`/api/game/${game.id}/action`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "night", targetId })
      });
      const data = (await response.json()) as ApiGameResponse;
      setGame(data.game);
      setStatus("Night action submitted.");
    } finally {
      setBusy(false);
    }
  }

  function toggleAudioMuted() {
    setAudioMuted((muted) => {
      const nextMuted = !muted;
      window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, String(nextMuted));
      if (nextMuted && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setStatus(nextMuted ? "Sound muted." : "Sound on.");
      return nextMuted;
    });
  }

  const isHome = !game || !human;

  return (
    <main className={`shell ${isHome ? "home-shell" : ""}`}>
      {isHome ? null : (
        <section className="topbar">
          <div>
            <p className="eyebrow">Voice-first social deduction</p>
            <h1>Agent Mafia</h1>
          </div>
          <button
            type="button"
            className={`mute-button ${audioMuted ? "muted" : ""}`}
            onClick={toggleAudioMuted}
            aria-pressed={audioMuted}
            aria-label={audioMuted ? "Unmute game sound" : "Mute game sound"}
            title={audioMuted ? "Unmute game sound" : "Mute game sound"}
          >
            {audioMuted ? "Sound Off" : "Sound On"}
          </button>
        </section>
      )}

      {isHome ? (
        <section className="empty-state">
          <div className="empty-copy">
            <p className="eyebrow">Voice-first social deduction</p>
            <h2>Six seats. Five voices. One secret.</h2>
            <button onClick={() => start()} disabled={busy}>Start Game</button>
          </div>
        </section>
      ) : (
        <section className="game-grid">
          <aside className="left-rail">
            <RoleCard player={human} />
            <PhasePanel game={game} status={status} busy={busy} />
          </aside>

          <section className="stage-panel">
            <TableScene2D game={game} />
            <HumanPanel
              game={game}
              humanText={humanText}
              setHumanText={setHumanText}
              busy={busy}
              listening={listening}
              onSubmitSpeech={submitSpeech}
              onStartListening={startListening}
              onSubmitVote={submitVote}
              onSubmitNightAction={submitNightAction}
            />
          </section>

          <aside className="right-rail">
            <Transcript game={game} />
            <VoteBoard game={game} />
          </aside>
        </section>
      )}
    </main>
  );
}

function RoleCard({ player }: { player: Player }) {
  return (
    <section className={`role-card role-${player.role}`}>
      <p className="eyebrow">Private Role</p>
      <h2>{player.role}</h2>
      <p>{ROLE_COPY[player.role]}</p>
      <p className="private-note">Only Player 6 sees this card.</p>
    </section>
  );
}

function PhasePanel({ game, status, busy }: { game: GameState; status: string; busy: boolean }) {
  return (
    <section className="panel">
      <p className="eyebrow">Phase</p>
      <h2>{formatPhase(game.phase)}</h2>
      <p>Day {game.day}</p>
      {game.winner ? <p className="winner">{game.winner === "town" ? "Town wins" : "Mafia wins"}</p> : null}
      <p className="status-line">{busy ? "Working..." : status}</p>
      {game.lastError ? <p className="error-line">{game.lastError}</p> : null}
    </section>
  );
}

function TableScene2D({ game }: { game: GameState }) {
  const active = game.activeSpeakerId;
  const bubble = game.transcript.filter((entry) => !entry.privateTo?.length && ["speech", "narration"].includes(entry.kind)).at(-1);
  return (
    <section className={`table-scene phase-${game.phase}`}>
      <div className="table-vignette" />
      <div className="table-core">
        <div className="candle">
          <span />
        </div>
        <p>{game.phase === "night" ? "Night in Palermo" : "The Palermo Table"}</p>
      </div>
      {game.players.map((player) => (
        <div
          key={player.id}
          className={`portrait seat-${player.seat} ${player.id === "player_6" ? "human-seat" : ""} ${
            player.alive ? "" : "dead"
          } ${active === player.id ? "active" : ""}`}
        >
          <div className="portrait-face">{player.name.slice(0, 1)}</div>
          <strong>{player.name}</strong>
          <span>{player.id === "player_6" ? "you" : player.alive ? suspicionLabel(player.suspicion) : "eliminated"}</span>
        </div>
      ))}
      {bubble ? (
        <div className={`speech-bubble ${bubble.speakerId === "narrator" ? "narrator-bubble" : ""}`}>
          <strong>{bubble.speakerName}</strong>
          <p>{bubble.text}</p>
        </div>
      ) : null}
      {game.eliminatedThisRound ? <div className="blood-flash" /> : null}
    </section>
  );
}

function HumanPanel({
  game,
  humanText,
  setHumanText,
  busy,
  listening,
  onSubmitSpeech,
  onStartListening,
  onSubmitVote,
  onSubmitNightAction
}: {
  game: GameState;
  humanText: string;
  setHumanText: (text: string) => void;
  busy: boolean;
  listening: boolean;
  onSubmitSpeech: () => void;
  onStartListening: () => void;
  onSubmitVote: (targetId: PlayerId) => void;
  onSubmitNightAction: (targetId: PlayerId) => void;
}) {
  const human = game.players.find((player) => player.id === "player_6");
  const prompt = game.currentPrompt;

  if (!prompt || !human?.alive) {
    return (
      <section className="human-panel idle">
        <p>{human?.alive ? "Wait for the table to turn toward you." : "You are out. Watch the table finish the work."}</p>
      </section>
    );
  }

  if (prompt === "human-speech") {
    return (
      <section className="human-panel">
        <p className="eyebrow">Your Turn</p>
        <textarea
          value={humanText}
          onChange={(event) => setHumanText(event.target.value)}
          placeholder="Accuse, defend, lie, or stall..."
          rows={4}
        />
        <div className="speech-actions">
          <button onClick={onStartListening} disabled={busy || listening} className={listening ? "listening" : ""}>
            {listening ? "Listening" : "Use Mic"}
          </button>
          <button onClick={onSubmitSpeech} disabled={busy || !humanText.trim()}>
            Submit Speech
          </button>
        </div>
      </section>
    );
  }

  if (prompt === "human-vote") {
    return (
      <TargetPanel
        title="Cast your vote"
        targets={game.players.filter((player) => player.alive && player.id !== "player_6")}
        busy={busy}
        onPick={onSubmitVote}
      />
    );
  }

  return (
    <TargetPanel
      title={nightPromptTitle(prompt)}
      targets={nightTargets(game)}
      busy={busy}
      onPick={onSubmitNightAction}
    />
  );
}

function TargetPanel({
  title,
  targets,
  busy,
  onPick
}: {
  title: string;
  targets: Player[];
  busy: boolean;
  onPick: (targetId: PlayerId) => void;
}) {
  return (
    <section className="human-panel">
      <p className="eyebrow">Player 6</p>
      <h3>{title}</h3>
      <div className="target-grid">
        {targets.map((target) => (
          <button key={target.id} onClick={() => onPick(target.id)} disabled={busy}>
            {target.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function Transcript({ game }: { game: GameState }) {
  const humanVisible = game.transcript.filter((entry) => !entry.privateTo || entry.privateTo.includes("player_6"));
  return (
    <section className="panel transcript-panel">
      <p className="eyebrow">Transcript</p>
      <div className="transcript-list">
        {humanVisible.map((entry) => (
          <article key={entry.id} className={`line kind-${entry.kind}`}>
            <strong>{entry.speakerName}</strong>
            <p>{entry.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function VoteBoard({ game }: { game: GameState }) {
  return (
    <section className="panel">
      <p className="eyebrow">Votes</p>
      {game.votes.length ? (
        <div className="vote-list">
          {game.votes.map((vote) => (
            <p key={vote.voterId}>
              {nameFor(game, vote.voterId)} {"->"} {nameFor(game, vote.targetId)}
            </p>
          ))}
        </div>
      ) : (
        <p>No votes cast.</p>
      )}
    </section>
  );
}

async function speakEntry(
  entry: TranscriptEntry,
  voiceMode: VoiceMode,
  elevenLabsAudioCache: Map<string, Blob>,
  setStatus: (status: string) => void
) {
  if (entry.kind !== "speech" && entry.kind !== "narration") {
    return;
  }

  if (voiceMode === "elevenlabs") {
    const cacheKey = `${entry.speakerId}:${entry.text}`;
    const cachedAudio = elevenLabsAudioCache.get(cacheKey);
    if (cachedAudio) {
      await playAudioBlob(cachedAudio);
      setStatus("Played cached ElevenLabs voice.");
      return;
    }

    try {
      const response = await fetch("/api/speak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          speakerId: entry.speakerId,
          text: entry.text
        })
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (response.ok && contentType.includes("audio/")) {
        const blob = await response.blob();
        elevenLabsAudioCache.set(cacheKey, blob);
        await playAudioBlob(blob);
        setStatus("Played ElevenLabs voice.");
        return;
      }
    } catch {
      // Browser speech fallback below.
    }
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${entry.speakerName}. ${entry.text}`);
    utterance.rate = browserVoiceRateFor(entry.speakerId);
    utterance.pitch = pitchFor(entry.speakerId);
    utterance.volume = entry.speakerId === "narrator" ? 0.92 : 1;
    utterance.voice = browserVoiceFor(entry.speakerId);
    window.speechSynthesis.speak(utterance);
    setStatus(voiceMode === "elevenlabs" ? "ElevenLabs unavailable; played browser voice." : "Played browser voice.");
  }
}

async function playAudioBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  audio.onerror = () => URL.revokeObjectURL(url);
  await audio.play();
}

function nightTargets(game: GameState): Player[] {
  const human = game.players.find((player) => player.id === "player_6");
  if (!human) {
    return [];
  }
  if (human.role === "mafia") {
    return game.players.filter((player) => player.alive && player.role !== "mafia");
  }
  if (human.role === "doctor") {
    return game.players.filter((player) => player.alive);
  }
  if (human.role === "detective") {
    return game.players.filter((player) => player.alive && player.id !== "player_6");
  }
  return [];
}

function nightPromptTitle(prompt: string): string {
  if (prompt === "human-night-mafia") {
    return "Choose who the Mafia kills";
  }
  if (prompt === "human-night-doctor") {
    return "Choose who to save";
  }
  if (prompt === "human-night-detective") {
    return "Choose who to investigate";
  }
  return "Choose a target";
}

function nameFor(game: GameState, id: PlayerId): string {
  return game.players.find((player) => player.id === id)?.name ?? id;
}

function formatPhase(phase: Phase): string {
  return phase
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function suspicionLabel(score: number): string {
  if (score <= 0) {
    return "quiet";
  }
  if (score === 1) {
    return "watched";
  }
  if (score === 2) {
    return "suspect";
  }
  return "under fire";
}

function pitchFor(speakerId: SpeakerId): number {
  if (speakerId === "rosa") {
    return 1.18;
  }
  if (speakerId === "carmela") {
    return 1.08;
  }
  if (speakerId === "vincenzo") {
    return 0.78;
  }
  if (speakerId === "narrator" || speakerId === "don_vito") {
    return 0.72;
  }
  return 0.95;
}

function browserVoiceRateFor(speakerId: SpeakerId): number {
  if (speakerId === "vincenzo") {
    return 1.12;
  }
  if (speakerId === "carmela") {
    return 1.06;
  }
  if (speakerId === "rosa") {
    return 1.03;
  }
  if (speakerId === "narrator") {
    return 0.78;
  }
  if (speakerId === "don_vito") {
    return 0.86;
  }
  return 0.94;
}

function browserVoiceFor(speakerId: SpeakerId): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const preferredNames: Partial<Record<SpeakerId, string[]>> = {
    narrator: ["Daniel", "Fred", "Grandpa", "Google UK English Male", "Microsoft George"],
    don_vito: ["Daniel", "Google UK English Male", "Microsoft George", "Alex"],
    salvatore: ["Alex", "Microsoft Guy", "Google US English", "Tom"],
    rosa: ["Samantha", "Victoria", "Google US English", "Microsoft Jenny"],
    vincenzo: ["Fred", "Ralph", "Microsoft Guy", "Alex"],
    carmela: ["Samantha", "Victoria", "Microsoft Aria", "Google US English"]
  };
  const preferred = preferredNames[speakerId] ?? [];

  return (
    preferred
      .map((name) => voices.find((voice) => voice.name.toLowerCase().includes(name.toLowerCase())))
      .find(Boolean) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en") && voice.localService) ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ??
    null
  );
}
