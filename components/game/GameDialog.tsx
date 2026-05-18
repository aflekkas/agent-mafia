import { Cancel } from "pixelarticons/react/Cancel";
import { Check } from "pixelarticons/react/Check";
import { Home } from "pixelarticons/react/Home";
import { DialogMode } from "./types";

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
            <article>
              <strong>Detective Notebook</strong>
              <p>The Detective investigates at night and privately builds a list of known identities.</p>
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
