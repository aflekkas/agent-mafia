"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType, CSSProperties, SVGProps } from "react";
import { Check } from "pixelarticons/react/Check";
import { Clock } from "pixelarticons/react/Clock";
import { EyeOff } from "pixelarticons/react/EyeOff";
import { Home } from "pixelarticons/react/Home";
import { MessageText } from "pixelarticons/react/MessageText";
import { Mic } from "pixelarticons/react/Mic";
import { Reload } from "pixelarticons/react/Reload";
import { SquareAlert } from "pixelarticons/react/SquareAlert";
import { User } from "pixelarticons/react/User";
import { UserX } from "pixelarticons/react/UserX";
import { roleActionTargets, nightPromptTitleForRole } from "@/lib/game/role-actions";
import { GameState, Player, PlayerId, TranscriptEntry } from "@/lib/game/types";
import { TableScene3DBackdrop } from "./TableScene3DBackdrop";
import { ROLE_PRESENTATION, RoleBeatRow, RoleIconBadge } from "./role-presentation";
import { HumanAvatarId } from "./types";
import { avatarFor, formatPhase, nameFor, nextActorIdFor } from "./utils";

type CharacterVisualState = "idle" | "quiet" | "thinking" | "speaking" | "suspected" | "eliminated";

export function RoleCard({ player, game }: { player: Player; game: GameState }) {
  const role = ROLE_PRESENTATION[player.role];
  const detectiveKnownIdentities =
    player.role === "detective"
      ? game.players.filter((candidate) => candidate.detectiveKnownRole).sort((left, right) => left.seat - right.seat)
      : [];

  return (
    <section className={`role-card role-${player.role}`}>
      <RoleIconBadge role={player.role} className="role-card-watermark" />
      <div className="role-card-header">
        <RoleIconBadge role={player.role} />
        <div>
          <p className="eyebrow">Private Role</p>
          <h2>{role.label}</h2>
        </div>
      </div>
      <p className="role-card-copy">{role.description}</p>
      <p className="role-card-cue">{role.cue}</p>
      <RoleBeatRow role={player.role} compact />
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
      <p className="role-objective">{role.objective}</p>
      <p className="private-note">Only {player.name} sees this card.</p>
    </section>
  );
}

export function PhasePanel({
  game,
  status,
  busy
}: {
  game: GameState;
  status: string;
  busy: boolean;
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
            <div className="portrait-meta">
              {player.id === "player_6" ? <span className="portrait-owner">the user</span> : null}
              <PlayerStateLabel
                visualState={visualState}
                label={player.id === "player_6" ? `the user's state: ${visualStateLabel(visualState)}` : seatStateLabel(player, visualState)}
              />
            </div>
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

type StateIcon = ComponentType<SVGProps<SVGSVGElement>>;

function PlayerStateLabel({ visualState, label }: { visualState: CharacterVisualState; label: string }) {
  const Icon = STATE_ICON_BY_VISUAL_STATE[visualState];

  return (
    <span className={`portrait-state portrait-state-${visualState}`}>
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </span>
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
  dictationState,
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
  dictationState: "idle" | "requesting" | "recording" | "transcribing";
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
    const dictationMessage = dictationCopyFor(dictationState);
    return (
      <section className="human-panel">
        <p className="eyebrow">Your Turn</p>
        <textarea
          value={humanText}
          onChange={(event) => setHumanText(event.target.value)}
          placeholder="Accuse, defend, lie, or stall..."
          rows={4}
        />
        {dictationMessage ? (
          <div className={`dictation-indicator dictation-${dictationState}`} role="status" aria-live="polite">
            <span className="dictation-dot" aria-hidden="true" />
            <span>{dictationMessage}</span>
          </div>
        ) : null}
        <div className="speech-actions">
          {micInputEnabled ? (
            <button
              onClick={onStartListening}
              disabled={busy}
              className={listening ? "listening" : ""}
              aria-pressed={listening}
            >
              <Mic aria-hidden="true" />
              {listening ? "Stop Dictation" : "Dictate"}
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

function dictationCopyFor(state: "idle" | "requesting" | "recording" | "transcribing"): string {
  if (state === "requesting") {
    return "Requesting microphone access...";
  }
  if (state === "recording") {
    return "Dictating... stop when finished. Nothing submits until you press Submit Speech.";
  }
  if (state === "transcribing") {
    return "Transcribing... the text will appear here for review.";
  }
  return "";
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
          const showTranscriptFace = entry.speakerId !== "narrator" && !entry.privateTo?.length;

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

const STATE_ICON_BY_VISUAL_STATE: Record<CharacterVisualState, StateIcon> = {
  idle: User,
  quiet: EyeOff,
  thinking: Clock,
  speaking: MessageText,
  suspected: SquareAlert,
  eliminated: UserX
};

function visualStateLabel(visualState: CharacterVisualState): string {
  switch (visualState) {
    case "thinking":
      return "thinking";
    case "speaking":
      return "speaking";
    case "suspected":
      return "under pressure";
    case "eliminated":
      return "eliminated";
    case "quiet":
      return "quiet";
    case "idle":
    default:
      return "idle";
  }
}

function seatStateLabel(player: Player, visualState: CharacterVisualState): string {
  if (!player.alive) {
    return "eliminated";
  }
  if (visualState === "speaking" || visualState === "thinking") {
    return visualStateLabel(visualState);
  }
  return suspicionLabel(player.suspicion);
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
