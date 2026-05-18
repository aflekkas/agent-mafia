"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, RefObject } from "react";
import { AiSettings2 } from "pixelarticons/react/AiSettings2";
import { Cancel } from "pixelarticons/react/Cancel";
import { Castle } from "pixelarticons/react/Castle";
import { Check } from "pixelarticons/react/Check";
import { ChevronDown } from "pixelarticons/react/ChevronDown";
import { Fire } from "pixelarticons/react/Fire";
import { Headphone } from "pixelarticons/react/Headphone";
import { InfoBox } from "pixelarticons/react/InfoBox";
import { Search } from "pixelarticons/react/Search";
import { Shuffle } from "pixelarticons/react/Shuffle";
import {
  CHARACTER_PRESETS,
  CHARACTER_PROFILES,
  characterProfileById,
  normalizeCharacterSetup,
  uniqueRandomCharacterSetup
} from "@/lib/characters/profiles";
import { speakCharacterPreview } from "@/components/game/audio";
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

const PRESET_ICONS: Record<string, typeof AiSettings2> = {
  classic: Castle,
  chaos: Fire
};

type FloatingMenuPlacement = "above" | "below";

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 340;
const MENU_MIN_HEIGHT = 112;
const MENU_VIEWPORT_PADDING = 18;

function useAnchoredMenuPlacement(open: boolean, anchorRef: RefObject<HTMLElement | null>) {
  const [placement, setPlacement] = useState<FloatingMenuPlacement>("below");
  const [maxHeight, setMaxHeight] = useState(MENU_MAX_HEIGHT);

  const updatePlacement = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = viewportHeight - rect.bottom - MENU_VIEWPORT_PADDING - MENU_GAP;
    const spaceAbove = rect.top - MENU_VIEWPORT_PADDING - MENU_GAP;
    const nextPlacement = spaceBelow >= MENU_MIN_HEIGHT || spaceBelow >= spaceAbove ? "below" : "above";
    const availableSpace = Math.max(nextPlacement === "below" ? spaceBelow : spaceAbove, MENU_MIN_HEIGHT);

    setPlacement(nextPlacement);
    setMaxHeight(Math.min(MENU_MAX_HEIGHT, availableSpace));
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePlacement();
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);

    return () => {
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [open, updatePlacement]);

  return {
    updatePlacement,
    menuProps: {
      "data-placement": placement,
      style: {
        "--character-select-menu-max-height": `${Math.round(maxHeight)}px`
      } as CSSProperties
    }
  };
}

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
  const searchId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { updatePlacement, menuProps } = useAnchoredMenuPlacement(open, rootRef);
  const selectedIndex = Math.max(
    0,
    CHARACTER_PROFILES.findIndex((profile) => profile.id === selectedProfileId)
  );
  const selectedProfile = CHARACTER_PROFILES[selectedIndex] ?? CHARACTER_PROFILES[0];
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();
  const filteredProfiles = normalizedSearchQuery
    ? CHARACTER_PROFILES.filter((profile) => {
        const searchableText = `${profile.name} ${profile.summary} ${profile.style} ${profile.id}`.toLowerCase();
        return searchableText.includes(normalizedSearchQuery);
      })
    : CHARACTER_PROFILES;
  const selectedFilteredIndex = filteredProfiles.findIndex((profile) => profile.id === selectedProfile.id);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setSearchQuery("");
      }
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSearchQuery("");
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
    if (open && selectedFilteredIndex >= 0) {
      optionRefs.current[selectedFilteredIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [open, selectedFilteredIndex]);

  function selectCharacter(characterId: string) {
    if (unavailableProfileIds.has(characterId)) {
      return;
    }

    onChange(characterId);
    setOpen(false);
    setSearchQuery("");
  }

  function focusOption(index: number) {
    optionRefs.current[index]?.focus();
  }

  function openMenu() {
    updatePlacement();
    setOpen(true);
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closeMenu() {
    setOpen(false);
    setSearchQuery("");
  }

  function handleButtonKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openMenu();
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      openMenu();
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filteredProfiles.length === 0) {
        return;
      }
      focusOption(selectedFilteredIndex >= 0 ? selectedFilteredIndex : 0);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filteredProfiles.length === 0) {
        return;
      }
      focusOption(selectedFilteredIndex >= 0 ? selectedFilteredIndex : filteredProfiles.length - 1);
    }
  }

  function handleOptionKeyDown(event: KeyboardEvent<HTMLDivElement>, index: number, characterId: string) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption((index + 1) % filteredProfiles.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption((index - 1 + filteredProfiles.length) % filteredProfiles.length);
    }

    if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    }

    if (event.key === "End") {
      event.preventDefault();
      focusOption(filteredProfiles.length - 1);
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
        onClick={() => {
          if (open) {
            closeMenu();
            return;
          }

          openMenu();
        }}
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
        <div className="character-select-menu" {...menuProps}>
          <label className="character-select-search" htmlFor={searchId}>
            <Search aria-hidden="true" />
            <input
              ref={searchInputRef}
              id={searchId}
              type="search"
              value={searchQuery}
              placeholder="Search characters"
              aria-label={`Search ${label} characters`}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchKeyDown}
            />
          </label>
          <div className="character-select-results" id={listboxId} role="listbox" aria-label={`${label} character`}>
            {filteredProfiles.length > 0 ? (
              filteredProfiles.map((profile, index) => {
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
                    tabIndex={selected || (selectedFilteredIndex < 0 && index === 0) ? 0 : -1}
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
              })
            ) : (
              <p className="character-select-empty">No matching characters.</p>
            )}
          </div>
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
  const previewAudioCacheRef = useRef<Map<string, Blob>>(new Map());
  const [previewingSeatId, setPreviewingSeatId] = useState<NpcPlayerId | null>(null);

  useEffect(() => {
    if (!open) {
      setPreviewingSeatId(null);
    }
  }, [open]);

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

  async function previewCharacterVoice(seatId: NpcPlayerId) {
    const profile = characterProfileById(normalizedSetup[seatId]) ?? CHARACTER_PROFILES[0];

    setPreviewingSeatId(seatId);

    try {
      await speakCharacterPreview({
        speakerId: seatId,
        profile,
        elevenLabsAudioCache: previewAudioCacheRef.current
      });
    } finally {
      setPreviewingSeatId(null);
    }
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
            {CHARACTER_PRESETS.map((preset) => {
              const PresetIcon = PRESET_ICONS[preset.id] ?? AiSettings2;

              return (
                <button key={preset.id} type="button" onClick={() => onCharacterSetupChange(preset.setup)}>
                  <PresetIcon aria-hidden="true" />
                  {preset.name}
                </button>
              );
            })}
            <button type="button" onClick={() => onCharacterSetupChange(uniqueRandomCharacterSetup())}>
              <Shuffle aria-hidden="true" />
              Randomize
            </button>
          </div>
        </div>

        <div className="settings-section character-slot-list">
          {NPC_PLAYER_IDS.map((seatId) => {
            const selectedProfile = characterProfileById(normalizedSetup[seatId]) ?? CHARACTER_PROFILES[0];
            const previewing = previewingSeatId === seatId;
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
                  <div className="character-preview-copy">
                    <strong>{selectedProfile.name}</strong>
                    <div className="character-summary-row">
                      <p>{selectedProfile.summary}</p>
                      <button
                        type="button"
                        className="character-personality-button"
                        aria-label={`${selectedProfile.name} personality`}
                        data-personality-tooltip={selectedProfile.style}
                      >
                        <InfoBox aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="voice-preview-button"
                    onClick={() => void previewCharacterVoice(seatId)}
                    disabled={previewingSeatId !== null}
                    aria-label={previewing ? `Loading ${selectedProfile.name} voice preview` : `Preview ${selectedProfile.name} voice`}
                    aria-busy={previewing}
                    title={
                      previewing
                        ? "Loading voice preview"
                        : `Preview ${selectedProfile.name}: ${selectedProfile.fallbackLines[0] ?? selectedProfile.summary}`
                    }
                  >
                    {previewing ? <span className="voice-preview-spinner" aria-hidden="true" /> : <Headphone aria-hidden="true" />}
                  </button>
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
