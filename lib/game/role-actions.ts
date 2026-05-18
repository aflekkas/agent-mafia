import { legalTargets } from "./selectors";
import { GameState, Player, PlayerId, Role } from "./types";

export type RoleActionKind = "mafia-kill" | "doctor-save" | "detective-investigate";

export function roleActionForRole(role: Role): RoleActionKind | undefined {
  if (role === "mafia") {
    return "mafia-kill";
  }
  if (role === "doctor") {
    return "doctor-save";
  }
  if (role === "detective") {
    return "detective-investigate";
  }
  return undefined;
}

export function roleActionTargets(state: GameState, player: Player): PlayerId[] {
  const action = roleActionForRole(player.role);
  return action ? legalTargets(state, player.id, action) : [];
}

export function nightPromptTitleForRole(role: Role): string {
  if (role === "mafia") {
    return "Choose who the Mafia kills";
  }
  if (role === "doctor") {
    return "Choose who to save";
  }
  if (role === "detective") {
    return "Choose who to investigate";
  }
  return "Choose a target";
}
