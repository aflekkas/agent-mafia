import type { ComponentType, SVGProps } from "react";
import { EyeOff } from "pixelarticons/react/EyeOff";
import { Search } from "pixelarticons/react/Search";
import { Shield } from "pixelarticons/react/Shield";
import { Skull } from "pixelarticons/react/Skull";
import { Users } from "pixelarticons/react/Users";
import type { PlayableRole, Role } from "@/lib/game/types";

type RoleIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface RolePresentation {
  label: string;
  cue: string;
  description: string;
  objective: string;
  beats: [string, string, string];
  icon: RoleIcon;
}

export const ROLE_PRESENTATION: Record<Role, RolePresentation> = {
  mafia: {
    label: "Mafia",
    cue: "Red candle, false smile",
    description: "Lie alone, redirect heat, and keep the table looking anywhere but at you.",
    objective: "Win when the shadows reach parity.",
    beats: ["Deflect", "Frame", "Survive"],
    icon: Skull
  },
  detective: {
    label: "Detective",
    cue: "Blue notebook, locked drawer",
    description: "Investigate at night, collect identities, and turn private truth into public pressure.",
    objective: "Find the lie before the town votes itself apart.",
    beats: ["Investigate", "Infer", "Nudge"],
    icon: Search
  },
  doctor: {
    label: "Doctor",
    cue: "Green lantern, steady hands",
    description: "Read the danger before it lands and quietly put yourself between the blade and the room.",
    objective: "Stop one killing blow without becoming the next target.",
    beats: ["Predict", "Protect", "Hide"],
    icon: Shield
  },
  villager: {
    label: "Villager",
    cue: "Brass chorus, bad alibis",
    description: "No night power, no secret proof. Your weapon is the room itself.",
    objective: "Use public pressure to vote out the Mafia.",
    beats: ["Listen", "Challenge", "Vote"],
    icon: Users
  },
  unknown: {
    label: "Unknown",
    cue: "Face down, breath held",
    description: "This role stays hidden until the table earns the truth.",
    objective: "Unknown until revealed.",
    beats: ["Watch", "Wait", "Reveal"],
    icon: EyeOff
  }
};

export const RULE_ROLE_ORDER: PlayableRole[] = ["mafia", "detective", "doctor", "villager"];

export function RoleIconBadge({ role, className = "" }: { role: Role; className?: string }) {
  const Icon = ROLE_PRESENTATION[role].icon;

  return (
    <span className={`role-icon-badge ${className}`} aria-hidden="true">
      <Icon />
    </span>
  );
}

export function RoleBeatRow({ role, compact = false }: { role: Role; compact?: boolean }) {
  return (
    <div className={`role-beat-row ${compact ? "compact" : ""}`} aria-label={`${ROLE_PRESENTATION[role].label} role beats`}>
      {ROLE_PRESENTATION[role].beats.map((beat) => (
        <span key={beat}>{beat}</span>
      ))}
    </div>
  );
}
