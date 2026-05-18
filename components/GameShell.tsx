"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "pixelarticons/react/Clock";
import { InfoBox } from "pixelarticons/react/InfoBox";
import { Play } from "pixelarticons/react/Play";
import { Reload } from "pixelarticons/react/Reload";
import { Volume } from "pixelarticons/react/Volume";
import { Volume2 } from "pixelarticons/react/Volume2";
import { GameState, PlayerId } from "@/lib/game/types";
import { speakEntry } from "@/components/game/audio";
import {
  AMBIENCE_URL,
  AUDIO_MUTED_STORAGE_KEY,
  DECISION_CUE_VOLUME,
  HUMAN_AVATAR_STORAGE_KEY,
  HUMAN_NAME_STORAGE_KEY,
  UI_CLICK_VOLUME,
  UI_HOVER_VOLUME,
  UI_START_VOLUME,
  VOICE_MODE_STORAGE_KEY,
  VOTE_CUE_VOLUME
} from "@/components/game/constants";
import { GameDialog } from "@/components/game/GameDialog";
import { createGame, postGameAction } from "@/components/game/game-api";
import { HomeScreen } from "@/components/game/HomeScreen";
import { HumanPanel, PhasePanel, RoleCard, TableScene2D, Transcript, VoteBoard } from "@/components/game/GamePanels";
import { BrowserSpeechWindow, DialogMode, HumanAvatarId, VoiceMode } from "@/components/game/types";
import {
  ambienceLoopBounds,
  ambienceVolumeFor,
  automaticAdvanceDelay,
  avatarFor,
  buttonFromEventTarget,
  errorMessage,
  isHumanAvatarId,
  normalizeHumanName
} from "@/components/game/utils";

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
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
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
  const latestVoteCueRef = useRef<string | null>(null);
  const decisionAudioContextRef = useRef<AudioContext | null>(null);
  const ambienceFadeRef = useRef<number | null>(null);

  const human = useMemo(() => game?.players.find((player) => player.id === "player_6"), [game]);
  const latestPublicEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length).at(-1) ?? null;
  }, [game]);
  const latestVoteEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length && entry.kind === "vote").at(-1) ?? null;
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
    if (!game || !latestVoteEntry) {
      return;
    }

    const cueKey = `${game.id}:${latestVoteEntry.id}`;
    if (latestVoteCueRef.current === cueKey) {
      return;
    }

    latestVoteCueRef.current = cueKey;
    playVoteCue();
  }, [game, latestVoteEntry]);

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
      const nextGame = await createGame({ seed, humanName: displayName });
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
        current = await postGameAction(current.id, { type: "advance" });
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
      const nextGame = await postGameAction(game.id, { type: "speech", text: humanText });
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
      const nextGame = await postGameAction(game.id, { type: "vote", targetId });
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
      const nextGame = await postGameAction(game.id, { type: "night", targetId });
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
    setAvatarPickerOpen(false);
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
      const context = decisionAudioContextRef.current ?? new AudioContext();
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

  function playVoteCue() {
    if (audioMuted) {
      return;
    }

    try {
      const context = decisionAudioContextRef.current ?? new AudioContext();
      decisionAudioContextRef.current = context;

      void context.resume().then(() => {
        const gain = context.createGain();
        const stamp = context.createOscillator();
        const tap = context.createOscillator();
        const now = context.currentTime;
        const duration = 0.16;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(VOTE_CUE_VOLUME, now + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        stamp.type = "square";
        tap.type = "triangle";
        stamp.frequency.setValueAtTime(132, now);
        stamp.frequency.exponentialRampToValueAtTime(72, now + duration);
        tap.frequency.setValueAtTime(260, now);
        tap.frequency.exponentialRampToValueAtTime(120, now + duration * 0.72);

        stamp.connect(gain);
        tap.connect(gain);
        gain.connect(context.destination);

        stamp.start(now);
        tap.start(now);
        stamp.stop(now + duration);
        tap.stop(now + duration * 0.72);
      });
    } catch {
      playUiSound(uiClickRef.current, VOTE_CUE_VOLUME);
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
        <HomeScreen
          humanName={humanName}
          humanAvatar={humanAvatar}
          avatarPickerOpen={avatarPickerOpen}
          audioMuted={audioMuted}
          busy={busy}
          voiceMode={voiceMode}
          onHumanNameChange={setHumanName}
          onHumanAvatarChange={setHumanAvatar}
          onAvatarPickerOpenChange={setAvatarPickerOpen}
          onStart={() => start()}
          onToggleAudio={toggleAudioMuted}
          onVoiceModeChange={setVoiceMode}
        />
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
