import { useEffect, useState } from "react";
import { SpeakerIcon } from "../icons";
import { useAudioClip } from "../kit/useAudioClip";
import { GameShell } from "../shell/GameShell";
import type { GameContext, Verdict } from "./types";
import { RoundResult } from "./RoundResult";
import { DEFAULT_WORD, WRITE_WORDS, shuffled, type PracticeWord } from "../content/word-bank";

export function WriteItGame({ state, onBack, onOpenShop, onRecord }: GameContext) {
  const play = useAudioClip();
  const [target, setTarget] = useState<PracticeWord>(() => WRITE_WORDS[Math.floor(Math.random() * WRITE_WORDS.length)] ?? DEFAULT_WORD);
  const [bank, setBank] = useState<string[]>(() => shuffled((WRITE_WORDS[0]?.word ?? "cot").split("")));
  const [selected, setSelected] = useState<number[]>([]);
  const [marked, setMarked] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [wrongMessage, setWrongMessage] = useState("Listen once more next round.");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setBank(shuffled(target.word.split(""))); setSelected([]); setMarked(null); setVerdict(null); setWrongMessage("Listen once more next round."); }, [target]);
  const built = selected.map((index) => bank[index] ?? "").join("");
  const isComplete = built.length === target.word.length;
  const hear = () => void play(target.audio).catch(() => undefined);
  const check = async () => {
    if (busy || verdict || !isComplete || marked === null) return;
    const right = built === target.word && marked === target.vowelIndex;
    if (!right) {
      setWrongMessage(marked === null
        ? "Build it, then tap the middle vowel to add the breve."
        : built !== target.word
          ? "Listen again and tap the letters in order."
          : "The breve goes over the vowel.");
    }
    setBusy(true);
    try { await onRecord(right); setVerdict(right ? "correct" : "wrong"); } finally { setBusy(false); }
  };
  const next = () => setTarget((old) => shuffled(WRITE_WORDS.filter((item) => item.word !== old.word))[0] ?? DEFAULT_WORD);
  return <GameShell variant="practice" eyebrow="Short o + u" title="Write it" coins={state.coins} onBack={onBack} onOpenShop={onOpenShop}>
    <main className="practice-main">
      <section className="practice-stage write-stage" aria-labelledby="write-question">
        <p className="round-count">Listen · tap letters · mark the vowel</p>
        <h1 id="write-question">Build the word.</h1>
        <button className="listen-orb" type="button" onClick={hear} aria-label="Hear the word to write"><SpeakerIcon /><span>Listen</span></button>
        <div className="word-slots" aria-label={`Your word: ${built || "empty"}`}>
          {Array.from({ length: target.word.length }, (_, index) => {
            const char = selected[index] === undefined ? "" : bank[selected[index] ?? 0] ?? "";
            return <button type="button" key={index} className={marked === index ? "marked" : ""} disabled={!char || !!verdict} onClick={() => { if (char === "o" || char === "u") setMarked(index); }} aria-label={char ? `${char}${marked === index ? ", marked with breve" : ", tap to mark if this is the vowel"}` : "Empty letter slot"}>{char}</button>;
          })}
        </div>
        <p className={`mark-prompt ${isComplete && marked === null ? "needs-mark" : ""}`} role="status">{!isComplete ? "Build the whole word, then tap its vowel." : marked === null ? "Now tap the vowel to add the breve." : "Breve added. Check your word!"}</p>
        <div className="letter-bank" aria-label="Letter choices">{bank.map((letter, index) => <button type="button" key={`${letter}-${index}`} disabled={selected.includes(index) || !!verdict} onClick={() => setSelected((old) => [...old, index])}>{letter}</button>)}</div>
        <div className="write-actions"><button type="button" onClick={() => { setSelected((old) => old.slice(0, -1)); setMarked(null); }} disabled={selected.length === 0 || !!verdict}>Backspace</button><button type="button" onClick={() => { setSelected([]); setMarked(null); }} disabled={selected.length === 0 || !!verdict}>Clear</button></div>
      </section>
      {!verdict && <button className="practice-check" type="button" onClick={() => void check()} disabled={busy || !isComplete || marked === null}>{busy ? "Checking…" : !isComplete ? "Build the word first" : marked === null ? "Tap the vowel first" : "Check it!"}</button>}
      {verdict && <RoundResult verdict={verdict} onNext={next} wrongMessage={wrongMessage} />}
      <p className="grownup-tip">After building it, underline the whole closed syllable with a finger.</p>
    </main>
  </GameShell>;
}

