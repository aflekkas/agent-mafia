"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
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

type CharacterVisualState = "idle" | "quiet" | "thinking" | "speaking" | "suspected" | "eliminated";

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
  const bubbleFace = bubble ? faceAssetsForSpeaker(bubble, game, humanAvatar) : undefined;
  const showBubble = !!bubble && !busy && !paused;
  const publicSpeechToday = new Set(
    game.transcript
      .filter((entry) => entry.day === game.day && !entry.privateTo?.length && entry.kind === "speech")
      .map((entry) => entry.speakerId)
  );

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
        const spriteSheetSrc = player.id === "player_6" ? undefined : player.spriteSheetSrc;
        const characterProfile = characterProfileTextFor(player);
        const visualState = visualStateForPlayer({
          player,
          activeId: active,
          bubble,
          busy,
          publicSpeechToday,
          showBubble
        });

        return (
          <div
            key={player.id}
            tabIndex={0}
            aria-label={`${player.name}. ${characterProfile.summary}. ${characterProfile.description}`}
            className={`portrait seat-${player.seat} ${player.id === "player_6" ? "human-seat" : ""} ${
              player.alive ? "" : "dead"
            } ${active === player.id ? "active" : ""}`}
          >
            <CharacterFace
              className="portrait-face"
              name={player.name}
              portraitSrc={portraitSrc}
              spriteSheetSrc={spriteSheetSrc}
              visualState={visualState}
            />
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
            {bubbleFace?.portraitSrc || bubbleFace?.spriteSheetSrc ? (
              <CharacterFace
                className="speech-speaker-portrait"
                name={bubble.speakerName}
                portraitSrc={bubbleFace.portraitSrc}
                spriteSheetSrc={bubbleFace.spriteSheetSrc}
                visualState={bubble.kind === "speech" ? "speaking" : "idle"}
              />
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

function CharacterFace({
  className,
  name,
  portraitSrc,
  spriteSheetSrc,
  visualState,
  animated = true
}: {
  className: string;
  name: string;
  portraitSrc?: string;
  spriteSheetSrc?: string;
  visualState: CharacterVisualState;
  animated?: boolean;
}) {
  const useSpriteSheet = false;
  const style =
    useSpriteSheet && spriteSheetSrc
      ? ({
          "--character-sprite-sheet": `url("${spriteSheetSrc}")`
        } as CSSProperties)
      : undefined;

  return (
    <div
      className={`${className} ${spriteSheetSrc || portraitSrc ? "portrait-image-face" : ""} ${animated ? "" : "static-character-face"}`}
      data-character-state={visualState}
    >
      {useSpriteSheet && spriteSheetSrc ? (
        <span className={`character-sprite sprite-state-${visualState}`} style={style} aria-hidden="true" />
      ) : portraitSrc ? (
        <img src={portraitSrc} alt="" />
      ) : (
        name.slice(0, 1)
      )}
    </div>
  );
}

export function HumanPanel({
  game,
  humanText,
  setHumanText,
  busy,
  listening,
  micInputEnabled,
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
  micInputEnabled: boolean;
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
          {micInputEnabled ? (
            <button
              onClick={onStartListening}
              disabled={busy}
              className={listening ? "listening" : ""}
              aria-pressed={listening}
              title={listening ? "Stop microphone recording" : "Record microphone audio for Whisper transcription"}
            >
              <Mic aria-hidden="true" />
              {listening ? "Stop Mic" : "Use Mic"}
            </button>
          ) : null}
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
    <section
      className={`game-over-panel ${humanWon ? "victory" : "defeat"}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
      aria-live="polite"
    >
      <p className="eyebrow">Game Over</p>
      <h2 id="game-over-title">{title}</h2>
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

export function Transcript({ game, humanAvatar }: { game: GameState; humanAvatar: HumanAvatarId }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const previousLengthRef = useRef(0);
  const previousGameIdRef = useRef(game.id);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const humanVisible = game.transcript.filter((entry) => !entry.privateTo || entry.privateTo.includes("player_6"));

  const scrollToLatest = useCallback(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    setIsPinnedToBottom(true);
    setShowJumpToLatest(false);
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const hasNewGame = game.id !== previousGameIdRef.current;
    previousGameIdRef.current = game.id;

    const hasNewEntry = hasNewGame || humanVisible.length > previousLengthRef.current;
    previousLengthRef.current = humanVisible.length;

    if (!hasNewEntry) {
      return;
    }

    if (hasNewGame || isPinnedToBottom || isNearTranscriptBottom(list)) {
      list.scrollTop = list.scrollHeight;
      setIsPinnedToBottom(true);
      setShowJumpToLatest(false);
      return;
    }

    setShowJumpToLatest(true);
  }, [game.id, humanVisible.length, isPinnedToBottom]);

  function handleTranscriptScroll() {
    const list = listRef.current;
    if (!list) {
      return;
    }

    const isNearBottom = isNearTranscriptBottom(list);
    setIsPinnedToBottom(isNearBottom);

    if (isNearBottom) {
      setShowJumpToLatest(false);
    }
  }

  return (
    <section className="panel transcript-panel">
      <p className="eyebrow">Transcript</p>
      <div ref={listRef} className="transcript-list" onScroll={handleTranscriptScroll}>
        {humanVisible.map((entry) => {
          const face = faceAssetsForSpeaker(entry, game, humanAvatar);
          const showTranscriptFace = entry.speakerId !== "narrator";

          return (
            <article key={entry.id} className={`line kind-${entry.kind} ${showTranscriptFace ? "" : "line-without-face"}`}>
              {showTranscriptFace ? (
                <CharacterFace
                  className="transcript-face"
                  name={entry.speakerName}
                  portraitSrc={face?.portraitSrc}
                  spriteSheetSrc={face?.spriteSheetSrc}
                  visualState="idle"
                  animated={false}
                />
              ) : null}
              <div className="transcript-line-copy">
                <div className="transcript-line-meta">
                  <strong>{entry.speakerName}</strong>
                  <span>{formatTranscriptMeta(entry)}</span>
                </div>
              </div>
              <p className="transcript-entry-text">{entry.text}</p>
            </article>
          );
        })}
      </div>
      {showJumpToLatest ? (
        <button type="button" className="transcript-jump" onClick={scrollToLatest}>
          Back to bottom
        </button>
      ) : null}
    </section>
  );
}

function isNearTranscriptBottom(list: HTMLDivElement): boolean {
  return list.scrollHeight - list.scrollTop - list.clientHeight <= 36;
}

function formatTranscriptMeta(entry: TranscriptEntry): string {
  const parts = [`Day ${entry.day}`, formatTranscriptPhase(entry.phase)];
  if (entry.privateTo?.length) {
    parts.unshift("Private");
  }
  if (entry.kind === "action" || entry.kind === "system" || entry.kind === "vote") {
    parts.push(formatTranscriptKind(entry.kind));
  }
  return parts.join(" / ");
}

function formatTranscriptPhase(phase: TranscriptEntry["phase"]): string {
  switch (phase) {
    case "day-discussion":
      return "Discuss";
    case "day-vote":
      return "Vote";
    case "game-over":
      return "End";
    case "night":
    default:
      return "Night";
  }
}

function formatTranscriptKind(kind: TranscriptEntry["kind"]): string {
  switch (kind) {
    case "action":
      return "Action";
    case "narration":
      return "Narration";
    case "system":
      return "System";
    case "vote":
      return "Vote";
    case "speech":
    default:
      return "Speech";
  }
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

function faceAssetsForSpeaker(
  entry: TranscriptEntry,
  game: GameState,
  humanAvatar: HumanAvatarId
): { portraitSrc?: string; spriteSheetSrc?: string } | undefined {
  const speaker = game.players.find((player) => player.id === entry.speakerId);

  if (!speaker) {
    return undefined;
  }

  if (speaker.id === "player_6") {
    return { portraitSrc: avatarFor(humanAvatar).src };
  }

  return {
    portraitSrc: speaker.portraitSrc,
    spriteSheetSrc: speaker.spriteSheetSrc
  };
}

function visualStateForPlayer({
  player,
  activeId,
  bubble,
  busy,
  publicSpeechToday,
  showBubble
}: {
  player: Player;
  activeId?: PlayerId | "narrator" | "system";
  bubble?: TranscriptEntry;
  busy: boolean;
  publicSpeechToday: Set<TranscriptEntry["speakerId"]>;
  showBubble: boolean;
}): CharacterVisualState {
  if (!player.alive) {
    return "eliminated";
  }

  if (busy && activeId === player.id) {
    return "thinking";
  }

  if (showBubble && bubble?.speakerId === player.id && bubble.kind === "speech") {
    return "speaking";
  }

  if (player.id !== "player_6" && player.suspicion >= 2) {
    return "suspected";
  }

  if (player.id !== "player_6" && !publicSpeechToday.has(player.id)) {
    return "quiet";
  }

  return "idle";
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
