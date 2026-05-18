import { Cancel } from "pixelarticons/react/Cancel";
import { Check } from "pixelarticons/react/Check";
import { Home } from "pixelarticons/react/Home";
import { DialogMode } from "./types";
import { ROLE_PRESENTATION, RULE_ROLE_ORDER, RoleBeatRow, RoleIconBadge } from "./role-presentation";

export function GameDialog({
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
            {RULE_ROLE_ORDER.map((role) => {
              const card = ROLE_PRESENTATION[role];

              return (
                <article className={`role-brief-card role-${role}`} key={role}>
                  <div className="role-brief-heading">
                    <RoleIconBadge role={role} />
                    <div>
                      <strong>{card.label}</strong>
                    </div>
                  </div>
                  <p className="role-brief-copy">{card.description}</p>
                  <p className="role-card-cue">{card.cue}</p>
                  <RoleBeatRow role={role} />
                  <p className="role-objective">{card.objective}</p>
                </article>
              );
            })}
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
