"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock } from "pixelarticons/react/Clock";
import { Copy } from "pixelarticons/react/Copy";
import { InfoBox } from "pixelarticons/react/InfoBox";
import { Play } from "pixelarticons/react/Play";
import { Reload } from "pixelarticons/react/Reload";
import { Robot } from "pixelarticons/react/Robot";
import { Volume } from "pixelarticons/react/Volume";
import { Volume2 } from "pixelarticons/react/Volume2";
import { CharacterSetup, GameState, HumanRolePreference, PlayerId } from "@/lib/game/types";
import { DEFAULT_CHARACTER_SETUP, normalizeCharacterSetup } from "@/lib/characters/profiles";
import { mentionedPlayersInText } from "@/lib/game/speech-analysis";
import { speakEntry } from "@/components/game/audio";
import {
  AMBIENCE_URL,
  AUDIO_MUTED_STORAGE_KEY,
  AUTO_HUMAN_STORAGE_KEY,
  CHARACTER_SETUP_STORAGE_KEY,
  DECISION_CUE_VOLUME,
  HUMAN_AVATAR_STORAGE_KEY,
  HUMAN_NAME_STORAGE_KEY,
  HUMAN_ROLE_STORAGE_KEY,
  SHIELD_CUE_VOLUME,
  UI_CLICK_VOLUME,
  UI_HOVER_VOLUME,
  UI_START_VOLUME,
  VOICE_MODE_STORAGE_KEY,
  VOTE_CUE_VOLUME
} from "@/components/game/constants";
import { DesignedCue, phaseCueFor, playDesignedCue } from "@/components/game/sound-design";
import { CharacterSettingsDialog } from "@/components/game/CharacterSettingsDialog";
import { GameDialog } from "@/components/game/GameDialog";
import { createGame, postGameAction } from "@/components/game/game-api";
import { CustomCursor } from "@/components/game/CustomCursor";
import { HomeScreen, VoiceModeSwitch } from "@/components/game/HomeScreen";
import { HomeTownBackground } from "@/components/game/HomeTownBackground";
import { GameOverPanel, HumanPanel, PhasePanel, RoleCard, TableScene2D, Transcript, VoteBoard } from "@/components/game/GamePanels";
import { BrowserSpeechRecognition, BrowserSpeechWindow, DialogMode, HumanAvatarId, VoiceMode } from "@/components/game/types";
import {
  ambienceLoopBounds,
  ambienceVolumeFor,
  automaticAdvanceDelay,
  buttonFromEventTarget,
  errorMessage,
  isHumanAvatarId,
  normalizeHumanName,
  sanitizeHumanNameDraft,
  sanitizeHumanTextDraft
} from "@/components/game/utils";

const MOBILE_LOCKOUT_QUERY = "(max-width: 760px), ((hover: none) and (pointer: coarse) and (max-width: 920px))";

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
  const [autoHumanEnabled, setAutoHumanEnabled] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [humanAvatar, setHumanAvatarState] = useState<HumanAvatarId>("player-masc");
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [characterSetup, setCharacterSetupState] = useState<CharacterSetup>(DEFAULT_CHARACTER_SETUP);
  const [humanRole, setHumanRoleState] = useState<HumanRolePreference>("random");
  const [viewportLocked, setViewportLocked] = useState(false);
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
  const latestPhaseCueRef = useRef<string | null>(null);
  const latestPromptCueRef = useRef<string | null>(null);
  const latestAccusationCueRef = useRef<string | null>(null);
  const decisionAudioContextRef = useRef<AudioContext | null>(null);
  const ambienceFadeRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const speechBaseTextRef = useRef("");
  const speechFinalTextRef = useRef("");
  const speechDictatedTextRef = useRef("");
  const speechStartRequestIdRef = useRef(0);
  const autoHumanPromptRef = useRef<string | null>(null);
  const prefetchedAdvanceRef = useRef<{ sourceGameId: string; sourceUpdatedAt: number; game: GameState } | null>(null);
  const prefetchingAdvanceRef = useRef<{ sourceGameId: string; sourceUpdatedAt: number; promise: Promise<GameState> } | null>(null);

  const human = useMemo(() => game?.players.find((player) => player.id === "player_6"), [game]);
  const latestPublicEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length).at(-1) ?? null;
  }, [game]);
  const latestVoteEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length && entry.kind === "vote").at(-1) ?? null;
  }, [game]);
  const latestSpeechEntry = useMemo(() => {
    return game?.transcript.filter((entry) => !entry.privateTo?.length && entry.kind === "speech").at(-1) ?? null;
  }, [game]);
  const latestBlockedActionEntry = useMemo(() => {
    return game?.transcript.filter((entry) => entry.kind === "action" && /was blocked|protected/i.test(entry.text)).at(-1) ?? null;
  }, [game]);
  const isHome = !game || !human;
  const voicePlaybackEnabled = !audioMuted && voiceMode !== "off";
  const isGameOver = game?.phase === "game-over";
  const topbarControlsLocked = !!dialogMode || isGameOver;

  useEffect(() => {
    const query = window.matchMedia(MOBILE_LOCKOUT_QUERY);
    const updateViewportLock = () => setViewportLocked(query.matches);

    updateViewportLock();
    query.addEventListener("change", updateViewportLock);
    return () => query.removeEventListener("change", updateViewportLock);
  }, []);

  useEffect(() => {
    if (!viewportLocked || !game || game.phase === "game-over") {
      return;
    }

    clearPrefetchedAdvance();
    setPaused(true);
    setStatus("Screen too small. Resize to continue.");
    speechRecognitionRef.current?.abort();
    setListening(false);
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setAudioPlaybackActive(false);
  }, [game, viewportLocked]);

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
    if (storedMode === "off" || storedMode === "browser" || storedMode === "elevenlabs") {
      setVoiceModeState(storedMode);
    }

    setAutoHumanEnabled(window.localStorage.getItem(AUTO_HUMAN_STORAGE_KEY) === "true");

    const storedHumanName = window.localStorage.getItem(HUMAN_NAME_STORAGE_KEY);
    if (storedHumanName) {
      const sanitizedName = normalizeHumanName(storedHumanName);
      setHumanName(sanitizedName);
      window.localStorage.setItem(HUMAN_NAME_STORAGE_KEY, sanitizedName);
    }

    const storedHumanAvatar = window.localStorage.getItem(HUMAN_AVATAR_STORAGE_KEY);
    if (isHumanAvatarId(storedHumanAvatar)) {
      setHumanAvatarState(storedHumanAvatar);
    }

    const storedCharacterSetup = readStoredCharacterSetup(window.localStorage.getItem(CHARACTER_SETUP_STORAGE_KEY));
    if (storedCharacterSetup) {
      setCharacterSetupState(storedCharacterSetup);
    }

    const storedHumanRole = window.localStorage.getItem(HUMAN_ROLE_STORAGE_KEY);
    if (isHumanRolePreference(storedHumanRole)) {
      setHumanRoleState(storedHumanRole);
    }

    return () => {
      if (ambienceFadeRef.current !== null) {
        window.clearInterval(ambienceFadeRef.current);
      }
      stopAmbience();
      void ambienceAudioContextRef.current?.close();
      uiClick.pause();
      uiStart.pause();
      speechRecognitionRef.current?.abort();
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
    if (!game) {
      latestPhaseCueRef.current = null;
      return;
    }

    const cue = phaseCueFor(game.phase, game.winner);
    if (!cue) {
      return;
    }

    const cueKey = `${game.id}:${game.phase}:${game.day}:${game.nightNumber}:${game.winner ?? "none"}`;
    if (latestPhaseCueRef.current === cueKey) {
      return;
    }

    latestPhaseCueRef.current = cueKey;
    playGameCue(cue);
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
    if (!game?.currentPrompt || game.phase === "game-over") {
      return;
    }

    const cueKey = `${game.id}:${game.phase}:${game.day}:${game.nightNumber}:${game.currentPrompt}`;
    if (latestPromptCueRef.current === cueKey) {
      return;
    }

    latestPromptCueRef.current = cueKey;
    playGameCue("human-prompt");
  }, [game]);

  useEffect(() => {
    if (!game || !latestSpeechEntry || latestSpeechEntry.speakerId === "narrator" || latestSpeechEntry.speakerId === "system") {
      return;
    }

    const cueKey = `${game.id}:${latestSpeechEntry.id}:accusation`;
    if (latestAccusationCueRef.current === cueKey) {
      return;
    }

    const mentionedPlayers = mentionedPlayersInText(game.players, latestSpeechEntry.text, latestSpeechEntry.speakerId);
    if (!mentionedPlayers.length || !isPressureLine(latestSpeechEntry.text)) {
      return;
    }

    latestAccusationCueRef.current = cueKey;
    playGameCue("accusation");
  }, [game, latestSpeechEntry]);

  useEffect(() => {
    if (!game || !latestBlockedActionEntry) {
      return;
    }

    const cueKey = `${game.id}:${latestBlockedActionEntry.id}:blocked`;
    if (latestDecisionCueRef.current === cueKey) {
      return;
    }

    latestDecisionCueRef.current = cueKey;
    playShieldCue();
  }, [game, latestBlockedActionEntry]);

  useEffect(() => {
    if (!latestPublicEntry || spokenEntryRef.current === latestPublicEntry.id) {
      return;
    }
    spokenEntryRef.current = latestPublicEntry.id;
    if (!voicePlaybackEnabled) {
      setAudioPlaybackActive(false);
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setStatus(audioMuted ? "Sound muted." : "Voice off.");
      setPlaybackCompleteId(latestPublicEntry.id);
      return;
    }

    let cancelled = false;
    setAudioPlaybackActive(true);
    void (async () => {
      try {
        await speakEntry(latestPublicEntry, voiceMode, elevenLabsAudioCacheRef.current, setStatus, game?.players ?? []);
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
  }, [audioMuted, latestPublicEntry, voiceMode, voicePlaybackEnabled]);

  useEffect(() => {
    if (!game || !voicePlaybackEnabled || paused || busy || game.currentPrompt || game.phase === "game-over") {
      return;
    }
    if (!latestPublicEntry || latestPublicEntry.id === playbackCompleteId) {
      return;
    }

    prefetchNextAdvance(game);
  }, [busy, game, latestPublicEntry, paused, playbackCompleteId, voicePlaybackEnabled]);

  useEffect(() => {
    if (!game || paused || busy || game.currentPrompt || game.phase === "game-over") {
      return;
    }
    if (audioPlayingRef.current) {
      return;
    }

    const latestEntryWasPlayed = latestPublicEntry?.id === playbackCompleteId;
    const delay = automaticAdvanceDelay(game, latestPublicEntry, latestEntryWasPlayed, !voicePlaybackEnabled);
    const timer = window.setTimeout(() => {
      void applyPrefetchedOrAdvance();
    }, delay);

    return () => window.clearTimeout(timer);
  }, [busy, game, latestPublicEntry, paused, playbackCompleteId, voicePlaybackEnabled]);

  useEffect(() => {
    if (!game || !autoHumanEnabled || paused || busy || game.phase === "game-over" || !isHumanPrompt(game.currentPrompt)) {
      return;
    }
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    const promptKey = `${game.id}:${game.updatedAt}:${game.currentPrompt}`;
    if (autoHumanPromptRef.current === promptKey) {
      return;
    }

    autoHumanPromptRef.current = promptKey;
    void submitAutoHumanTurn(promptKey);
  }, [autoHumanEnabled, busy, game, paused]);

  async function start(seed?: string) {
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    const displayName = normalizeHumanName(humanName);

    setBusy(true);
    setStatus("Starting game.");
    try {
      window.localStorage.setItem(HUMAN_NAME_STORAGE_KEY, displayName);
      const nextGame = await createGame({ seed, humanName: displayName, characterSetup, humanRole });
      clearPrefetchedAdvance();
      setGame(nextGame);
      setHumanText("");
      setPaused(false);
      setDialogMode(null);
      setSettingsOpen(false);
      spokenEntryRef.current = null;
      setPlaybackCompleteId(null);
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
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    clearPrefetchedAdvance();
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
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    setBusy(true);
    clearPrefetchedAdvance();
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

  function updateHumanText(text: string) {
    setHumanText(sanitizeHumanTextDraft(text));
  }

  async function startListening() {
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    if (listening) {
      stopListening("Stopped listening.");
      return;
    }

    const speechWindow = window as BrowserSpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Voice dictation is not supported in this browser. Use Chrome or Edge, or type your line.");
      return;
    }

    if (!window.isSecureContext) {
      setStatus("Mic permission requires localhost or HTTPS. Open the app from localhost, then try again.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("This browser cannot request mic access here. Type your line instead.");
      return;
    }

    speechRecognitionRef.current?.abort();
    speechBaseTextRef.current = humanText.trim();
    speechFinalTextRef.current = "";
    speechDictatedTextRef.current = "";
    const requestId = speechStartRequestIdRef.current + 1;
    speechStartRequestIdRef.current = requestId;

    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onaudiostart = () => {
      setListening(true);
      setStatus("Mic is on. Speak now.");
    };
    recognition.onspeechstart = () => {
      setStatus("Listening to your line.");
    };
    recognition.onresult = (event) => {
      let finalText = "";
      let interimText = "";

      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript?.trim();
        if (!transcript) {
          continue;
        }
        if (result.isFinal) {
          finalText = joinDictationText(finalText, transcript);
        } else {
          interimText = joinDictationText(interimText, transcript);
        }
      }

      speechFinalTextRef.current = finalText;
      const dictatedText = joinDictationText(speechFinalTextRef.current, interimText);
      speechDictatedTextRef.current = dictatedText;
      const nextText = joinDictationText(speechBaseTextRef.current, dictatedText);
      updateHumanText(nextText);
      setStatus(dictatedText ? "Dictation captured. You can edit before submitting." : "Listening.");
    };
    recognition.onerror = (event) => {
      setListening(false);
      setStatus(micErrorMessage(event.error));
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setListening(false);
      if (speechDictatedTextRef.current) {
        setStatus("Dictation ready. Edit it or submit your speech.");
      }
    };
    recognition.onnomatch = () => {
      setStatus("I could not make out the words. Try again or type your line.");
    };

    try {
      speechRecognitionRef.current = recognition;
      setListening(true);
      setStatus("Requesting microphone access.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      if (speechStartRequestIdRef.current !== requestId || speechRecognitionRef.current !== recognition) {
        recognition.abort();
        return;
      }
      setStatus("Mic permission granted. Starting dictation.");
      recognition.start();
    } catch (error) {
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      setListening(false);
      setStatus(micStartErrorMessage(error));
    }
  }

  function stopListening(message: string) {
    speechStartRequestIdRef.current += 1;
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          // The browser may throw if recognition has not fully started yet.
        }
      }
    }
    setListening(false);
    setStatus(message);
  }

  async function submitVote(targetId: PlayerId) {
    if (!game) {
      return;
    }
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    setBusy(true);
    clearPrefetchedAdvance();
    setStatus("Casting vote.");
    try {
      const nextGame = await postGameAction(game.id, { type: "vote", targetId, text: humanText });
      setGame(nextGame);
      setHumanText("");
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
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    setBusy(true);
    clearPrefetchedAdvance();
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

  async function submitAutoHumanTurn(promptKey: string) {
    if (!game || busy) {
      return;
    }
    if (!canPlayOnCurrentViewport()) {
      return;
    }

    clearPrefetchedAdvance();
    speechRecognitionRef.current?.abort();
    setListening(false);
    setBusy(true);
    setStatus("Autoplay choosing your move.");
    try {
      const nextGame = await postGameAction(game.id, { type: "auto-human" });
      setGame(nextGame);
      setHumanText("");
      setStatus(nextGame.currentPrompt ? "Autoplay waiting." : nextGame.phase === "game-over" ? "Game over." : "Autoplay moved.");
    } catch (error) {
      if (autoHumanPromptRef.current === promptKey) {
        autoHumanPromptRef.current = null;
      }
      setAutoHumanEnabled(false);
      window.localStorage.setItem(AUTO_HUMAN_STORAGE_KEY, "false");
      setStatus(errorMessage(error, "Autoplay stopped."));
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
    if (mode === "off") {
      if ("speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setAudioPlaybackActive(false);
      setPlaybackCompleteId(latestPublicEntry?.id ?? null);
      setStatus("Voice off. Sound effects stay on.");
      return;
    }
    setStatus(mode === "elevenlabs" ? "ElevenLabs selected. Turn sound on to use it." : "Browser voice selected.");
  }

  function toggleAutoHuman() {
    if (topbarControlsLocked) {
      return;
    }

    setAutoHumanEnabled((enabled) => {
      const nextEnabled = !enabled;
      autoHumanPromptRef.current = null;
      window.localStorage.setItem(AUTO_HUMAN_STORAGE_KEY, String(nextEnabled));
      setStatus(nextEnabled ? "Autoplay on." : "Autoplay off.");
      return nextEnabled;
    });
  }

  function setHumanAvatar(avatarId: HumanAvatarId) {
    setHumanAvatarState(avatarId);
    window.localStorage.setItem(HUMAN_AVATAR_STORAGE_KEY, avatarId);
    setAvatarPickerOpen(false);
    setStatus("Portrait selected.");
  }

  function setCharacterSetup(setup: CharacterSetup) {
    const normalizedSetup = normalizeCharacterSetup(setup);
    setCharacterSetupState(normalizedSetup);
    window.localStorage.setItem(CHARACTER_SETUP_STORAGE_KEY, JSON.stringify(normalizedSetup));
    setStatus("Table setup updated.");
  }

  function setHumanRole(role: HumanRolePreference) {
    setHumanRoleState(role);
    window.localStorage.setItem(HUMAN_ROLE_STORAGE_KEY, role);
    setStatus(role === "random" ? "Your role will be random." : `Your role will be ${role}.`);
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
    clearPrefetchedAdvance();
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

  function goHomeFromGameOver() {
    confirmExit();
  }

  function closeDialog() {
    if (dialogMode === "exit") {
      setPaused(false);
    }
    setDialogMode(null);
  }

  function canPlayOnCurrentViewport() {
    if (!viewportLocked) {
      return true;
    }

    setStatus("Please resize to a bigger screen before playing.");
    return false;
  }

  async function copyTranscript() {
    if (!game) {
      return;
    }

    try {
      await writeClipboardText(formatTranscriptForClipboard(game));
      setStatus("Transcript copied.");
    } catch {
      setStatus("Could not copy transcript.");
    }
  }

  function clearPrefetchedAdvance() {
    prefetchedAdvanceRef.current = null;
    prefetchingAdvanceRef.current = null;
  }

  function prefetchKeyMatches(entry: { sourceGameId: string; sourceUpdatedAt: number } | null, source: GameState) {
    return !!entry && entry.sourceGameId === source.id && entry.sourceUpdatedAt === source.updatedAt;
  }

  function prefetchNextAdvance(source: GameState) {
    if (prefetchKeyMatches(prefetchedAdvanceRef.current, source) || prefetchKeyMatches(prefetchingAdvanceRef.current, source)) {
      return;
    }

    const sourceGameId = source.id;
    const sourceUpdatedAt = source.updatedAt;
    const promise = postGameAction(source.id, { type: "advance" });
    prefetchingAdvanceRef.current = {
      sourceGameId,
      sourceUpdatedAt,
      promise
    };
    setStatus("Next turn thinking.");

    void promise
      .then((nextGame) => {
        if (!prefetchKeyMatches(prefetchingAdvanceRef.current, source)) {
          return;
        }
        prefetchedAdvanceRef.current = {
          sourceGameId,
          sourceUpdatedAt,
          game: nextGame
        };
        prefetchingAdvanceRef.current = null;
        setStatus(nextGame.currentPrompt ? "Your move is ready." : "Next turn ready.");
      })
      .catch((error) => {
        if (prefetchKeyMatches(prefetchingAdvanceRef.current, source)) {
          prefetchingAdvanceRef.current = null;
          setStatus(errorMessage(error, "Could not prepare the next turn."));
        }
      });
  }

  async function applyPrefetchedOrAdvance() {
    if (!game || busy) {
      return;
    }

    const ready = prefetchedAdvanceRef.current;
    if (ready && prefetchKeyMatches(ready, game)) {
      prefetchedAdvanceRef.current = null;
      setGame(ready.game);
      setStatus(ready.game.currentPrompt ? "Your move." : ready.game.phase === "game-over" ? "Game over." : "Advanced.");
      return;
    }

    const pending = prefetchingAdvanceRef.current;
    if (pending && prefetchKeyMatches(pending, game)) {
      setStatus("Next turn finishing.");
      try {
        const nextGame = await pending.promise;
        if (prefetchKeyMatches(prefetchingAdvanceRef.current, game) || prefetchKeyMatches(prefetchedAdvanceRef.current, game)) {
          clearPrefetchedAdvance();
          setGame(nextGame);
          setStatus(nextGame.currentPrompt ? "Your move." : nextGame.phase === "game-over" ? "Game over." : "Advanced.");
        }
      } catch (error) {
        clearPrefetchedAdvance();
        setStatus(errorMessage(error, "Could not advance game."));
      }
      return;
    }

    await advance(false);
  }

  function playButtonSoundFromClick(event: { target: EventTarget | null }) {
    const button = buttonFromEventTarget(event.target);
    if (!button) {
      return;
    }

    if (button.dataset.sfx === "start") {
      playGameCue("start");
      return;
    }

    const forceSound = button.dataset.sfx === "sound-toggle";
    playUiSound(uiClickRef.current, UI_CLICK_VOLUME, forceSound);
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

    playUiSound(uiClickRef.current, UI_HOVER_VOLUME);
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

  function playGameCue(cue: DesignedCue) {
    if (audioMuted) {
      return;
    }

    void playDesignedCue(decisionAudioContextRef.current, cue)
      .then((context) => {
        decisionAudioContextRef.current = context;
      })
      .catch(() => {
        playUiSound(cue === "start" ? uiStartRef.current : uiClickRef.current, cue === "start" ? UI_START_VOLUME : 0.22);
      });
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
        const stab = context.createOscillator();
        const cry = context.createOscillator();
        const now = context.currentTime;
        const duration = 0.82;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(DECISION_CUE_VOLUME * 1.2, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(DECISION_CUE_VOLUME * 0.45, now + 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        stab.type = "sawtooth";
        cry.type = "sine";
        stab.frequency.setValueAtTime(760, now);
        stab.frequency.exponentialRampToValueAtTime(96, now + 0.16);
        cry.frequency.setValueAtTime(620, now + 0.08);
        cry.frequency.exponentialRampToValueAtTime(170, now + duration);

        stab.connect(gain);
        cry.connect(gain);
        gain.connect(context.destination);

        stab.start(now);
        cry.start(now + 0.08);
        stab.stop(now + 0.18);
        cry.stop(now + duration);
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

  function playShieldCue() {
    if (audioMuted) {
      return;
    }

    try {
      const context = decisionAudioContextRef.current ?? new AudioContext();
      decisionAudioContextRef.current = context;

      void context.resume().then(() => {
        const gain = context.createGain();
        const clang = context.createOscillator();
        const ring = context.createOscillator();
        const now = context.currentTime;
        const duration = 0.42;

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(SHIELD_CUE_VOLUME, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        clang.type = "square";
        ring.type = "triangle";
        clang.frequency.setValueAtTime(540, now);
        clang.frequency.exponentialRampToValueAtTime(180, now + duration);
        ring.frequency.setValueAtTime(820, now + 0.03);
        ring.frequency.exponentialRampToValueAtTime(260, now + duration);

        clang.connect(gain);
        ring.connect(gain);
        gain.connect(context.destination);

        clang.start(now);
        ring.start(now + 0.03);
        clang.stop(now + duration);
        ring.stop(now + duration);
      });
    } catch {
      playUiSound(uiClickRef.current, SHIELD_CUE_VOLUME);
    }
  }

  return (
    <main
      className={`shell ${isHome ? "home-shell" : ""}`}
      onClickCapture={playButtonSoundFromClick}
      onPointerOverCapture={playButtonSoundFromHover}
    >
      <CustomCursor />
      {isHome ? <HomeTownBackground /> : null}
      <section className="mobile-lockout" role="status" aria-live="polite" aria-hidden={!viewportLocked}>
        <div>
          <p className="eyebrow">Table too small</p>
          <h2>Hopefully you haven&apos;t started the game.</h2>
          <p>Please resize the screen to a bigger size. Agent Mafia is not meant to be played on a tiny mobile screen.</p>
        </div>
      </section>
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
            <button type="button" className="icon-button" onClick={copyTranscript} aria-label="Copy transcript" title="Copy transcript">
              <Copy aria-hidden="true" />
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
            <button
              type="button"
              className={`autoplay-toggle ${autoHumanEnabled ? "active" : ""}`}
              onClick={toggleAutoHuman}
              disabled={topbarControlsLocked}
              aria-pressed={autoHumanEnabled}
              aria-label={autoHumanEnabled ? "Turn autoplay off" : "Turn autoplay on"}
              title={autoHumanEnabled ? "Turn autoplay off" : "Turn autoplay on"}
            >
              <Robot aria-hidden="true" />
              <span>Autoplay {autoHumanEnabled ? "On" : "Off"}</span>
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={requestExit}
              disabled={topbarControlsLocked}
              aria-label="New game"
              title="New game"
            >
              <Reload aria-hidden="true" />
            </button>
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
          onHumanNameChange={(name) => setHumanName(sanitizeHumanNameDraft(name))}
          onHumanAvatarChange={setHumanAvatar}
          onAvatarPickerOpenChange={setAvatarPickerOpen}
          onStart={() => start()}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleAudio={toggleAudioMuted}
          onVoiceModeChange={setVoiceMode}
        />
      ) : (
        <section className="game-grid">
          <aside className="left-rail">
            <RoleCard player={human} game={game} />
            <PhasePanel game={game} status={status} busy={busy} paused={paused} />
            <VoteBoard game={game} />
          </aside>

          <section className="stage-panel">
            <TableScene2D game={game} busy={busy} paused={paused} humanAvatar={humanAvatar} />
            <HumanPanel
              game={game}
              humanText={humanText}
              setHumanText={updateHumanText}
              busy={busy}
              listening={listening}
              onSubmitSpeech={submitSpeech}
              onStartListening={startListening}
              onSubmitVote={submitVote}
              onSubmitNightAction={submitNightAction}
            />
            <GameOverPanel game={game} onPlayAgain={() => start()} onGoHome={goHomeFromGameOver} />
          </section>

          <aside className="right-rail">
            <Transcript game={game} />
          </aside>
        </section>
      )}
      <GameDialog mode={dialogMode} onCancel={closeDialog} onConfirmExit={confirmExit} />
      <CharacterSettingsDialog
        open={isHome && settingsOpen}
        characterSetup={characterSetup}
        humanRole={humanRole}
        onCharacterSetupChange={setCharacterSetup}
        onHumanRoleChange={setHumanRole}
        onClose={() => setSettingsOpen(false)}
      />
    </main>
  );
}

function readStoredCharacterSetup(value: string | null): CharacterSetup | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return normalizeCharacterSetup(JSON.parse(value) as CharacterSetup);
  } catch {
    return undefined;
  }
}

function isHumanRolePreference(value: string | null): value is HumanRolePreference {
  return value === "random" || value === "mafia" || value === "detective" || value === "doctor" || value === "villager";
}

function formatTranscriptForClipboard(game: GameState): string {
  const visibleTranscript = game.transcript.filter((entry) => !entry.privateTo?.length || entry.privateTo.includes("player_6"));
  const metadata = [
    "Agent Mafia Transcript",
    `Game: ${game.id}`,
    `Seed: ${game.seed}`,
    `Phase: ${game.phase}`,
    `Day: ${game.day}`,
    `Winner: ${game.winner ?? "none"}`
  ];
  const lines = visibleTranscript.map((entry) => `[Day ${entry.day} | ${entry.phase} | ${entry.kind}] ${entry.speakerName}: ${entry.text}`);
  const actionLines = (game.actionLog ?? []).map(
    (entry) =>
      `[Day ${entry.day} | ${entry.phase} | ${entry.action} | ${entry.outcome}] ${entry.actorName} -> ${entry.targetName}: ${entry.detail}`
  );
  return [...metadata, "", "Transcript:", ...lines, "", "Visible action log:", ...(actionLines.length ? actionLines : ["none"])].join("\n");
}

async function writeClipboardText(text: string): Promise<void> {
  if (window.navigator.clipboard?.writeText) {
    await window.navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function joinDictationText(...parts: Array<string | undefined>): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isPressureLine(text: string): boolean {
  return /\b(accuse|alibi|blood|cover|dodg|guilty|knife|lie|liar|lying|mafia|murder|quiet|suspicious|suspect|vote|voted|why)\b/i.test(
    text
  );
}

function isHumanPrompt(prompt: string | undefined): boolean {
  return !!prompt?.startsWith("human-");
}

function micErrorMessage(error: string | undefined): string {
  if (error === "not-allowed" || error === "service-not-allowed") {
    return "Mic permission was blocked. Allow microphone access in the browser, then try again.";
  }
  if (error === "audio-capture") {
    return "No microphone was found. Connect or select a mic, then try again.";
  }
  if (error === "no-speech") {
    return "No speech was heard. Try the mic again or type your line.";
  }
  if (error === "network") {
    return "The browser speech service is unavailable. Try again, or type your line.";
  }
  if (error === "aborted") {
    return "Mic dictation stopped.";
  }
  return "Mic capture failed. Type your line instead.";
}

function micStartErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Mic permission was blocked. Allow microphone access in the browser, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect or select a mic, then try again.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The microphone is already in use or cannot be opened.";
    }
  }

  return errorMessage(error, "Mic capture failed. Type your line instead.");
}
