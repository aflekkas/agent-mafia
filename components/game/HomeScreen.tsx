import { AiVoice } from "pixelarticons/react/AiVoice";
import { Play } from "pixelarticons/react/Play";
import { Volume } from "pixelarticons/react/Volume";
import { Volume2 } from "pixelarticons/react/Volume2";
import { HUMAN_AVATARS } from "./constants";
import { HumanAvatarId, VoiceMode } from "./types";
import { avatarFor } from "./utils";

export function HomeScreen({
  humanName,
  humanAvatar,
  avatarPickerOpen,
  audioMuted,
  busy,
  voiceMode,
  onHumanNameChange,
  onHumanAvatarChange,
  onAvatarPickerOpenChange,
  onStart,
  onToggleAudio,
  onVoiceModeChange
}: {
  humanName: string;
  humanAvatar: HumanAvatarId;
  avatarPickerOpen: boolean;
  audioMuted: boolean;
  busy: boolean;
  voiceMode: VoiceMode;
  onHumanNameChange: (name: string) => void;
  onHumanAvatarChange: (avatarId: HumanAvatarId) => void;
  onAvatarPickerOpenChange: (open: boolean | ((open: boolean) => boolean)) => void;
  onStart: () => void;
  onToggleAudio: () => void;
  onVoiceModeChange: (mode: VoiceMode) => void;
}) {
  return (
    <section className="empty-state">
      <div className="empty-copy">
        <h2>Agent Mafia</h2>
        <div className="name-row">
          <label className="name-form">
            <span>Your name</span>
            <input
              value={humanName}
              onChange={(event) => onHumanNameChange(event.target.value)}
              placeholder="Player"
              maxLength={24}
              autoComplete="given-name"
            />
          </label>
          <div
            className="home-avatar-control"
            onBlur={(event) => {
              const nextTarget = event.relatedTarget;
              if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
                onAvatarPickerOpenChange(false);
              }
            }}
          >
            <button
              type="button"
              className={`home-avatar-button ${avatarPickerOpen ? "open" : ""}`}
              onClick={() => onAvatarPickerOpenChange((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={avatarPickerOpen}
              aria-label="Choose your portrait"
              title="Choose your portrait"
            >
              <img src={avatarFor(humanAvatar).src} alt="" />
              <span>{avatarFor(humanAvatar).label}</span>
            </button>
            {avatarPickerOpen ? (
              <div className="avatar-popover" role="menu" aria-label="Choose your portrait">
                {HUMAN_AVATARS.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={humanAvatar === avatar.id}
                    className={`avatar-popover-option ${humanAvatar === avatar.id ? "selected" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onHumanAvatarChange(avatar.id)}
                  >
                    <img src={avatar.src} alt="" />
                    <span>{avatar.label}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="home-actions">
          <VoiceModeSwitch voiceMode={voiceMode} onChange={onVoiceModeChange} />
          <button
            type="button"
            className={`mute-button ${audioMuted ? "muted" : ""}`}
            data-sfx="sound-toggle"
            onClick={onToggleAudio}
            aria-pressed={audioMuted}
            aria-label={audioMuted ? "Unmute game sound" : "Mute game sound"}
            title={audioMuted ? "Unmute game sound" : "Mute game sound"}
          >
            {audioMuted ? <Volume aria-hidden="true" /> : <Volume2 aria-hidden="true" />}
            <span>{audioMuted ? "Sound Off" : "Sound On"}</span>
          </button>
          <button data-sfx="start" onClick={onStart} disabled={busy}>
            <Play aria-hidden="true" />
            <span>Start Game</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function VoiceModeSwitch({ voiceMode, onChange }: { voiceMode: VoiceMode; onChange: (mode: VoiceMode) => void }) {
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
