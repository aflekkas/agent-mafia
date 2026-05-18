"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AiVoice } from "pixelarticons/react/AiVoice";
import { Cancel } from "pixelarticons/react/Cancel";
import { Check } from "pixelarticons/react/Check";
import { Clock } from "pixelarticons/react/Clock";
import { Home } from "pixelarticons/react/Home";
import { InfoBox } from "pixelarticons/react/InfoBox";
import { Mic } from "pixelarticons/react/Mic";
import { Play } from "pixelarticons/react/Play";
import { Reload } from "pixelarticons/react/Reload";
import { User } from "pixelarticons/react/User";
import { Volume } from "pixelarticons/react/Volume";
import { Volume2 } from "pixelarticons/react/Volume2";
import { GameState, Phase, Player, PlayerId, SpeakerId, TranscriptEntry } from "@/lib/game/types";

type ApiGameResponse = {
  game?: GameState;
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
type DialogMode = "exit" | "rules" | null;
type HumanAvatarId = "player-masc" | "player-femme" | "player-androgynous";

const AUDIO_MUTED_STORAGE_KEY = "agent-mafia.audioMuted";
const VOICE_MODE_STORAGE_KEY = "agent-mafia.voiceMode";
const HUMAN_NAME_STORAGE_KEY = "agent-mafia.humanName";
const HUMAN_AVATAR_STORAGE_KEY = "agent-mafia.humanAvatar";
const AMBIENCE_URL = "/sfx/home-crickets.mp3";
const HOME_AMBIENCE_VOLUME = 0.24;
const IDLE_AMBIENCE_VOLUME = 0.07;
const NIGHT_AMBIENCE_VOLUME = 0.18;
const UI_CLICK_VOLUME = 0.34;
const UI_HOVER_VOLUME = 0.11;
const UI_START_VOLUME = 0.48;
const DECISION_CUE_VOLUME = 0.28;

const ROLE_COPY: Record<string, string> = {
  mafia: "Lie, survive, and bring the town down to parity.",
  detective: "Investigate at night. Use truth carefully.",
  doctor: "Save one soul each night. Guess well.",
  villager: "No power. Read the room and vote.",
  unknown: "Hidden until the game ends."
};

const HUMAN_AVATARS: { id: HumanAvatarId; label: string; src: string }[] = [
  { id: "player-masc", label: "Signore", src: "/avatars/player-masc.png" },
  { id: "player-femme", label: "Signora", src: "/avatars/player-femme.png" },
  { id: "player-androgynous", label: "Stranger", src: "/avatars/player-androgynous.png" }
];

export function GameShell() {
  const [game, setGame] = useState<GameState | null>(null);
  const [busy, setBusy] = useState(false);
  const [humanText, setHumanText] = useState("");
  const [humanName, setHumanName] = useState("Player");
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState("Ready.");
  const [audioMuted, setAudioMuted] = useState(true);
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>("browser");
  const [playbackCompleteId, setPlaybackCompleteId] = useState<string | null>(null);
  const [voiceActive, setVoiceActive] = useState(false);
  const [paused, setPaused] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [humanAvatar, setHumanAvatarState] = useState<HumanAvatarId>("player-masc");
  const spokenEntryRef = useRef<string | null>(null);
  const audioPlayingRef = useRef(false);
  const elevenLabsAudioCacheRef = useRef<Map<string, Blob>>(new Map());
  const ambienceAudioContextRef = useRef<AudioContext | null>(null);
  const ambienceBufferRef = useRef<AudioBuffer | null>(null);
  const ambienceGainRef = useRef<GainNode | null>(null);
  const ambienceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const uiClickRef = useRef<HTMLAudioElement | null>(null);
  const uiStartRef = useRef<HTMLAudioElement | null>(null);
  const latestDecisionCueRef = useRef<string | null>(null);
  const decisionAudioContextRef = useRef<AudioContext | null>(null);
  const ambienceFadeRef = useRef<number | null>(null);

  const human = useMemo(() => game?.players.find((player) => player.id === "player_6"), [game]);
  const latestPublicEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length).at(-1) ?? null;
  }, [game]);
  const isHome = !game || !human;

  useEffect(() => {
    const uiClick = new Audio("/sfx/ui-click.wav");
    uiClick.preload = "auto";
    uiClickRef.current = uiClick;

    const uiStart = new Audio("/sfx/ui-start.mp3");
    uiStart.preload = "auto";
    uiStartRef.current = uiStart;

    const storedMute = window.localStorage.getItem(AUDIO_MUTED_STORAGE_KEY);
    const shouldMute = storedMute === null ? true : storedMute === "true";
    window.localStorage.setItem(AUDIO_MUTED_STORAGE_KEY, String(shouldMute));
    setAudioMuted(shouldMute);
    if (shouldMute && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const storedMode = window.localStorage.getItem(VOICE_MODE_STORAGE_KEY);
    if (storedMode === "browser" || storedMode === "elevenlabs") {
      setVoiceModeState(storedMode);
    }

    const storedHumanName = window.localStorage.getItem(HUMAN_NAME_STORAGE_KEY);
    if (storedHumanName) {
      setHumanName(storedHumanName);
    }

    const storedHumanAvatar = window.localStorage.getItem(HUMAN_AVATAR_STORAGE_KEY);
    if (isHumanAvatarId(storedHumanAvatar)) {
      setHumanAvatarState(storedHumanAvatar);
    }

    return () => {
      if (ambienceFadeRef.current !== null) {
        window.clearInterval(ambienceFadeRef.current);
      }
      stopAmbience();
      void ambienceAudioContextRef.current?.close();
      uiClick.pause();
      uiStart.pause();
      void decisionAudioContextRef.current?.close();
    };
  }, []);

  useEffect(() => {
    const shouldPlayAmbience = !audioMuted && (isHome || (!!game && game.phase !== "game-over" && !voiceActive));
    if (shouldPlayAmbience) {
      void playHomeAmbience().then(() => fadeHomeAmbience(ambienceVolumeFor(game, isHome)));
      return;
    }

    fadeHomeAmbience(0, stopAmbience);
  }, [audioMuted, game, isHome, voiceActive]);

  useEffect(() => {
    if (!game || game.phase === "game-over") {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [game]);

  useEffect(() => {
    if (!game?.eliminatedThisRound) {
      return;
    }

    const cueKey = `${game.id}:${game.eliminatedThisRound}`;
    if (latestDecisionCueRef.current === cueKey) {
      return;
    }

    latestDecisionCueRef.current = cueKey;
    playDecisionCue();
  }, [game]);

  useEffect(() => {
    if (!latestPublicEntry || spokenEntryRef.current === latestPublicEntry.id) {
      return;
    }
    spokenEntryRef.current = latestPublicEntry.id;
    if (audioMuted) {
      setAudioPlaybackActive(false);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setStatus("Sound muted.");
      setPlaybackCompleteId(latestPublicEntry.id);
      return;
    }

    let cancelled = false;
    setAudioPlaybackActive(true);
    void (async () => {
      try {
        await speakEntry(latestPublicEntry, voiceMode, elevenLabsAudioCacheRef.current, setStatus);
      } catch (error) {
        setStatus(errorMessage(error, "Voice playback failed."));
      } finally {
        if (!cancelled) {
          setAudioPlaybackActive(false);
          setPlaybackCompleteId(latestPublicEntry.id);
        }
      }
    })();

    return () => {
      cancelled = true;
      setAudioPlaybackActive(false);
    };
  }, [audioMuted, latestPublicEntry, voiceMode]);

  useEffect(() => {
    if (!game || paused || busy || game.currentPrompt || game.phase === "game-over") {
      return;
    }
    if (audioPlayingRef.current) {
      return;
    }

    const latestEntryWasPlayed = latestPublicEntry?.id === playbackCompleteId;
    const delay = automaticAdvanceDelay(game, latestPublicEntry, latestEntryWasPlayed, audioMuted);
    const timer = window.setTimeout(() => {
      void advance(false);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [audioMuted, busy, game, latestPublicEntry, paused, playbackCompleteId]);

  async function start(seed?: string) {
    const displayName = normalizeHumanName(humanName);

    setBusy(true);
    setStatus("Starting game.");
    try {
      window.localStorage.setItem(HUMAN_NAME_STORAGE_KEY, displayName);
      const response = await fetch("/api/game", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seed, humanName: displayName })
      });
      const nextGame = await readGameResponse(response);
      setGame(nextGame);
      setHumanText("");
      setPaused(false);
      setDialogMode(null);
      spokenEntryRef.current = null;
      setStatus(seed ? `Loaded ${seed}.` : "New game started.");
    } catch (error) {
      setStatus(errorMessage(error, "Could not start game."));
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
        current = await readGameResponse(response);
        setGame(current);
        if (current.currentPrompt || current.phase === "game-over") {
          break;
        }
      }
      setStatus(current.currentPrompt ? "Your move." : current.phase === "game-over" ? "Game over." : "Advanced.");
    } catch (error) {
      setStatus(errorMessage(error, "Could not advance game."));
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
      const nextGame = await readGameResponse(response);
      setGame(nextGame);
      setHumanText("");
      setStatus("Speech submitted.");
    } catch (error) {
      setStatus(errorMessage(error, "Could not submit speech."));
    } finally {
      setBusy(false);
    }
  }

  function startListening() {
    const speechWindow = window as BrowserSpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Speech recognition is not available here. Type your line instead.");
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

    try {
      setListening(true);
      setStatus("Listening.");
      recognition.start();
    } catch (error) {
      setListening(false);
      setStatus(errorMessage(error, "Mic capture failed. Type your line instead."));
    }
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
      const nextGame = await readGameResponse(response);
      setGame(nextGame);
      setStatus("Vote cast.");
    } catch (error) {
      setStatus(errorMessage(error, "Could not cast vote."));
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
      const nextGame = await readGameResponse(response);
      setGame(nextGame);
      setStatus("Night action submitted.");
    } catch (error) {
      setStatus(errorMessage(error, "Could not submit night action."));
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

  function setVoiceMode(mode: VoiceMode) {
    setVoiceModeState(mode);
    window.localStorage.setItem(VOICE_MODE_STORAGE_KEY, mode);
    setStatus(mode === "elevenlabs" ? "ElevenLabs selected. Turn sound on to use it." : "Browser voice selected.");
  }

  function setHumanAvatar(avatarId: HumanAvatarId) {
    setHumanAvatarState(avatarId);
    window.localStorage.setItem(HUMAN_AVATAR_STORAGE_KEY, avatarId);
    setStatus(`${avatarFor(avatarId).label} portrait selected.`);
  }

  function requestExit() {
    if (!game) {
      setGame(null);
      return;
    }
    setPaused(true);
    setDialogMode("exit");
  }

  function confirmExit() {
    setGame(null);
    setHumanText("");
    setPaused(false);
    setDialogMode(null);
    spokenEntryRef.current = null;
    setPlaybackCompleteId(null);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setAudioPlaybackActive(false);
    setStatus("Ready.");
  }

  function closeDialog() {
    if (dialogMode === "exit") {
      setPaused(false);
    }
    setDialogMode(null);
  }

  function playButtonSoundFromClick(event: { target: EventTarget | null }) {
    const button = buttonFromEventTarget(event.target);
    if (!button) {
      return;
    }

    const sound = button.dataset.sfx === "start" ? uiStartRef.current : uiClickRef.current;
    const volume = button.dataset.sfx === "start" ? UI_START_VOLUME : UI_CLICK_VOLUME;
    const forceSound = button.dataset.sfx === "sound-toggle";
    playUiSound(sound, volume, forceSound);
  }

  function playButtonSoundFromHover(event: {
    target: EventTarget | null;
    relatedTarget: EventTarget | null;
    pointerType?: string;
  }) {
    if (event.pointerType === "touch") {
      return;
    }

    const button = buttonFromEventTarget(event.target);
    if (!button) {
      return;
    }

    const related = event.relatedTarget;
    if (related instanceof Node && button.contains(related)) {
      return;
    }

    const forceSound = button.dataset.sfx === "sound-toggle";
    playUiSound(uiClickRef.current, UI_HOVER_VOLUME, forceSound);
  }

  function setAudioPlaybackActive(active: boolean) {
    audioPlayingRef.current = active;
    setVoiceActive(active);
  }

  async function playHomeAmbience() {
    try {
      const context = ambienceAudioContextRef.current ?? new AudioContext();
      ambienceAudioContextRef.current = context;
      await context.resume();

      if (!ambienceGainRef.current) {
        const gain = context.createGain();
        gain.gain.value = 0;
        gain.connect(context.destination);
        ambienceGainRef.current = gain;
      }

      if (!ambienceBufferRef.current) {
        const response = await fetch(AMBIENCE_URL);
        const data = await response.arrayBuffer();
        ambienceBufferRef.current = await context.decodeAudioData(data);
      }

      if (!ambienceSourceRef.current) {
        const source = context.createBufferSource();
        const loop = ambienceLoopBounds(ambienceBufferRef.current);
        source.buffer = ambienceBufferRef.current;
        source.loop = true;
        source.loopStart = loop.start;
        source.loopEnd = loop.end;
        source.connect(ambienceGainRef.current);
        source.start(0, loop.start);
        ambienceSourceRef.current = source;
      }
    } catch {
      // Browsers require a user gesture before ambient audio can start.
    }
  }

  function fadeHomeAmbience(targetVolume: number, onComplete?: () => void) {
    const gain = ambienceGainRef.current;
    if (!gain) {
      if (targetVolume <= 0) {
        onComplete?.();
      }
      return;
    }

    if (ambienceFadeRef.current !== null) {
      window.clearInterval(ambienceFadeRef.current);
    }

    const startVolume = gain.gain.value;
    const startTime = window.performance.now();
    const duration = targetVolume > startVolume ? 900 : 500;

    const tick = () => {
      const progress = Math.min((window.performance.now() - startTime) / duration, 1);
      gain.gain.value = startVolume + (targetVolume - startVolume) * progress;
      if (progress >= 1) {
        if (ambienceFadeRef.current !== null) {
          window.clearInterval(ambienceFadeRef.current);
          ambienceFadeRef.current = null;
        }
        onComplete?.();
      }
    };

    tick();
    ambienceFadeRef.current = window.setInterval(tick, 50);
  }

  function stopAmbience() {
    ambienceGainRef.current?.gain.setValueAtTime(0, ambienceAudioContextRef.current?.currentTime ?? 0);
    ambienceSourceRef.current?.stop();
    ambienceSourceRef.current?.disconnect();
    ambienceSourceRef.current = null;
  }

  function playUiSound(sound: HTMLAudioElement | null, volume: number, forceSound = false) {
    if (!sound || (audioMuted && !forceSound)) {
      return;
    }

    const cue = sound.cloneNode(true) as HTMLAudioElement;
    cue.volume = volume;
    void cue.play().catch(() => undefined);
  }

  function playDecisionCue() {
    if (audioMuted) {
      return;
    }

    try {
      const AudioContextConstructor = window.AudioContext;
      const context = decisionAudioContextRef.current ?? new AudioContextConstructor();
      decisionAudioContextRef.current = context;

      void context.resume().then(() => {
        const gain = context.createGain();
        const low = context.createOscillator();
        const high = context.createOscillator();
        const now = context.currentTime;
        const duration = 0.72;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(DECISION_CUE_VOLUME, now + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        low.type = "triangle";
        high.type = "sine";
        low.frequency.setValueAtTime(92, now);
        low.frequency.exponentialRampToValueAtTime(46, now + duration);
        high.frequency.setValueAtTime(138, now);
        high.frequency.exponentialRampToValueAtTime(69, now + duration);

        low.connect(gain);
        high.connect(gain);
        gain.connect(context.destination);

        low.start(now);
        high.start(now);
        low.stop(now + duration);
        high.stop(now + duration);
      });
    } catch {
      playUiSound(uiStartRef.current, DECISION_CUE_VOLUME);
    }
  }

  return (
    <main
      className={`shell ${isHome ? "home-shell" : ""}`}
      onClickCapture={playButtonSoundFromClick}
      onPointerOverCapture={playButtonSoundFromHover}
    >
      {isHome ? null : (
        <section className="topbar">
          <button type="button" className="title-button" data-sfx="none" onClick={requestExit} title="Return to start">
            <p className="eyebrow">Voice-first social deduction</p>
            <h1>Agent Mafia</h1>
          </button>
          <div className="topbar-actions">
            <button type="button" className="icon-button" onClick={() => setDialogMode("rules")} aria-label="Show roles" title="Show roles">
              <InfoBox aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`icon-button ${paused ? "active" : ""}`}
              onClick={() => setPaused((value) => !value)}
              aria-pressed={paused}
              aria-label={paused ? "Resume game" : "Pause game"}
              title={paused ? "Resume game" : "Pause game"}
            >
              {paused ? <Play aria-hidden="true" /> : <Clock aria-hidden="true" />}
            </button>
            <button type="button" className="icon-button" onClick={requestExit} aria-label="New game" title="New game">
              <Reload aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`mute-button ${audioMuted ? "muted" : ""}`}
              data-sfx="sound-toggle"
              onClick={toggleAudioMuted}
              aria-pressed={audioMuted}
              aria-label={audioMuted ? "Unmute game sound" : "Mute game sound"}
              title={audioMuted ? "Unmute game sound" : "Mute game sound"}
            >
              {audioMuted ? <Volume aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
              <span>{audioMuted ? "Sound Off" : "Sound On"}</span>
            </button>
          </div>
        </section>
      )}

      {isHome ? (
        <section className="empty-state">
          <div className="empty-copy">
            <h2>Agent Mafia</h2>
            <label className="name-form">
              <span>Your name</span>
              <input
                value={humanName}
                onChange={(event) => setHumanName(event.target.value)}
                placeholder="Player"
                maxLength={24}
                autoComplete="given-name"
              />
            </label>
            <section className="avatar-picker" aria-label="Choose your portrait">
              <p className="eyebrow">Your portrait</p>
              <div className="avatar-options">
                {HUMAN_AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    className={`avatar-option ${humanAvatar === avatar.id ? "selected" : ""}`}
                    onClick={() => setHumanAvatar(avatar.id)}
                    aria-pressed={humanAvatar === avatar.id}
                  >
                    <img src={avatar.src} alt="" />
                    <span>{avatar.label}</span>
                  </button>
                ))}
              </div>
            </section>
            <div className="home-actions">
              <VoiceModeSwitch voiceMode={voiceMode} onChange={setVoiceMode} />
              <button
                type="button"
                className={`mute-button ${audioMuted ? "muted" : ""}`}
                data-sfx="sound-toggle"
                onClick={toggleAudioMuted}
                aria-pressed={audioMuted}
                aria-label={audioMuted ? "Unmute game sound" : "Mute game sound"}
                title={audioMuted ? "Unmute game sound" : "Mute game sound"}
              >
                {audioMuted ? <Volume aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
                <span>{audioMuted ? "Sound Off" : "Sound On"}</span>
              </button>
              <button data-sfx="start" onClick={() => start()} disabled={busy}>
                <Play aria-hidden="true" />
                <span>Start Game</span>
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="game-grid">
          <aside className="left-rail">
            <RoleCard player={human} />
            <PhasePanel game={game} status={status} busy={busy} paused={paused} />
            <VoteBoard game={game} />
          </aside>

          <section className="stage-panel">
            <TableScene2D game={game} busy={busy} paused={paused} humanAvatar={humanAvatar} />
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
          </aside>
        </section>
      )}
      <GameDialog mode={dialogMode} onCancel={closeDialog} onConfirmExit={confirmExit} />
    </main>
  );
}

function buttonFromEventTarget(target: EventTarget | null): HTMLButtonElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }

  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement) || button.disabled || button.dataset.sfx === "none") {
    return null;
  }

  return button;
}

function ambienceVolumeFor(game: GameState | null, isHome: boolean): number {
  if (isHome) {
    return HOME_AMBIENCE_VOLUME;
  }

  if (game?.phase === "night") {
    return NIGHT_AMBIENCE_VOLUME;
  }

  return IDLE_AMBIENCE_VOLUME;
}

function ambienceLoopBounds(buffer: AudioBuffer): { start: number; end: number } {
  const channel = buffer.getChannelData(0);
  const threshold = 0.003;
  let startFrame = 0;
  let endFrame = channel.length - 1;

  while (startFrame < channel.length && Math.abs(channel[startFrame]) < threshold) {
    startFrame += 1;
  }

  while (endFrame > startFrame && Math.abs(channel[endFrame]) < threshold) {
    endFrame -= 1;
  }

  const padFrames = Math.floor(buffer.sampleRate * 0.03);
  const start = Math.max(0, startFrame + padFrames) / buffer.sampleRate;
  const end = Math.min(channel.length - 1, Math.max(startFrame + padFrames + 1, endFrame - padFrames)) / buffer.sampleRate;

  return end - start > 0.25 ? { start, end } : { start: 0, end: buffer.duration };
}

function automaticAdvanceDelay(
  game: GameState,
  latestEntry: TranscriptEntry | null,
  latestEntryWasPlayed: boolean,
  audioMuted: boolean
): number {
  if (!audioMuted && latestEntryWasPlayed) {
    return 250;
  }

  if (game.phase === "day-vote" || latestEntry?.kind === "vote") {
    return 550;
  }

  if (latestEntry?.kind === "speech") {
    return 1200;
  }

  return 750;
}

function VoiceModeSwitch({
  voiceMode,
  onChange
}: {
  voiceMode: VoiceMode;
  onChange: (mode: VoiceMode) => void;
}) {
  const useElevenLabs = voiceMode === "elevenlabs";

  return (
    <button
      type="button"
      className={`voice-mode-toggle ${useElevenLabs ? "elevenlabs" : "browser"}`}
      onClick={() => onChange(useElevenLabs ? "browser" : "elevenlabs")}
      aria-pressed={useElevenLabs}
      title={useElevenLabs ? "Switch to browser voice" : "Switch to ElevenLabs voice"}
    >
      <AiVoice aria-hidden="true" />
      <span>Voice: {useElevenLabs ? "ElevenLabs" : "Browser"}</span>
    </button>
  );
}

async function readGameResponse(response: Response): Promise<GameState> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    const apiError = contentType.includes("application/json") ? await readApiError(response) : undefined;
    throw new Error(apiError ?? `Game server returned ${response.status}. Check the terminal for the API error.`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error("Game server returned a non-JSON response. Check the terminal for the API error.");
  }

  const data = (await response.json().catch(() => null)) as ApiGameResponse | null;
  if (!data?.game) {
    throw new Error(data?.error ?? "Game server response did not include a game.");
  }

  return data.game;
}

async function readApiError(response: Response): Promise<string | undefined> {
  const data = (await response.json().catch(() => null)) as ApiGameResponse | null;
  return data?.error;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function RoleCard({ player }: { player: Player }) {
  return (
    <section className={`role-card role-${player.role}`}>
      <p className="eyebrow">Private Role</p>
      <h2>{player.role}</h2>
      <p>{ROLE_COPY[player.role]}</p>
      <p className="private-note">Only {player.name} sees this card.</p>
    </section>
  );
}

function PhasePanel({ game, status, busy, paused }: { game: GameState; status: string; busy: boolean; paused: boolean }) {
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

function TableScene2D({
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
  const active = game.activeSpeakerId;
  const bubble = game.transcript.filter((entry) => !entry.privateTo?.length && ["speech", "narration"].includes(entry.kind)).at(-1);
  const bubbleClassName = bubble ? getSpeechBubbleClassName(bubble, game.players) : "";
  const turnStatus = turnStatusFor(game, busy, paused);
  const showBubble = !!bubble && !busy && !paused;
  return (
    <section className={`table-scene phase-${game.phase} ${busy ? "scene-thinking" : ""} ${paused ? "scene-paused" : ""}`}>
      <div className="table-vignette" />
      <div className={`turn-status ${busy ? "thinking" : ""}`} aria-live="polite">
        {busy ? (
          <span className="loading-pips" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        ) : null}
        {turnStatus}
      </div>
      <div className="table-core">
        <div className="candle">
          <span />
        </div>
        <p>{game.phase === "night" ? "Night in Palermo" : "The Palermo Table"}</p>
      </div>
      {game.players.map((player) => {
        const avatar = player.id === "player_6" ? avatarFor(humanAvatar) : null;

        return (
          <div
            key={player.id}
            className={`portrait seat-${player.seat} ${player.id === "player_6" ? "human-seat" : ""} ${
              player.alive ? "" : "dead"
            } ${active === player.id ? "active" : ""}`}
          >
            <div className={`portrait-face ${avatar ? "portrait-image-face" : ""}`}>
              {avatar ? <img src={avatar.src} alt="" /> : player.name.slice(0, 1)}
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

function turnStatusFor(game: GameState, busy: boolean, paused: boolean): string {
  if (game.phase === "game-over") {
    return "Game over";
  }
  if (paused) {
    return "Paused";
  }
  if (game.currentPrompt) {
    return "Your turn";
  }

  const nextId =
    game.phase === "day-discussion"
      ? game.turnOrder.discussionQueue[0]
      : game.phase === "day-vote"
        ? game.turnOrder.voteQueue[0]
        : undefined;
  const nextName = nextId ? nameFor(game, nextId) : game.phase === "night" ? "Night action" : "Table";

  return busy ? `Thinking: ${nextName}` : `Next: ${nextName}`;
}

function getSpeechBubbleClassName(entry: TranscriptEntry, players: Player[]) {
  if (entry.speakerId === "narrator") {
    return "speech-bubble narrator-bubble";
  }

  const speaker = players.find((player) => player.id === entry.speakerId);
  const seatClass = speaker ? `bubble-seat-${speaker.seat}` : "bubble-seat-unknown";

  return `speech-bubble speaker-bubble ${seatClass}`;
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

function Transcript({ game }: { game: GameState }) {
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

function VoteBoard({ game }: { game: GameState }) {
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

function GameDialog({
  mode,
  onCancel,
  onConfirmExit
}: {
  mode: DialogMode;
  onCancel: () => void;
  onConfirmExit: () => void;
}) {
  if (!mode) {
    return null;
  }

  if (mode === "rules") {
    return (
      <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <section className="pixel-dialog rules-dialog">
          <p className="eyebrow">Rules</p>
          <h2 id="rules-title">Roles</h2>
          <div className="rules-grid">
            <article>
              <strong>Detective Lead</strong>
              <p>The Detective privately starts with one confirmed Mafia. Nobody else knows that lead.</p>
            </article>
            <article>
              <strong>Mafia Pair</strong>
              <p>Two Mafia know each other, coordinate through lies, and win if they reach parity.</p>
            </article>
            <article>
              <strong>Doctor</strong>
              <p>Chooses a save before Mafia chooses a kill. A correct save stops the death.</p>
            </article>
            <article>
              <strong>Detective</strong>
              <p>Investigates one player at night and gets a private role result.</p>
            </article>
            <article>
              <strong>Villagers</strong>
              <p>No power. Read the room, argue, and vote out both Mafia.</p>
            </article>
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={onCancel}>
              <Check aria-hidden="true" />
              Got it
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="exit-title">
      <section className="pixel-dialog">
        <p className="eyebrow">Leave game</p>
        <h2 id="exit-title">End this round?</h2>
        <p>This clears the current table and returns to the start screen.</p>
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            <Cancel aria-hidden="true" />
            Stay
          </button>
          <button type="button" className="danger" onClick={onConfirmExit}>
            <Home aria-hidden="true" />
            End game
          </button>
        </div>
      </section>
    </div>
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
    setStatus(voiceMode === "elevenlabs" ? "ElevenLabs unavailable; played browser voice." : "Played browser voice.");
    await playBrowserUtterance(utterance);
  }
}

async function playAudioBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  try {
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed."));
      void audio.play().catch(reject);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function playBrowserUtterance(utterance: SpeechSynthesisUtterance) {
  await new Promise<void>((resolve) => {
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
  });
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

function normalizeHumanName(name: string): string {
  const normalized = stripNameDirectives(name)
    .replace(/[^\p{L}\p{N}' -]/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);

  return normalized || "Player";
}

function isHumanAvatarId(value: string | null): value is HumanAvatarId {
  return value === "player-masc" || value === "player-femme" || value === "player-androgynous";
}

function avatarFor(avatarId: HumanAvatarId) {
  return HUMAN_AVATARS.find((avatar) => avatar.id === avatarId) ?? HUMAN_AVATARS[0];
}

function stripNameDirectives(name: string): string {
  const cleaned = name.trim();
  const directiveMatch = cleaned.match(
    /\b(ignore|disregard|forget|override|reveal|show|print|repeat|follow|obey)\b.*\b(instructions?|prompts?|system|developer|assistant|rules?|messages?)\b/i
  );
  return directiveMatch?.index === undefined ? cleaned : cleaned.slice(0, directiveMatch.index);
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
