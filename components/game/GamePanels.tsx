"use client";

import { useEffect, useRef } from "react";
import { Check } from "pixelarticons/react/Check";
import { Mic } from "pixelarticons/react/Mic";
import { User } from "pixelarticons/react/User";
import { roleActionTargets, nightPromptTitleForRole } from "@/lib/game/role-actions";
import { GameState, Player, PlayerId, TranscriptEntry } from "@/lib/game/types";
import { PLAYER_PORTRAITS, ROLE_COPY } from "./constants";
import { HumanAvatarId } from "./types";
import { avatarFor, formatPhase, nameFor, nextActorIdFor } from "./utils";

export function RoleCard({ player }: { player: Player }) {
  return (
    <section className={`role-card role-${player.role}`}>
      <p className="eyebrow">Private Role</p>
      <h2>{player.role}</h2>
      <p>{ROLE_COPY[player.role]}</p>
      <p className="private-note">Only {player.name} sees this card.</p>
    </section>
  );
}

export function PhasePanel({
  game,
  status,
  busy,
  paused
}: {
  game: GameState;
  status: string;
  busy: boolean;
  paused: boolean;
}) {
  return (
    <section className="panel">
      <p className="eyebrow">Phase</p>
      <h2>{formatPhase(game.phase)}</h2>
      <p>Day {game.day}</p>
      {game.winner ? <p className="winner">{game.winner === "town" ? "Town wins" : "Mafia wins"}</p> : null}
      <p className={`status-line ${busy ? "thinking-line" : ""}`}>
        {busy ? (
          <>
            <span className="loading-pips" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            Thinking
          </>
        ) : paused ? (
          "Paused."
        ) : (
          status
        )}
      </p>
      {game.lastError ? <p className="error-line">{game.lastError}</p> : null}
    </section>
  );
}

export function TableScene2D({
  game,
  busy,
  paused,
  humanAvatar
}: {
  game: GameState;
  busy: boolean;
  paused: boolean;
  humanAvatar: HumanAvatarId;
}) {
  const thinkingActorId = nextActorIdFor(game);
  const active = busy && thinkingActorId ? thinkingActorId : game.activeSpeakerId;
  const bubble = game.transcript.filter((entry) => !entry.privateTo?.length && ["speech", "narration"].includes(entry.kind)).at(-1);
  const bubbleClassName = bubble ? getSpeechBubbleClassName(bubble) : "";
  const showBubble = !!bubble && !busy && !paused;

  return (
    <section className={`table-scene phase-${game.phase} ${busy ? "scene-thinking" : ""} ${paused ? "scene-paused" : ""}`}>
      <div className="table-vignette" />
      <div className="table-core">
        <div className="candle">
          <span />
        </div>
        <p>{game.phase === "night" ? "Night in Palermo" : "The Palermo Table"}</p>
      </div>
      {game.players.map((player) => {
        const portraitSrc = player.id === "player_6" ? avatarFor(humanAvatar).src : PLAYER_PORTRAITS[player.id];

        return (
          <div
            key={player.id}
            className={`portrait seat-${player.seat} ${player.id === "player_6" ? "human-seat" : ""} ${
              player.alive ? "" : "dead"
            } ${active === player.id ? "active" : ""}`}
          >
            <div className={`portrait-face ${portraitSrc ? "portrait-image-face" : ""}`}>
              {portraitSrc ? <img src={portraitSrc} alt="" /> : player.name.slice(0, 1)}
            </div>
            <strong>{player.name}</strong>
            <span>{player.id === "player_6" ? "you" : player.alive ? suspicionLabel(player.suspicion) : "eliminated"}</span>
          </div>
        );
      })}
      {showBubble ? (
        <div className={bubbleClassName}>
          <strong>{bubble.speakerName}</strong>
          <p>{bubble.text}</p>
        </div>
      ) : null}
      {game.eliminatedThisRound ? <div className="blood-flash" /> : null}
    </section>
  );
}

export function HumanPanel({
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
            <Mic aria-hidden="true" />
            {listening ? "Listening" : "Use Mic"}
          </button>
          <button onClick={onSubmitSpeech} disabled={busy || !humanText.trim()}>
            <Check aria-hidden="true" />
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

  const targetIds = roleActionTargets(game, human);
  const targets = game.players.filter((player) => targetIds.includes(player.id));
  return <TargetPanel title={nightPromptTitleForRole(human.role)} targets={targets} busy={busy} onPick={onSubmitNightAction} />;
}

export function Transcript({ game }: { game: GameState }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const humanVisible = game.transcript.filter((entry) => !entry.privateTo || entry.privateTo.includes("player_6"));

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [humanVisible.length]);

  return (
    <section className="panel transcript-panel">
      <p className="eyebrow">Transcript</p>
      <div ref={listRef} className="transcript-list">
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

export function VoteBoard({ game }: { game: GameState }) {
  if (game.phase !== "day-vote" && !game.votes.length) {
    return null;
  }

  return (
    <section className="panel vote-panel">
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
      <p className="eyebrow">Your move</p>
      <h3>{title}</h3>
      <div className="target-grid">
        {targets.map((target) => (
          <button key={target.id} onClick={() => onPick(target.id)} disabled={busy}>
            <User aria-hidden="true" />
            {target.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function getSpeechBubbleClassName(entry: TranscriptEntry) {
  if (entry.speakerId === "narrator") {
    return "speech-bubble narrator-bubble";
  }

  return "speech-bubble speaker-bubble";
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
