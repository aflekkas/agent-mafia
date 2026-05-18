import { Phase } from "@/lib/game/types";

export type DesignedCue =
  | "start"
  | "night"
  | "day"
  | "vote-phase"
  | "resolve-vote"
  | "human-prompt"
  | "accusation"
  | "game-over-town"
  | "game-over-mafia";

type OscillatorShape = OscillatorType;

type OscillatorCue = {
  type: OscillatorShape;
  frequency: number;
  endFrequency?: number;
  start: number;
  duration: number;
  gain: number;
  attack?: number;
  decay?: number;
  destination?: AudioNode;
};

type NoiseCue = {
  start: number;
  duration: number;
  gain: number;
  attack?: number;
  decay?: number;
  filterFrequency?: number;
  filterType?: BiquadFilterType;
  destination?: AudioNode;
};

const CUE_VOLUME: Record<DesignedCue, number> = {
  start: 0.44,
  night: 0.2,
  day: 0.18,
  "vote-phase": 0.18,
  "resolve-vote": 0.24,
  "human-prompt": 0.16,
  accusation: 0.2,
  "game-over-town": 0.26,
  "game-over-mafia": 0.28
};

export function phaseCueFor(phase: Phase, winner?: "town" | "mafia"): DesignedCue | null {
  if (phase === "night") {
    return "night";
  }
  if (phase === "day-discussion") {
    return "day";
  }
  if (phase === "day-vote") {
    return "vote-phase";
  }
  if (phase === "resolve-vote") {
    return "resolve-vote";
  }
  if (phase === "game-over") {
    return winner === "town" ? "game-over-town" : "game-over-mafia";
  }
  return null;
}

export async function playDesignedCue(context: AudioContext | null, cue: DesignedCue): Promise<AudioContext> {
  const audioContext = context ?? new AudioContext();
  await audioContext.resume();

  const master = audioContext.createGain();
  const now = audioContext.currentTime;
  master.gain.setValueAtTime(CUE_VOLUME[cue], now);
  master.connect(audioContext.destination);

  scheduleCue(audioContext, master, cue, now);

  return audioContext;
}

function scheduleCue(context: AudioContext, destination: AudioNode, cue: DesignedCue, now: number) {
  switch (cue) {
    case "start":
      scheduleStartSting(context, destination, now);
      break;
    case "night":
      scheduleNightDrop(context, destination, now);
      break;
    case "day":
      scheduleDayReveal(context, destination, now);
      break;
    case "vote-phase":
      scheduleVoteTicks(context, destination, now);
      break;
    case "resolve-vote":
      scheduleVerdictStamp(context, destination, now);
      break;
    case "human-prompt":
      scheduleHumanPrompt(context, destination, now);
      break;
    case "accusation":
      scheduleAccusationScrape(context, destination, now);
      break;
    case "game-over-town":
      scheduleGameOver(context, destination, now, "town");
      break;
    case "game-over-mafia":
      scheduleGameOver(context, destination, now, "mafia");
      break;
  }
}

function scheduleStartSting(context: AudioContext, destination: AudioNode, now: number) {
  const filter = context.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1350, now);
  filter.frequency.exponentialRampToValueAtTime(720, now + 0.9);
  filter.connect(destination);

  [98, 146.83, 196, 233.08].forEach((frequency, index) => {
    scheduleOscillator(context, {
      type: index === 0 ? "triangle" : "sine",
      frequency,
      endFrequency: index === 0 ? 73.42 : frequency * 0.995,
      start: now + index * 0.035,
      duration: 1.08,
      gain: index === 0 ? 0.72 : 0.34,
      attack: 0.035,
      decay: 1.02,
      destination: filter
    });
  });

  scheduleNoise(context, {
    start: now + 0.03,
    duration: 0.13,
    gain: 0.32,
    attack: 0.006,
    decay: 0.12,
    filterFrequency: 2600,
    filterType: "bandpass",
    destination
  });
  scheduleOscillator(context, {
    type: "square",
    frequency: 784,
    endFrequency: 523.25,
    start: now + 0.18,
    duration: 0.11,
    gain: 0.09,
    attack: 0.006,
    decay: 0.09,
    destination
  });
}

function scheduleNightDrop(context: AudioContext, destination: AudioNode, now: number) {
  scheduleOscillator(context, {
    type: "sine",
    frequency: 196,
    endFrequency: 73.42,
    start: now,
    duration: 0.72,
    gain: 0.45,
    attack: 0.02,
    decay: 0.7,
    destination
  });
  scheduleNoise(context, {
    start: now + 0.06,
    duration: 0.48,
    gain: 0.22,
    attack: 0.04,
    decay: 0.42,
    filterFrequency: 520,
    filterType: "lowpass",
    destination
  });
}

function scheduleDayReveal(context: AudioContext, destination: AudioNode, now: number) {
  [196, 261.63, 329.63].forEach((frequency, index) => {
    scheduleOscillator(context, {
      type: "triangle",
      frequency,
      start: now + index * 0.045,
      duration: 0.42,
      gain: 0.2,
      attack: 0.012,
      decay: 0.38,
      destination
    });
  });
}

function scheduleVoteTicks(context: AudioContext, destination: AudioNode, now: number) {
  [0, 0.16, 0.32].forEach((offset, index) => {
    scheduleOscillator(context, {
      type: "square",
      frequency: index === 2 ? 188 : 244,
      endFrequency: 92,
      start: now + offset,
      duration: 0.08,
      gain: index === 2 ? 0.32 : 0.2,
      attack: 0.004,
      decay: 0.07,
      destination
    });
  });
}

function scheduleVerdictStamp(context: AudioContext, destination: AudioNode, now: number) {
  scheduleOscillator(context, {
    type: "triangle",
    frequency: 132,
    endFrequency: 48,
    start: now,
    duration: 0.28,
    gain: 0.58,
    attack: 0.008,
    decay: 0.26,
    destination
  });
  scheduleNoise(context, {
    start: now + 0.01,
    duration: 0.12,
    gain: 0.32,
    attack: 0.004,
    decay: 0.11,
    filterFrequency: 1100,
    filterType: "bandpass",
    destination
  });
}

function scheduleHumanPrompt(context: AudioContext, destination: AudioNode, now: number) {
  [392, 523.25].forEach((frequency, index) => {
    scheduleOscillator(context, {
      type: "sine",
      frequency,
      start: now + index * 0.09,
      duration: 0.18,
      gain: 0.18,
      attack: 0.008,
      decay: 0.16,
      destination
    });
  });
}

function scheduleAccusationScrape(context: AudioContext, destination: AudioNode, now: number) {
  const filter = context.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(860, now);
  filter.frequency.exponentialRampToValueAtTime(420, now + 0.34);
  filter.Q.setValueAtTime(8, now);
  filter.connect(destination);

  scheduleOscillator(context, {
    type: "sawtooth",
    frequency: 148,
    endFrequency: 92,
    start: now,
    duration: 0.36,
    gain: 0.24,
    attack: 0.015,
    decay: 0.33,
    destination: filter
  });
  scheduleNoise(context, {
    start: now + 0.03,
    duration: 0.2,
    gain: 0.18,
    attack: 0.01,
    decay: 0.18,
    filterFrequency: 1400,
    filterType: "bandpass",
    destination
  });
}

function scheduleGameOver(context: AudioContext, destination: AudioNode, now: number, winner: "town" | "mafia") {
  const frequencies = winner === "town" ? [146.83, 196, 293.66, 392] : [196, 146.83, 110, 73.42];
  frequencies.forEach((frequency, index) => {
    scheduleOscillator(context, {
      type: index === 0 ? "triangle" : "sine",
      frequency,
      start: now + index * 0.11,
      duration: 0.72,
      gain: index === 0 ? 0.32 : 0.22,
      attack: 0.02,
      decay: 0.68,
      destination
    });
  });
}

function scheduleOscillator(context: AudioContext, cue: OscillatorCue) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const attack = cue.attack ?? 0.01;
  const decay = cue.decay ?? cue.duration;
  const start = cue.start;
  const stop = start + cue.duration;

  oscillator.type = cue.type;
  oscillator.frequency.setValueAtTime(cue.frequency, start);
  if (cue.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, cue.endFrequency), stop);
  }

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, cue.gain), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);

  oscillator.connect(gain);
  gain.connect(cue.destination ?? context.destination);
  oscillator.start(start);
  oscillator.stop(stop + 0.02);
}

function scheduleNoise(context: AudioContext, cue: NoiseCue) {
  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  const attack = cue.attack ?? 0.01;
  const decay = cue.decay ?? cue.duration;
  const start = cue.start;
  const stop = start + cue.duration;

  source.buffer = makeNoiseBuffer(context, cue.duration);
  filter.type = cue.filterType ?? "bandpass";
  filter.frequency.setValueAtTime(cue.filterFrequency ?? 1200, start);
  filter.Q.setValueAtTime(2.6, start);

  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, cue.gain), start + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(cue.destination ?? context.destination);
  source.start(start);
  source.stop(stop + 0.02);
}

function makeNoiseBuffer(context: AudioContext, duration: number): AudioBuffer {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);

  for (let index = 0; index < frameCount; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }

  return buffer;
}
