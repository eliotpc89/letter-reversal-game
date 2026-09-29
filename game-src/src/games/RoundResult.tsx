import type { Verdict } from "./types";

export function RoundResult({ verdict, onNext, wrongMessage = "Listen once more next round." }: { verdict: Exclude<Verdict, null>; onNext: () => void; wrongMessage?: string }) {
  return <div className={`round-result ${verdict}`} role="status">
    <div><strong>{verdict === "correct" ? "You got it!" : "Good try!"}</strong><span>{verdict === "correct" ? "+3 coins" : wrongMessage}</span></div>
    <button type="button" onClick={onNext}>Next <span aria-hidden="true">→</span></button>
  </div>;
}

