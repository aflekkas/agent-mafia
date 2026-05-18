"use client";

import { KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { AiSettings2 } from "pixelarticons/react/AiSettings2";
import { Cancel } from "pixelarticons/react/Cancel";
import { Check } from "pixelarticons/react/Check";
import { ChevronDown } from "pixelarticons/react/ChevronDown";
import { Reload } from "pixelarticons/react/Reload";
import {
  CHARACTER_PRESETS,
  CHARACTER_PROFILES,
  characterProfileById,
  normalizeCharacterSetup,
  uniqueRandomCharacterSetup
} from "@/lib/characters/profiles";
import { CharacterSetup, HumanRolePreference, NPC_PLAYER_IDS, NpcPlayerId } from "@/lib/game/types";

const ROLE_OPTIONS: { value: HumanRolePreference; label: string }[] = [
  { value: "random", label: "Random" },
  { value: "mafia", label: "Mafia" },
  { value: "detective", label: "Detective" },
  { value: "doctor", label: "Doctor" },
  { value: "villager", label: "Villager" }
];

const SEAT_LABELS: Record<NpcPlayerId, string> = {
  don_vito: "Seat 1",
  salvatore: "Seat 2",
  rosa: "Seat 3",
  vincenzo: "Seat 4",
  carmela: "Seat 5"
};

function CharacterSelect({
  label,
  selectedProfileId,
  unavailableProfileIds,
  onChange
}: {
  label: string;
  selectedProfileId: string;
  unavailableProfileIds: Set<string>;
  onChange: (characterId: string) => void;
}) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [open, setOpen] = useState(false);
  const selectedIndex = Math.max(
    0,
    CHARACTER_PROFILES.findIndex((profile) => profile.id === selectedProfileId)
  );
  const selectedProfile = CHARACTER_PROFILES[selectedIndex] ?? CHARACTER_PROFILES[0];

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) {
      optionRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, selectedIndex]);

  function selectCharacter(characterId: string) {
    if (unavailableProfileIds.has(characterId)) {
      return;
    }

    onChange(characterId);
    setOpen(false);
  }

  function focusOption(index: number) {
    optionRefs.current[index]?.focus();
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusOption(selectedIndex));
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => focusOption(selectedIndex));
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number, characterId: string) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption((index + 1) % CHARACTER_PROFILES.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption((index - 1 + CHARACTER_PROFILES.length) % CHARACTER_PROFILES.length);
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      focusOption(CHARACTER_PROFILES.length - 1);
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectCharacter(characterId);
    }
  }

  return (
    <div className="character-select" ref={rootRef}>
      <span className="character-select-label">{label}</span>
      <button
        type="button"
        className="character-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={handleButtonKeyDown}
      >
        <span className="character-select-trigger-face" aria-hidden="true">
          <span>{selectedProfile.name.slice(0, 1)}</span>
          <img src={selectedProfile.portraitSrc} alt="" onError={(event) => (event.currentTarget.hidden = true)} />
        </span>
        <span className="character-select-trigger-name">{selectedProfile.name}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="character-select-menu" id={listboxId} role="listbox" aria-label={`${label} character`}>
          {CHARACTER_PROFILES.map((profile, index) => {
            const selected = profile.id === selectedProfile.id;
            const inUse = unavailableProfileIds.has(profile.id);

            return (
              <div
                key={profile.id}
                ref={(node) => {
                  optionRefs.current[index] = node;
                }}
                className={`character-select-option ${selected ? "selected" : ""} ${inUse ? "in-use" : ""}`}
                role="option"
                aria-selected={selected}
                aria-disabled={inUse}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectCharacter(profile.id)}
                onKeyDown={(event) => handleOptionKeyDown(event, index, profile.id)}
              >
                <span className="character-select-check">{selected ? <Check aria-hidden="true" /> : null}</span>
                <span className="character-select-option-face" aria-hidden="true">
                  <span>{profile.name.slice(0, 1)}</span>
                  <img src={profile.portraitSrc} alt="" onError={(event) => (event.currentTarget.hidden = true)} />
                </span>
                <span className="character-select-option-copy">
                  <strong>{profile.name}</strong>
                  <small>{profile.summary}{inUse ? " - already seated" : ""}</small>
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function CharacterSettingsDialog({
  open,
  characterSetup,
  humanRole,
  onCharacterSetupChange,
  onHumanRoleChange,
  onClose
}: {
  open: boolean;
  characterSetup: CharacterSetup;
  humanRole: HumanRolePreference;
  onCharacterSetupChange: (setup: CharacterSetup) => void;
  onHumanRoleChange: (role: HumanRolePreference) => void;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  const normalizedSetup = normalizeCharacterSetup(characterSetup);

  function setSeatCharacter(seatId: NpcPlayerId, characterId: string) {
    const characterInUse = NPC_PLAYER_IDS.some((candidateSeatId) => {
      return candidateSeatId !== seatId && normalizedSetup[candidateSeatId] === characterId;
    });
    if (characterInUse) {
      return;
    }

    onCharacterSetupChange({
      ...normalizedSetup,
      [seatId]: characterId
    });
  }

  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <section className="pixel-dialog settings-dialog">
        <div className="settings-heading">
          <div>
            <p className="eyebrow">Setup</p>
            <h2 id="settings-title">Table Settings</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings" title="Close settings">
            <Cancel aria-hidden="true" />
          </button>
        </div>

        <div className="settings-section role-settings">
          <p className="settings-label">Your role</p>
          <div className="role-choice-grid">
            {ROLE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={humanRole === option.value ? "selected" : ""}
                onClick={() => onHumanRoleChange(option.value)}
                aria-pressed={humanRole === option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <p className="settings-label">Presets</p>
          <div className="preset-grid">
            {CHARACTER_PRESETS.map((preset) => (
              <button key={preset.id} type="button" onClick={() => onCharacterSetupChange(preset.setup)}>
                <AiSettings2 aria-hidden="true" />
                {preset.name}
              </button>
            ))}
            <button type="button" onClick={() => onCharacterSetupChange(uniqueRandomCharacterSetup())}>
              <Reload aria-hidden="true" />
              Randomize
            </button>
          </div>
        </div>

        <div className="settings-section character-slot-list">
          {NPC_PLAYER_IDS.map((seatId) => {
            const selectedProfile = characterProfileById(normalizedSetup[seatId]) ?? CHARACTER_PROFILES[0];
            const unavailableProfileIds = new Set(
              NPC_PLAYER_IDS.filter((candidateSeatId) => candidateSeatId !== seatId).map(
                (candidateSeatId) => normalizedSetup[candidateSeatId]
              )
            );

            return (
              <article key={seatId} className="character-slot">
                <div className="character-preview">
                  <div className="character-preview-face">
                    <span>{selectedProfile.name.slice(0, 1)}</span>
                    <img src={selectedProfile.portraitSrc} alt="" onError={(event) => (event.currentTarget.hidden = true)} />
                  </div>
                  <div>
                    <strong>{selectedProfile.name}</strong>
                    <p>{selectedProfile.summary}</p>
                  </div>
                </div>
                <CharacterSelect
                  label={SEAT_LABELS[seatId]}
                  selectedProfileId={selectedProfile.id}
                  unavailableProfileIds={unavailableProfileIds}
                  onChange={(characterId) => setSeatCharacter(seatId, characterId)}
                />
              </article>
            );
          })}
        </div>

        <div className="dialog-actions">
          <button type="button" onClick={onClose}>
            <Check aria-hidden="true" />
            Done
          </button>
        </div>
      </section>
    </div>
  );
}
