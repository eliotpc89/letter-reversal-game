import { useState } from "react";
import { SpeakerIcon } from "../icons";
import { useAudioClip } from "../kit/useAudioClip";
import { GameShell } from "../shell/GameShell";
import type { GameContext, Verdict } from "./types";
import { RoundResult } from "./RoundResult";
import { DEFAULT_PAIR, DEFAULT_WORD, PAIRS, PRACTICE_WORDS, WORD_AUDIO, shuffled, type PracticeWord } from "../content/word-bank";

export function PairPickerGame({ state, onBack, onOpenShop, onRecord }: GameContext) {
  const play = useAudioClip();
  const [mode, setMode] = useState<"pick" | "sort">("pick");
  const [pairIndex, setPairIndex] = useState(() => Math.floor(Math.random() * PAIRS.length));
  const pair = PAIRS[pairIndex] ?? DEFAULT_PAIR;
  const [target, setTarget] = useState<string>(() => (pair?.[Math.random() > 0.5 ? 0 : 1] ?? "cot"));
  const [sortWord, setSortWord] = useState<PracticeWord>(() => PRACTICE_WORDS[Math.floor(Math.random() * PRACTICE_WORDS.length)] ?? DEFAULT_WORD);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [busy, setBusy] = useState(false);
  const currentWord = mode === "pick" ? target : sortWord.word;
  const hear = () => { const src = WORD_AUDIO.get(currentWord); if (src) void play(src).catch(() => undefined); };
  const answer = async (choice: string) => {
    if (busy || verdict) return;
    const right = mode === "pick" ? choice === target : choice === sortWord.vowel;
    setBusy(true);
    try { await onRecord(right); setVerdict(right ? "correct" : "wrong"); } finally { setBusy(false); }
  };
  const next = () => {
    if (mode === "pick") {
      const nextIndex = (pairIndex + 1) % PAIRS.length;
      const nextPair = PAIRS[nextIndex] ?? DEFAULT_PAIR;
      setPairIndex(nextIndex);
      setTarget(nextPair?.[Math.random() > 0.5 ? 0 : 1] ?? "cot");
    } else {
      setSortWord((old) => shuffled(PRACTICE_WORDS.filter((item) => item.word !== old.word))[0] ?? DEFAULT_WORD);
    }
    setVerdict(null);
  };
  const switchMode = (nextMode: "pick" | "sort") => { setMode(nextMode); setVerdict(null); };
  return <GameShell variant="practice" eyebrow="Short o + u" title="Pair picker" coins={state.coins} onBack={onBack} onOpenShop={onOpenShop}>
    <main className="practice-main">
      <div className="mode-switch" aria-label="Pair picker activity"><button type="button" className={mode === "pick" ? "active" : ""} onClick={() => switchMode("pick")}>Listen & pick</button><button type="button" className={mode === "sort" ? "active" : ""} onClick={() => switchMode("sort")}>Sort words</button></div>
      <section className="practice-stage" aria-labelledby="pair-question">
        <p className="round-count">{mode === "pick" ? "Same consonants. One vowel changes." : "Put the word under its vowel."}</p>
        <h1 id="pair-question">{mode === "pick" ? "Which word did you hear?" : "Does it have ŏ or ŭ?"}</h1>
        <button className="listen-orb" type="button" onClick={hear} aria-label={`Hear the ${mode === "pick" ? "word" : "word to sort"}`}><SpeakerIcon /><span>Listen</span></button>
        {mode === "pick" ? <div className="word-choices">{pair.map((word) => <button type="button" key={word} onClick={() => void answer(word)} disabled={busy || !!verdict}>{word}</button>)}</div> :
          <div className="sort-choices"><button type="button" onClick={() => void answer("o")} disabled={busy || !!verdict}><span>ŏ</span><b>octopus</b></button><button type="button" onClick={() => void answer("u")} disabled={busy || !!verdict}><span>ŭ</span><b>up</b></button></div>}
      </section>
      {verdict && <RoundResult verdict={verdict} onNext={next} />}
      <p className="grownup-tip">Tap each sound from thumb to fingers, listening closely to the vowel.</p>
    </main>
  </GameShell>;
}

