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

const ROLE_COPY: Record<string, string> = {
  mafia: "Lie, survive, and bring the town down to parity.",
  detective: "Investigate at night. Use truth carefully.",
  doctor: "Save one soul each night. Guess well.",
  villager: "No power. Read the room and vote."
};

export function GameShell() {
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [humanText, setHumanText] = useState("");
  const [muted, setMuted] = useState(false);
  const [autoPlay, setAutoPlay] = useState(true);
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const spokenEntryRef = useRef<string | null>(null);

  const human = useMemo(() => game?.players.find((player) => player.id === "player_6"), [game]);
  const latestPublicEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length).at(-1) ?? null;
  }, [game]);

  useEffect(() => {
    if (!latestPublicEntry || muted || spokenEntryRef.current === latestPublicEntry.id) {
      return;
    }
    spokenEntryRef.current = latestPublicEntry.id;
    void speakEntry(latestPublicEntry, setStatus);
  }, [latestPublicEntry, muted]);

  useEffect(() => {
    if (!game || !autoPlay || busy || game.currentPrompt || game.phase === "game-over") {
      return;
    }

    const delay = game.phase === "role-reveal" ? 2200 : latestPublicEntry?.kind === "speech" ? 2800 : 1400;
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
        const response = await fetch(`/api/game/${current.id}/advance`, {
          method: "POST"
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

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Uncommon Hacks 2026</p>
          <h1>Agent Mafia</h1>
        </div>
        <div className="topbar-actions">
          <button onClick={() => start()} disabled={busy}>
            New Game
          </button>
          <button onClick={() => start("scenario-a")} disabled={busy}>
            Scenario A
          </button>
          <button onClick={() => start("scenario-b")} disabled={busy}>
            Scenario B
          </button>
          <button onClick={() => setMuted((value) => !value)} className={muted ? "danger" : ""}>
            {muted ? "Muted" : "Voice On"}
          </button>
          <button onClick={() => setAutoPlay((value) => !value)} className={autoPlay ? "" : "danger"}>
            {autoPlay ? "Auto Play" : "Manual"}
          </button>
        </div>
      </section>

      {!game || !human ? (
        <section className="empty-state">
          <div className="empty-scene" aria-hidden="true">
            <div className="candle-mark" />
            <div className="empty-seat seat-a" />
            <div className="empty-seat seat-b" />
            <div className="empty-seat seat-c" />
            <div className="empty-seat seat-d" />
            <div className="empty-seat seat-e" />
          </div>
          <div className="empty-copy">
            <h2>Six seats. Five voices. One secret.</h2>
            <p>Speak, accuse, vote. The table handles the rest.</p>
            <button onClick={() => start()} disabled={busy}>
              Start Booth Demo
            </button>
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
              onBegin={() => advance(false)}
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

function ControlPanel({
  game,
  busy,
  onAdvance
}: {
  game: GameState;
  busy: boolean;
  onAdvance: (loop?: boolean) => void;
}) {
  const blocked = Boolean(game.currentPrompt) || game.phase === "game-over";
  return (
    <section className="panel controls">
      <button onClick={() => onAdvance(false)} disabled={busy || blocked}>
        Continue
      </button>
      <button onClick={() => onAdvance(true)} disabled={busy || blocked}>
        Run To Player
      </button>
      <p>{game.currentPrompt ? "Waiting for Player 6." : "Auto Play advances NPC and narrator turns."}</p>
    </section>
  );
}

function TableScene2D({ game }: { game: GameState }) {
  const active = game.activeSpeakerId;
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
          className={`portrait seat-${player.seat} ${player.alive ? "" : "dead"} ${active === player.id ? "active" : ""}`}
        >
          <div className="portrait-face">{player.name.slice(0, 1)}</div>
          <strong>{player.name}</strong>
          <span>{player.alive ? suspicionLabel(player.suspicion) : "eliminated"}</span>
        </div>
      ))}
      {active === "narrator" ? <div className="narrator-glow">Narrator</div> : null}
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
  onBegin,
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
  onBegin: () => void;
  onSubmitSpeech: () => void;
  onStartListening: () => void;
  onSubmitVote: (targetId: PlayerId) => void;
  onSubmitNightAction: (targetId: PlayerId) => void;
}) {
  const human = game.players.find((player) => player.id === "player_6");
  const prompt = game.currentPrompt;

  if (prompt === "role-reveal-ready") {
    return (
      <section className="human-panel role-ready">
        <p className="eyebrow">You are {human?.role}</p>
        <h3>Read your card. The table will wait.</h3>
        <p>{human ? ROLE_COPY[human.role] : "Your private role is ready."}</p>
        <button onClick={onBegin} disabled={busy}>
          Begin First Night
        </button>
      </section>
    );
  }

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

async function speakEntry(entry: TranscriptEntry, setStatus: (status: string) => void) {
  if (entry.kind !== "speech" && entry.kind !== "narration") {
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
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setStatus("Played ElevenLabs voice.");
      return;
    }
  } catch {
    // Browser speech fallback below.
  }

  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(`${entry.speakerName}. ${entry.text}`);
    utterance.rate = entry.speakerId === "vincenzo" ? 1.08 : entry.speakerId === "narrator" ? 0.82 : 0.95;
    utterance.pitch = pitchFor(entry.speakerId);
    window.speechSynthesis.speak(utterance);
    setStatus("Played browser voice fallback.");
  }
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
