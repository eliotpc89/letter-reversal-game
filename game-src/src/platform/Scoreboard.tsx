import { useState } from "react";
import type { GameState } from "../api";
import { DeviceTransfer } from "./DeviceTransfer";

export function Scoreboard({ state, onReset, resetting }: { state: GameState; onReset: () => void; resetting: boolean }) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
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
      <DeviceTransfer state={state} />
    </div>}
  </section>;
}
