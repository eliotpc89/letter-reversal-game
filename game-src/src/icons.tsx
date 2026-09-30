import type { TrophyId } from "./api";
import { TROPHY_ICONS } from "./platform/trophy-icons";

export function SpeakerIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className="h-11 w-11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M11 5 6.5 8.5H3.2v7h3.3L11 19V5Z" fill="currentColor" stroke="none"/><path d="M15 8.3a5.4 5.4 0 0 1 0 7.4M18 5.5a9.1 9.1 0 0 1 0 13"/></svg>;
}

export function GamesIcon() {
  return <svg aria-hidden="true" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><rect x="3.5" y="3.5" width="8" height="8" rx="2"/><rect x="16.5" y="3.5" width="8" height="8" rx="2"/><rect x="3.5" y="16.5" width="8" height="8" rx="2"/><rect x="16.5" y="16.5" width="8" height="8" rx="2"/></svg>;
}

export function CoinIcon({ small = false }: { small?: boolean }) {
  return <span className={small ? "coin coin-small" : "coin"} aria-hidden="true">★</span>;
}

export function TrophyIcon({ id }: { id: TrophyId }) {
  const icons = TROPHY_ICONS as unknown as Record<string, string>;
  const svg = icons[id] ?? icons["star"] ?? "";
  return <span className="trophy-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}

