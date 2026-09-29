import { TrophyIcon } from "../icons";
import type { GameState, TrophyId } from "../api";
import { TROPHIES } from "./trophies";

export function TrophyCase({ owned, onOpen }: { owned: TrophyId[]; onOpen: () => void }) {
  return <section className="trophy-case" aria-labelledby="trophy-case-title">
    <button className="case-heading" type="button" onClick={onOpen}>
      <span id="trophy-case-title">Trophy case</span><span>{owned.length} / {TROPHIES.length} · Open shop</span>
    </button>
    <div className="trophy-shelf">
      {TROPHIES.map((trophy) => {
        const unlocked = owned.includes(trophy.id);
        return <button key={trophy.id} type="button" className={`case-slot ${unlocked ? "owned" : "locked"}`} onClick={onOpen} aria-label={unlocked ? `${trophy.name}, unlocked` : "Locked trophy"}>
          <span className="mini-trophy">{unlocked ? <TrophyIcon id={trophy.id} /> : <span className="lock-shape">?</span>}</span>
        </button>;
      })}
    </div>
  </section>;
}

