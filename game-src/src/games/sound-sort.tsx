import { useState } from "react";
import { SpeakerIcon } from "../icons";
import { useAudioClip } from "../kit/useAudioClip";
import { GameShell } from "../shell/GameShell";
import type { GameContext, Verdict } from "./types";
import { RoundResult } from "./RoundResult";
import { shuffled, type PracticeWord, type Vowel } from "../content/word-bank";
import { useWordBank } from "../content/ContentContext";

export function SoundSortGame({ state, onBack, onOpenShop, onRecord }: GameContext) {
  const bank = useWordBank();
  const play = useAudioClip();
  const [target, setTarget] = useState<PracticeWord>(() => {
    const pool = bank.SOUND_SORT_WORDS;
    return pool[Math.floor(Math.random() * pool.length)] ?? bank.DEFAULT_WORD;
  });
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [busy, setBusy] = useState(false);
  const hear = () => void play(target.audio).catch(() => undefined);
  const answer = async (choice: Vowel) => {
    if (busy || verdict) return;
    setBusy(true);
    const right = choice === target.vowel;
    try { await onRecord(right); setVerdict(right ? "correct" : "wrong"); } finally { setBusy(false); }
  };
  const next = () => {
    setTarget((old) => shuffled(bank.SOUND_SORT_WORDS.filter((item) => item.word !== old.word))[0] ?? bank.DEFAULT_WORD);
    setVerdict(null);
  };
  return <GameShell variant="practice" eyebrow="Short o + u" title="o or u?" coins={state.coins} onBack={onBack} onOpenShop={onOpenShop}>
    <main className="practice-main">
      <div className="lesson-note"><b>Listen to the whole word.</b> Which short vowel is in the middle?</div>
      <section className="practice-stage" aria-labelledby="sound-question">
        <p className="round-count">One word. Pick its vowel.</p>
        <h1 id="sound-question">Which short vowel do you hear?</h1>
        <button className="listen-orb" type="button" onClick={hear} aria-label="Hear the word"><SpeakerIcon /><span>Listen</span></button>
        <div className="vowel-choices">
          <button type="button" onClick={() => void answer("o")} disabled={busy || !!verdict} aria-label="Choose short o"><span className="marked-vowel">ŏ</span><b>short o</b></button>
          <button type="button" onClick={() => void answer("u")} disabled={busy || !!verdict} aria-label="Choose short u"><span className="marked-vowel">ŭ</span><b>short u</b></button>
        </div>
      </section>
      {verdict && <RoundResult verdict={verdict} onNext={next} />}
      <p className="grownup-tip">The words come in random order, so listen to the middle sound each time.</p>
    </main>
  </GameShell>;
}

