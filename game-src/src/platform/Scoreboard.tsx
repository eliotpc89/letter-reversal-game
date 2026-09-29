import { useState } from "react";
import { encodeSave, type GameState } from "../api";

export function Scoreboard({ state, onReset, resetting }: { state: GameState; onReset: () => void; resetting: boolean }) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const shareProgress = async () => {
    setSharing(true);
    setShareNote(null);
    try {
      const link = `${window.location.origin}${window.location.pathname}#save=${encodeSave(state)}`;
      setShareLink(link);
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Miles' coins and trophies", text: "Open this to bring over Miles' coins and trophies.", url: link });
        setShareNote("Coins + trophies link ready.");
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        setShareNote("Coins + trophies link copied — open it on the other device to import.");
      } else {
        setShareNote("Sharing isn't available in this browser.");
      }
    } catch {
      // The share sheet was dismissed; nothing to report.
    } finally {
      setSharing(false);
    }
  };
  const rounds = state.wins + state.losses;
  return <section className={`stats-panel ${open ? "open" : ""}`}>
    <button className="stats-toggle" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span>Grown-up stats</span><span className="stats-summary">{rounds} round{rounds === 1 ? "" : "s"}</span><span className="stats-plus" aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open && <div className="stats-body">
      <div className="stat-strip">
        <div><strong>{state.coins}</strong><span>coins now</span></div>
        <div><strong>{state.totalEarned}</strong><span>earned</span></div>
        <div><strong>{state.wins} / {state.losses}</strong><span>right / wrong</span></div>
        <div><strong>{state.streak} / {state.bestStreak}</strong><span>streak / best</span></div>
      </div>
      <div className="letter-grid" aria-label="Accuracy by letter">
        {state.letters.map((item) => {
          const percent = item.attempts ? Math.round(item.correct / item.attempts * 100) : null;
          return <div className="letter-stat" key={item.letter}><span className="letter-glyph">{item.letter}</span><span>{percent === null ? "—" : `${percent}%`}</span><small>{item.correct}/{item.attempts}</small></div>;
        })}
      </div>
      {!armed ? <button className="reset-link" type="button" onClick={() => setArmed(true)}>Reset progress…</button> :
        <div className="reset-row"><span>Erase coins, stats, and trophies?</span><button type="button" onClick={() => { onReset(); setArmed(false); }} disabled={resetting}>Yes, reset</button><button type="button" onClick={() => setArmed(false)}>Cancel</button></div>}
      <button className="reset-link" type="button" onClick={() => void shareProgress()} disabled={sharing}>{sharing ? "Preparing link…" : "Create coins + trophies link…"}</button>
      {shareNote && <p className="share-note" role="status">{shareNote}</p>}
      {shareLink && <a className="share-link" href={shareLink}>Open saved coins + trophies link</a>}
    </div>}
  </section>;
}

