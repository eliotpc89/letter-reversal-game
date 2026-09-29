import type { CSSProperties } from "react";
import { CoinIcon, TrophyIcon } from "../icons";
import type { GameState, TrophyId } from "../api";
import { TROPHIES, type Trophy } from "./trophies";

export function PrizeShop({ state, open, onClose, onBuy, buying, message }: { state: GameState; open: boolean; onClose: () => void; onBuy: (id: TrophyId) => void; buying: TrophyId | null; message: string | null }) {
  if (!open) return null;
  return <div className="shop-backdrop" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="shop-sheet" role="dialog" aria-modal="true" aria-labelledby="shop-title">
      <div className="shop-topline">
        <div><h2 id="shop-title">Prize shop</h2><p>Win rounds. Collect them all.</p></div>
        <button className="shop-close" type="button" onClick={onClose} aria-label="Close prize shop">×</button>
      </div>
      <div className="shop-balance"><CoinIcon /><strong>{state.coins}</strong><span>coins to spend</span></div>
      {message && <p className="shop-message" role="status">{message}</p>}
      <div className="shop-grid">
        {TROPHIES.map((trophy) => {
          const owned = state.unlockedTrophies.includes(trophy.id);
          const affordable = state.coins >= trophy.price;
          return <article className={`shop-item ${owned ? "owned" : ""}`} key={trophy.id} style={{ "--trophy-color": trophy.color } as CSSProperties}>
            <div className="trophy-art"><TrophyIcon id={trophy.id} /></div>
            <div className="trophy-copy"><h3>{trophy.name}</h3>{owned ? <span className="owned-badge">Unlocked!</span> : <span className="price"><CoinIcon small /> {trophy.price}</span>}</div>
            {!owned && <button type="button" onClick={() => onBuy(trophy.id)} disabled={!affordable || buying !== null} aria-label={`Unlock ${trophy.name} for ${trophy.price} coins`}>
              {buying === trophy.id ? "Unlocking…" : affordable ? "Unlock" : `Need ${trophy.price - state.coins} more`}
            </button>}
          </article>;
        })}
      </div>
    </section>
  </div>;
}

