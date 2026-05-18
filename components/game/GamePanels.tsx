"use client";

import { useEffect, useRef } from "react";
import { Check } from "pixelarticons/react/Check";
import { Home } from "pixelarticons/react/Home";
import { Mic } from "pixelarticons/react/Mic";
import { Reload } from "pixelarticons/react/Reload";
import { User } from "pixelarticons/react/User";
import { roleActionTargets, nightPromptTitleForRole } from "@/lib/game/role-actions";
import { GameState, Player, PlayerId, TranscriptEntry } from "@/lib/game/types";
import { TableScene3DBackdrop } from "./TableScene3DBackdrop";
import { ROLE_COPY } from "./constants";
import { HumanAvatarId } from "./types";
import { avatarFor, formatPhase, nameFor, nextActorIdFor } from "./utils";

export function RoleCard({ player, game }: { player: Player; game: GameState }) {
  const mafiaPartners =
    player.role === "mafia" ? game.players.filter((candidate) => candidate.id !== player.id && candidate.role === "mafia") : [];
  const detectiveKnownIdentities =
    player.role === "detective"
      ? game.players.filter((candidate) => candidate.detectiveKnownRole).sort((left, right) => left.seat - right.seat)
      : [];

  return (
    <section className={`role-card role-${player.role}`}>
      <p className="eyebrow">Private Role</p>
      <h2>{player.role}</h2>
      <p>{ROLE_COPY[player.role]}</p>
      {mafiaPartners.length ? (
        <p className="private-intel">Partner: {mafiaPartners.map((partner) => partner.name).join(", ")}</p>
      ) : null}
      {player.role === "detective" ? (
        <div className="private-intel detective-notebook">
          <strong>Known Identities</strong>
          {detectiveKnownIdentities.length ? (
            <ul>
              {detectiveKnownIdentities.map((candidate) => (
                <li key={candidate.id}>
                  <span>{candidate.name}</span>
                  <span>{candidate.detectiveKnownRole}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No investigations yet.</p>
          )}
        </div>
      ) : null}
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
  const bubblePortraitSrc = bubble ? portraitSrcForSpeaker(bubble, game, humanAvatar) : undefined;
  const showBubble = !!bubble && !busy && !paused;

  return (
    <section
      className={`table-scene phase-${game.phase} ${busy ? "scene-thinking" : ""} ${paused ? "scene-paused" : ""} ${
        showBubble ? "has-speech-bubble" : ""
      }`}
    >
      <TableScene3DBackdrop
        activeSpeakerId={active}
        busy={busy}
        paused={paused}
        phase={game.phase}
        players={game.players.map((player) => ({
          id: player.id,
          seat: player.seat,
          alive: player.alive
        }))}
      />
      <div className="table-vignette" />
      <div className="table-core">
        <div className="candle">
          <span />
        </div>
        <p>{game.phase === "night" ? "Night in Palermo" : "The Palermo Table"}</p>
      </div>
      {game.players.map((player) => {
        const portraitSrc = player.id === "player_6" ? avatarFor(humanAvatar).src : player.portraitSrc;
        const characterProfile = characterProfileTextFor(player);

        return (
          <div
            key={player.id}
            tabIndex={0}
            aria-label={`${player.name}. ${characterProfile.summary}. ${characterProfile.description}`}
            className={`portrait seat-${player.seat} ${player.id === "player_6" ? "human-seat" : ""} ${
              player.alive ? "" : "dead"
            } ${active === player.id ? "active" : ""}`}
          >
            <div className={`portrait-face ${portraitSrc ? "portrait-image-face" : ""}`}>
              {portraitSrc ? <img src={portraitSrc} alt="" /> : player.name.slice(0, 1)}
            </div>
            <strong>{player.name}</strong>
            <span>{player.id === "player_6" ? "you" : player.alive ? suspicionLabel(player.suspicion) : "eliminated"}</span>
            <div className="character-peek" aria-hidden="true">
              <strong>{characterProfile.summary}</strong>
              <p>{characterProfile.description}</p>
            </div>
          </div>
        );
      })}
      {showBubble ? (
        <div className={bubbleClassName}>
          <div className="speech-speaker">
            {bubblePortraitSrc ? (
              <span className="speech-speaker-portrait" aria-hidden="true">
                <img src={bubblePortraitSrc} alt="" />
              </span>
            ) : null}
            <strong>{bubble.speakerName}</strong>
          </div>
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
          <button
            onClick={onStartListening}
            disabled={busy}
            className={listening ? "listening" : ""}
            aria-pressed={listening}
            title={listening ? "Stop microphone dictation" : "Start microphone dictation"}
          >
            <Mic aria-hidden="true" />
            {listening ? "Stop Mic" : "Use Mic"}
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
        reasonLabel="Give the table your reason"
        reasonText={humanText}
        setReasonText={setHumanText}
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

export function GameOverPanel({
  game,
  onPlayAgain,
  onGoHome
}: {
  game: GameState;
  onPlayAgain: () => void;
  onGoHome: () => void;
}) {
  const human = game.players.find((player) => player.id === "player_6");
  const humanWon =
    !!human && ((human.role === "mafia" && game.winner === "mafia") || (human.role !== "mafia" && game.winner === "town"));
  const title = humanWon ? "Victory" : "Defeat";
  const detail =
    game.winner === "mafia"
      ? "Mafia owns the table."
      : game.winner === "town"
        ? "Town exposed the Mafia."
        : "The table goes quiet.";

  if (game.phase !== "game-over") {
    return null;
  }

  return (
    <section className={`game-over-panel ${humanWon ? "victory" : "defeat"}`} aria-live="polite">
      <p className="eyebrow">Game Over</p>
      <h2>{title}</h2>
      <p>{detail}</p>
      <div className="game-over-actions">
        <button type="button" onClick={onPlayAgain} data-sfx="start">
          <Reload aria-hidden="true" />
          Play Again
        </button>
        <button type="button" className="secondary-action" onClick={onGoHome}>
          <Home aria-hidden="true" />
          Home
        </button>
      </div>
    </section>
  );
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
  reasonLabel,
  reasonText,
  setReasonText,
  targets,
  busy,
  onPick
}: {
  title: string;
  reasonLabel?: string;
  reasonText?: string;
  setReasonText?: (text: string) => void;
  targets: Player[];
  busy: boolean;
  onPick: (targetId: PlayerId) => void;
}) {
  const needsReason = !!setReasonText;
  const canPick = !busy && (!needsReason || !!reasonText?.trim());

  return (
    <section className="human-panel">
      <p className="eyebrow">Your move</p>
      <h3>{title}</h3>
      {setReasonText ? (
        <textarea
          value={reasonText ?? ""}
          onChange={(event) => setReasonText(event.target.value)}
          placeholder={reasonLabel ?? "Give a reason..."}
          rows={3}
        />
      ) : null}
      <div className="target-grid">
        {targets.map((target) => (
          <button key={target.id} onClick={() => onPick(target.id)} disabled={!canPick}>
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

function portraitSrcForSpeaker(entry: TranscriptEntry, game: GameState, humanAvatar: HumanAvatarId): string | undefined {
  const speaker = game.players.find((player) => player.id === entry.speakerId);

  if (!speaker) {
    return undefined;
  }

  return speaker.id === "player_6" ? avatarFor(humanAvatar).src : speaker.portraitSrc;
}

function characterProfileTextFor(player: Player): { summary: string; description: string } {
  if (player.id === "player_6") {
    return {
      summary: "Your seat",
      description: "The human player at the table. Use your role, private knowledge, and the room's pressure to shape your own personality."
    };
  }

  return {
    summary: player.characterSummary ?? "Personality profile",
    description: player.personalityStyle ?? "Compact, suspicious, characterful, and reactive to pressure."
  };
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
