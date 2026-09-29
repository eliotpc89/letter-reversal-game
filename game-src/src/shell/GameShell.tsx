import { useEffect, type ReactNode } from "react";
import { CoinIcon, GamesIcon } from "../icons";

export type ShellVariant = "practice" | "math" | "bed";

type GameShellProps = {
  variant: ShellVariant;
  /** Small label above the title, e.g. "Short o + u". */
  eyebrow: string;
  title: string;
  coins: number;
  onBack: () => void;
  onOpenShop: () => void;
  /** Extra header blocks between the title and the coin purse (score, shields). */
  hud?: ReactNode;
  /** Game-specific header control (the b__d game's "tap to hear" button). */
  action?: ReactNode;
  /** Body class for fullscreen games, e.g. "math-fullscreen". */
  fullscreenClass?: string;
  children: ReactNode;
};

/**
 * The shared game chrome: back button, title, coin purse / shop button.
 * Variants preserve the three header shapes the arcade already uses so
 * converting a game changes no visuals — only removes duplication.
 */
export function GameShell({
  variant,
  eyebrow,
  title,
  coins,
  onBack,
  onOpenShop,
  hud,
  action,
  fullscreenClass,
  children,
}: GameShellProps) {
  useEffect(() => {
    if (!fullscreenClass) return;
    document.documentElement.classList.add(fullscreenClass);
    document.body.classList.add(fullscreenClass);
    return () => {
      document.documentElement.classList.remove(fullscreenClass);
      document.body.classList.remove(fullscreenClass);
    };
  }, [fullscreenClass]);

  const headerClass =
    variant === "math" ? "math-header" : variant === "bed" ? "play-header" : "practice-header";
  const coinClass =
    variant === "math" ? "coin-purse math-shop" : variant === "bed" ? "coin-purse" : "coin-purse small-purse";

  return <>
    <header className={headerClass}>
      {variant === "bed" ? (
        <button className="games-button" type="button" onClick={onBack} aria-label="Back to game menu">
          <GamesIcon />
        </button>
      ) : (
        <button className="back-button" type="button" onClick={onBack} aria-label="Back to game menu">←</button>
      )}
      {variant === "math" ? (
        <div className="math-title"><span>{eyebrow}</span><strong>{title}</strong></div>
      ) : variant === "bed" ? (
        action
      ) : (
        <div><span>{eyebrow}</span><strong>{title}</strong></div>
      )}
      {variant !== "bed" && action}
      {hud}
      <button className={coinClass} type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}>
        <CoinIcon small={variant === "math"} />
        <strong>{coins}</strong>
        {variant !== "practice" && <small>SHOP</small>}
      </button>
    </header>
    {children}
  </>;
}
