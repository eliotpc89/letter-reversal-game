import { useEffect, useMemo, useState } from "react";
import { useAudioClip } from "../kit/useAudioClip";
import { useContent } from "../content/ContentContext";
import { shuffled, type TrickWord } from "../content/word-bank";
import type { GameContext } from "./types";

const VOWELS = ["a", "e", "i", "o", "u"] as const;
const DECOYS = ["b", "c", "d", "f", "g", "h", "j", "k", "l", "m", "n", "p", "q", "r", "s", "t", "v", "w", "x", "y", "z"];
const FALLBACK_WORD: TrickWord = { word: "said", audio: "" };

/**
 * Trick Word Typist: hear a Unit 4 trick word, spell it on the on-screen
 * keyboard. Words are tested in pack order, one full pass per game.
 */
export function TrickWordSpellingGame({ coins, onBack, onOpenShop, onRecord }: GameContext) {
  const { trickWords } = useContent();
  const words = trickWords.length ? trickWords : [FALLBACK_WORD];
  const playWord = useAudioClip();
  const [questionIndex, setQuestionIndex] = useState(0);
  const [target, setTarget] = useState<TrickWord>(() => words[0] ?? FALLBACK_WORD);
  const [entered, setEntered] = useState("");
  const [feedback, setFeedback] = useState("Listen, then spell the trick word.");
  const [verdict, setVerdict] = useState<"correct" | "wrong" | null>(null);
  const [busy, setBusy] = useState(false);
  const [testComplete, setTestComplete] = useState(false);

  useEffect(() => {
    setEntered("");
    setFeedback("Listen, then spell the trick word.");
    setVerdict(null);
    if (target.audio) void playWord(target.audio).catch(() => undefined);
  }, [playWord, target]);

  const consonantColumns = useMemo(() => {
    const targetConsonants = target.word.split("").filter((letter) => !(VOWELS as readonly string[]).includes(letter));
    const available = Array.from(new Set([...targetConsonants, ...DECOYS]));
    const selected = [...targetConsonants, ...shuffled(available.filter((letter) => !targetConsonants.includes(letter))).slice(0, 10)];
    const midpoint = Math.ceil(selected.length / 2);
    return [selected.slice(0, midpoint), selected.slice(midpoint)];
  }, [target]);

  const next = () => {
    const nextIndex = questionIndex + 1;
    if (nextIndex >= words.length) {
      setTestComplete(true);
      setFeedback("Test complete! You finished all of the Unit 4 trick words.");
      return;
    }
    setQuestionIndex(nextIndex);
    setTarget(words[nextIndex] ?? FALLBACK_WORD);
  };

  const restart = () => {
    setQuestionIndex(0);
    setTarget(words[0] ?? FALLBACK_WORD);
    setTestComplete(false);
    setEntered("");
    setVerdict(null);
    setFeedback("Listen, then spell the trick word.");
  };

  const check = async () => {
    if (busy || verdict) return;
    const right = entered === target.word;
    setBusy(true);
    try {
      await onRecord(right);
      setVerdict(right ? "correct" : "wrong");
      setFeedback(right ? "Perfect spelling!" : `The word was “${target.word}.”`);
    } finally {
      setBusy(false);
    }
  };

  return <>
    <header className="practice-header trick-header">
      <button className="back-button" type="button" onClick={onBack} aria-label="Back to game menu">←</button>
      <div><span>Unit 4</span><strong>Trick Word Typist</strong></div>
      <button className="coin-purse small-purse" type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}><span className="coin">★</span><strong>{coins}</strong></button>
    </header>
    <main className="practice-main trick-main">
      <section className="practice-stage trick-stage" aria-labelledby="trick-question">
        <p className="round-count">Question {Math.min(questionIndex + 1, words.length)} of {words.length} · Listen · type · check</p>
        <h1 id="trick-question">Spell the trick word.</h1>
        <button className="listen-orb trick-listen" type="button" onClick={() => void playWord(target.audio).catch(() => undefined)} aria-label="Hear the trick word"><span className="trick-speaker" aria-hidden="true">🔊</span><span>Listen again</span></button>
        <div className="typing-word" aria-label={`Typed letters: ${entered || "none"}`}>
          {entered.split("").map((letter, index) => <span key={index} className="filled">{letter}</span>)}
        </div>
        <p className="typing-feedback" role="status">{feedback}</p>
        <div className="typing-keyboard" aria-label="On-screen spelling keyboard">
          <div className="typing-vowel-row" aria-label="Vowels">{VOWELS.map((letter) => <button key={letter} type="button" disabled={!!verdict || entered.length >= target.word.length} onClick={() => setEntered((old) => old + letter)}>{letter}</button>)}</div>
          <div className="typing-consonant-columns">{consonantColumns.map((column, columnIndex) => <div key={columnIndex}>{column.map((letter) => <button key={letter} type="button" disabled={!!verdict || entered.length >= target.word.length} onClick={() => setEntered((old) => old + letter)}>{letter}</button>)}</div>)}</div>
          <div className="typing-actions"><button type="button" onClick={() => setEntered((old) => old.slice(0, -1))} disabled={!entered || !!verdict}>⌫ Backspace</button><button type="button" onClick={() => setEntered("")} disabled={!entered || !!verdict}>Clear</button></div>
        </div>
      </section>
      {!verdict && <button className="practice-check" type="button" onClick={() => void check()} disabled={busy || !entered}>{busy ? "Checking…" : "Check spelling"}</button>}
      {verdict && <div className={`trick-result ${verdict}`} role="status"><div><strong>{testComplete ? "Test complete!" : verdict === "correct" ? "Great spelling!" : "Good try!"}</strong><span>{feedback}</span></div>{testComplete ? <button type="button" onClick={restart}>Start again <span aria-hidden="true">↻</span></button> : <button type="button" onClick={next}>Next word <span aria-hidden="true">→</span></button>}</div>}
      <p className="grownup-tip">The word is hidden until he finishes typing.</p>
    </main>
  </>;
}
