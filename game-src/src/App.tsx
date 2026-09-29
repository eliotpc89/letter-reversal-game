import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "./safe-area";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { api, encodeSave, type ApiResponse } from "./api";
import { classifyDrawing, isConfidentMatch, LETTERS, type Letter } from "./draw-classifier";
import { CoinIcon, GamesIcon, SpeakerIcon, TrophyIcon, type TrophyId } from "./icons";
import { useAudioClip } from "./kit/useAudioClip";
import { playJackpot, playWhomp } from "./kit/sfx";
import bSound from "./assets/letters/b.mp3";
import dSound from "./assets/letters/d.mp3";
import pSound from "./assets/letters/p.mp3";
import qSound from "./assets/letters/q.mp3";
import nSound from "./assets/letters/n.mp3";
import uSound from "./assets/letters/u.mp3";
import cSound from "./assets/letters/c.mp3";
import kSound from "./assets/letters/k.mp3";
import { VOWEL_AUDIO } from "./assets/vowels";
import { MathBlasters } from "./MathBlasters";

type GameState = ApiResponse<typeof api, "getGameState">;
type Verdict = "correct" | "wrong" | "retry" | null;
type View = "menu" | "bed" | "sound-sort" | "pair-picker" | "write-it" | "math-blasters";
type PracticeGameId = "sound-sort" | "pair-picker" | "write-it" | "math-blasters";
type Vowel = "o" | "u";
type PracticeWord = { word: string; vowel: Vowel; vowelIndex: number; audio: string };

type Trophy = { id: TrophyId; name: string; price: number; color: string };
const TROPHIES: Trophy[] = [
  { id: "star", name: "Power Star", price: 15, color: "#ffc928" },
  { id: "one-up", name: "1-Up Mushroom", price: 30, color: "#2f9e68" },
  { id: "fire-flower", name: "Fire Flower", price: 50, color: "#e64b3c" },
  { id: "tanooki-suit", name: "Tanooki Suit", price: 75, color: "#a76635" },
  { id: "green-pipe", name: "Green Pipe", price: 100, color: "#1f9c55" },
  { id: "gold-crown", name: "Golden Crown", price: 150, color: "#f0ad00" },
  { id: "master-sword", name: "Master Sword", price: 200, color: "#7fb2e5" },
  { id: "hylian-shield", name: "Hylian Shield", price: 250, color: "#e8b93c" },
  { id: "heros-cap", name: "Hero's Cap", price: 300, color: "#2f9e68" },
  { id: "star-rod", name: "Star Rod", price: 350, color: "#ffd94d" },
  { id: "cappy", name: "Cappy", price: 400, color: "#e64b3c" },
  { id: "yoshi", name: "Yoshi", price: 450, color: "#46bc73" },
  { id: "poke-ball", name: "Pok\u00e9 Ball", price: 500, color: "#e64b3c" },
  { id: "blue-shell", name: "Blue Shell", price: 600, color: "#2a75bb" },
  { id: "triforce", name: "Triforce", price: 750, color: "#f0c020" },
  { id: "x-wing", name: "X-Wing", price: 900, color: "#b9c4d1" },
  { id: "poop-emoji", name: "Poop Emoji", price: 1200, color: "#9a6a3b" },
  { id: "starfox-laser", name: "Star Fox Laser", price: 9999, color: "#8fa3b8" },
];

const SOUNDS: Record<Letter, string> = { b: bSound, d: dSound, p: pSound, q: qSound, n: nSound, u: uSound, c: cSound, k: kSound };
const SHORT_O_WORDS = [
  "cot", "cop", "cob", "cod", "bog", "dog", "hog", "lock", "dock", "sock", "mock", "pop",
  "not", "rot", "shot", "fond", "hot", "hop", "pot", "top", "mop", "rock", "box", "fox",
  "dot", "log", "rod", "pond", "drop", "shop", "stop", "clock", "block", "flock", "shock", "stock", "trot", "stomp", "chomp",
] as const;
const SHORT_U_WORDS = [
  "cut", "cup", "cub", "cud", "bug", "dug", "hug", "luck", "duck", "suck", "muck", "pup",
  "nut", "rut", "shut", "fund", "hut", "hum", "hub", "pug", "puck", "tub", "tug", "tuck",
  "mug", "stuck", "truck", "cluck", "buck", "bus", "bud", "run", "rug", "rub", "sun",
  "fun", "gun", "drum", "plum", "plug", "club", "scrub", "slug", "blush", "brush", "crush", "trust", "trunk", "up",
] as const;
const PRACTICE_WORDS: PracticeWord[] = [
  ...SHORT_O_WORDS.map((word) => ({ word, vowel: "o" as const, vowelIndex: word.indexOf("o"), audio: VOWEL_AUDIO[word] })),
  ...SHORT_U_WORDS.map((word) => ({ word, vowel: "u" as const, vowelIndex: word.indexOf("u"), audio: VOWEL_AUDIO[word] })),
];
// "up" has no middle vowel, so it doesn't fit sound-sort's "which vowel is in
// the middle?" prompt. It stays in the other games' pools.
const SOUND_SORT_WORDS = PRACTICE_WORDS.filter((item) => item.word !== "up");
const WRITE_WORDS = PRACTICE_WORDS.filter((item) => item.word.length <= 4);
const WORD_AUDIO = new Map(PRACTICE_WORDS.map((item) => [item.word, item.audio]));
const PAIRS = [
  ["cot", "cut"], ["cop", "cup"], ["cob", "cub"], ["cod", "cud"], ["bog", "bug"],
  ["dog", "dug"], ["hog", "hug"], ["lock", "luck"], ["dock", "duck"], ["sock", "suck"],
  ["mock", "muck"], ["pop", "pup"], ["not", "nut"], ["rot", "rut"], ["shot", "shut"], ["fond", "fund"],
] as const;
const DEFAULT_PAIR: readonly [string, string] = ["cot", "cut"];
const DEFAULT_WORD: PracticeWord = { word: "cot", vowel: "o", vowelIndex: 1, audio: VOWEL_AUDIO.cot };

function shuffled<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

function practiceStat(state: GameState | undefined, gameId: PracticeGameId) {
  return state?.practiceStats.find((item) => item.gameId === gameId);
}

function pickLetter(previous?: Letter): Letter {
  const choices = previous ? LETTERS.filter((letter) => letter !== previous) : LETTERS;
  return choices[Math.floor(Math.random() * choices.length)] ?? "b";
}

function drawingContext(canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null {
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#14213d";
  ctx.fillStyle = "#14213d";
  ctx.lineWidth = 28;
  return ctx;
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx?.clearRect(0, 0, canvas.width, canvas.height);
}


function TrophyCase({ owned, onOpen }: { owned: TrophyId[]; onOpen: () => void }) {
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

function PrizeShop({ state, open, onClose, onBuy, buying, message }: { state: GameState; open: boolean; onClose: () => void; onBuy: (id: TrophyId) => void; buying: TrophyId | null; message: string | null }) {
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

function GameMenu({ state, onPlay, onOpenShop }: { state: GameState | undefined; onPlay: (view: View) => void; onOpenShop: () => void }) {
  const games: Array<{ view: View; label: string; title: string; note: string; art: string; className: string }> = [
    { view: "sound-sort", label: "Play O or U", title: "o or u?", note: `${SOUND_SORT_WORDS.length} short-vowel words in the mix.`, art: "ŏ  ŭ", className: "vowel-tile" },
    { view: "pair-picker", label: "Play Pair Picker", title: "Pair picker", note: "Listen closely, then sort the word.", art: "cot · cut", className: "pair-tile" },
    { view: "write-it", label: "Play Write It", title: "Write it", note: "Build the word and mark the vowel.", art: "mŭck", className: "write-tile" },
  ];
  return <>
    <header className="menu-tools">
      <span className="game-count">5 games</span>
      <button className="coin-purse" type="button" onClick={onOpenShop} aria-label={`${state?.coins ?? 10} coins, open prize shop`}>
        <CoinIcon /><strong>{state?.coins ?? 10}</strong><small>SHOP</small>
      </button>
    </header>
    <main className="menu-main">
      <section className="menu-intro" aria-labelledby="game-menu-title">
        <p>Ready to play?</p>
        <h1 id="game-menu-title">Pick a game</h1>
      </section>

      <button className="game-tile bed-game-tile" type="button" onClick={() => onPlay("bed")} aria-label="Play the b d game, bed">
        <span className="bed-word" aria-hidden="true"><b>b</b><i>__</i><b>d</b></span>
        <span className="game-tile-copy">
          <span className="game-name">b__d</span>
          <span className="game-pronunciation">Say it like “bed”</span>
          <span className="game-rule"><b>b</b> sound at the beginning, <b>d</b> at the end.</span>
        </span>
        <span className="play-pill">Play <span aria-hidden="true">→</span></span>
      </button>

      <section className="practice-grid" aria-label="Short o and u games">
        {games.map((game) => {
          const stat = game.view === "menu" || game.view === "bed" ? undefined : practiceStat(state, game.view);
          return <button className={`practice-tile ${game.className}`} type="button" onClick={() => onPlay(game.view)} aria-label={game.label} key={game.view}>
            <span className="practice-art" aria-hidden="true">{game.art}</span>
            <span className="practice-copy"><b>{game.title}</b><span>{game.note}</span>{stat && stat.attempts > 0 && <small>{stat.correct}/{stat.attempts} right</small>}</span>
            <span className="tile-arrow" aria-hidden="true">→</span>
          </button>;
        })}
      </section>

      <button className="game-tile math-game-tile" type="button" onClick={() => onPlay("math-blasters")} aria-label="Play Math Blasters">
        <span className="math-tile-art" aria-hidden="true">✦ 3 + 2 ✦</span>
        <span className="game-tile-copy">
          <span className="game-name">Math Blasters</span>
          <span className="game-pronunciation">Blast the answer!</span>
          <span className="game-rule">Click the falling number before it reaches your ship.</span>
        </span>
        <span className="play-pill">Play <span aria-hidden="true">→</span></span>
      </button>

      <section className="coming-row" aria-labelledby="coming-title">
        <div><h2 id="coming-title">More games soon</h2><p>Every game uses the same coins and prizes.</p></div>
        <div className="empty-game-slots" aria-hidden="true"><span>+</span></div>
      </section>

      {state ? <TrophyCase owned={state.unlockedTrophies} onOpen={onOpenShop} /> : <div className="stats-loading">Loading your coins…</div>}
    </main>
  </>;
}

function PracticeHeader({ title, coins, onBack, onOpenShop }: { title: string; coins: number; onBack: () => void; onOpenShop: () => void }) {
  return <header className="practice-header">
    <button className="back-button" type="button" onClick={onBack} aria-label="Back to game menu">←</button>
    <div><span>Short o + u</span><strong>{title}</strong></div>
    <button className="coin-purse small-purse" type="button" onClick={onOpenShop} aria-label={`${coins} coins, open prize shop`}><CoinIcon /><strong>{coins}</strong></button>
  </header>;
}

function RoundResult({ verdict, onNext, wrongMessage = "Listen once more next round." }: { verdict: Exclude<Verdict, null>; onNext: () => void; wrongMessage?: string }) {
  return <div className={`round-result ${verdict}`} role="status">
    <div><strong>{verdict === "correct" ? "You got it!" : "Good try!"}</strong><span>{verdict === "correct" ? "+3 coins" : wrongMessage}</span></div>
    <button type="button" onClick={onNext}>Next <span aria-hidden="true">→</span></button>
  </div>;
}

function SoundSortGame({ state, onBack, onOpenShop, onRecord }: { state: GameState; onBack: () => void; onOpenShop: () => void; onRecord: (gameId: PracticeGameId, correct: boolean) => Promise<void> }) {
  const play = useAudioClip();
  const [target, setTarget] = useState<PracticeWord>(() => SOUND_SORT_WORDS[Math.floor(Math.random() * SOUND_SORT_WORDS.length)] ?? DEFAULT_WORD);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [busy, setBusy] = useState(false);
  const hear = () => void play(target.audio).catch(() => undefined);
  const answer = async (choice: Vowel) => {
    if (busy || verdict) return;
    setBusy(true);
    const right = choice === target.vowel;
    try { await onRecord("sound-sort", right); setVerdict(right ? "correct" : "wrong"); } finally { setBusy(false); }
  };
  const next = () => {
    setTarget((old) => shuffled(SOUND_SORT_WORDS.filter((item) => item.word !== old.word))[0] ?? DEFAULT_WORD);
    setVerdict(null);
  };
  return <>
    <PracticeHeader title="o or u?" coins={state.coins} onBack={onBack} onOpenShop={onOpenShop} />
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
  </>;
}

function PairPickerGame({ state, onBack, onOpenShop, onRecord }: { state: GameState; onBack: () => void; onOpenShop: () => void; onRecord: (gameId: PracticeGameId, correct: boolean) => Promise<void> }) {
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
    try { await onRecord("pair-picker", right); setVerdict(right ? "correct" : "wrong"); } finally { setBusy(false); }
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
  return <>
    <PracticeHeader title="Pair picker" coins={state.coins} onBack={onBack} onOpenShop={onOpenShop} />
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
  </>;
}

function WriteItGame({ state, onBack, onOpenShop, onRecord }: { state: GameState; onBack: () => void; onOpenShop: () => void; onRecord: (gameId: PracticeGameId, correct: boolean) => Promise<void> }) {
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
    try { await onRecord("write-it", right); setVerdict(right ? "correct" : "wrong"); } finally { setBusy(false); }
  };
  const next = () => setTarget((old) => shuffled(WRITE_WORDS.filter((item) => item.word !== old.word))[0] ?? DEFAULT_WORD);
  return <>
    <PracticeHeader title="Write it" coins={state.coins} onBack={onBack} onOpenShop={onOpenShop} />
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
  </>;
}

function Scoreboard({ state, onReset, resetting }: { state: GameState; onReset: () => void; resetting: boolean }) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const shareProgress = async () => {
    setSharing(true);
    setShareNote(null);
    try {
      const link = `${window.location.origin}${window.location.pathname}#save=${encodeSave(state)}`;
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Letter Reversal progress", url: link });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(link);
        setShareNote("Progress link copied — open it on the iPad to import.");
      } else {
        setShareNote("Sharing isn't available in this browser.");
      }
    } catch {
      // The share sheet was dismissed; nothing to report.
    } finally {
      setSharing(false);
    }
  };
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
      <button className="reset-link" type="button" onClick={() => void shareProgress()} disabled={sharing}>{sharing ? "Preparing link…" : "Share progress to another device…"}</button>
      {shareNote && <p className="share-note" role="status">{shareNote}</p>}
    </div>}
  </section>;
}

export function App() {
  const queryClient = useQueryClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const fallbackAudioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceBuffersRef = useRef<Partial<Record<Letter, AudioBuffer>>>({});
  const [view, setView] = useState<View>("menu");
  const [target, setTarget] = useState<Letter>(() => pickLetter());
  const [hasInk, setHasInk] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [heard, setHeard] = useState(false);
  const [audioProblem, setAudioProblem] = useState(false);
  const [confettiKey, setConfettiKey] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopMessage, setShopMessage] = useState<string | null>(null);
  const [buyingTrophy, setBuyingTrophy] = useState<TrophyId | null>(null);
  const [importCode, setImportCode] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);
  const [importDone, setImportDone] = useState(false);

  const game = useQuery({ queryKey: ["game-state"], queryFn: () => api.getGameState({}) });
  const state = game.data;

  const activateAudio = useCallback((): AudioContext | null => {
    const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = audioContextRef.current ?? new AudioCtx();
    audioContextRef.current = ctx;
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  }, []);

  const record = useMutation({
    mutationFn: (correct: boolean) => api.recordAttempt({ target, correct }),
    onSuccess: (result, correct) => {
      queryClient.setQueryData(["game-state"], result.state);
      setVerdict(correct ? "correct" : "wrong");
      if (correct) { setConfettiKey((value) => value + 1); playJackpot(audioContextRef.current); }
      else playWhomp(audioContextRef.current);
    },
  });

  const practice = useMutation({
    mutationFn: (entry: { gameId: PracticeGameId; correct: boolean }) => api.recordPracticeAttempt(entry),
    onSuccess: (result, entry) => {
      queryClient.setQueryData(["game-state"], result.state);
      if (entry.correct) { setConfettiKey((value) => value + 1); playJackpot(audioContextRef.current); }
      else playWhomp(audioContextRef.current);
    },
  });

  const reset = useMutation({
    mutationFn: () => api.resetProgress({ confirm: true }),
    onSuccess: (next) => queryClient.setQueryData(["game-state"], next),
  });

  const unlock = useMutation({
    mutationFn: (trophyId: TrophyId) => api.unlockTrophy({ trophyId }),
    onMutate: (trophyId) => { setBuyingTrophy(trophyId); setShopMessage(null); },
    onSuccess: (result, trophyId) => {
      queryClient.setQueryData(["game-state"], result.state);
      const trophy = TROPHIES.find((item) => item.id === trophyId);
      if (result.status === "unlocked") {
        setShopMessage(`${trophy?.name ?? "Trophy"} unlocked!`);
        setConfettiKey((value) => value + 1);
        playJackpot(audioContextRef.current);
      } else if (result.status === "not-enough-coins") setShopMessage("Keep playing to earn more coins!");
      else setShopMessage("That trophy is already in your case.");
    },
    onError: () => setShopMessage("That didn’t unlock. Try again."),
    onSettled: () => setBuyingTrophy(null),
  });

  const clear = useCallback(() => {
    clearCanvas(canvasRef.current);
    setHasInk(false);
    setVerdict(null);
  }, []);

  const nextRound = useCallback(() => {
    setTarget((old) => pickLetter(old));
    setHeard(false);
    clearCanvas(canvasRef.current);
    setHasInk(false);
    setVerdict(null);
  }, []);

  const playLetter = useCallback(async () => {
    setAudioProblem(false);
    const ctx = activateAudio();

    if (ctx) {
      try {
        await ctx.resume();
        let buffer = voiceBuffersRef.current[target];
        if (!buffer) {
          const response = await fetch(SOUNDS[target]);
          if (!response.ok) throw new Error("Letter audio could not be loaded");
          buffer = await ctx.decodeAudioData(await response.arrayBuffer());
          voiceBuffersRef.current[target] = buffer;
        }
        voiceSourceRef.current?.stop();
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();
        gain.gain.value = 1.6;
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 6;
        source.buffer = buffer;
        source.connect(gain).connect(compressor).connect(ctx.destination);
        source.start();
        voiceSourceRef.current = source;
        setHeard(true);
        return;
      } catch {
        // Fall through to the attached audio element for browsers without MP3 decoding in Web Audio.
      }
    }

    const audio = fallbackAudioRef.current;
    if (audio) {
      try {
        audio.pause();
        audio.currentTime = 0;
        audio.volume = 1;
        await audio.play();
        setHeard(true);
        return;
      } catch {
        // The final speech fallback is useful in restrictive embedded browsers.
      }
    }

    if ("speechSynthesis" in window) {
      const names: Record<Letter, string> = { b: "bee", d: "dee", p: "pee", q: "cue", n: "en", u: "you", c: "cee", k: "kay" };
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(names[target]);
      utterance.rate = 0.78;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
      setHeard(true);
      return;
    }

    setAudioProblem(true);
  }, [activateAudio, target]);

  useEffect(() => {
    if (view === "bed") drawingContext(canvasRef.current);
  }, [view]);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith("#save=")) {
      setImportCode(hash.slice("#save=".length));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, []);

  const doImport = async () => {
    if (!importCode) return;
    const result = await api.importSave({ code: importCode });
    setImportCode(null);
    if (result.ok) {
      queryClient.setQueryData(["game-state"], result.state);
      setImportDone(true);
    } else {
      setImportError(true);
    }
  };

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  };

  const beginDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (verdict || record.isPending) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    if (!point) return;
    drawingRef.current = true;
    lastPointRef.current = point;
    const ctx = drawingContext(canvasRef.current);
    if (ctx) { ctx.beginPath(); ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
    setHasInk(true);
  };

  const moveDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || verdict || record.isPending) return;
    const point = pointFromEvent(event);
    const last = lastPointRef.current;
    const ctx = drawingContext(canvasRef.current);
    if (!point || !last || !ctx) return;
    ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(point.x, point.y); ctx.stroke();
    lastPointRef.current = point;
  };

  const endDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const check = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk || verdict || record.isPending) return;
    activateAudio();
    const match = classifyDrawing(canvas);
    if (!match || !isConfidentMatch(match.score)) {
      setVerdict("retry"); // too far from every template: redraw, no coins change
      return;
    }
    record.mutate(match.letter === target);
  };

  const savePractice = useCallback(async (gameId: PracticeGameId, correct: boolean) => {
    activateAudio();
    await practice.mutateAsync({ gameId, correct });
  }, [activateAudio, practice]);

  const confetti = useMemo(() => Array.from({ length: 34 }, (_, index) => ({
    id: `${confettiKey}-${index}`,
    left: `${(index * 37) % 100}%`,
    delay: `${(index % 7) * 0.06}s`,
    drift: `${((index * 19) % 70) - 35}px`,
    color: ["#ffc928", "#e64b3c", "#2f9e68", "#2a75bb"][index % 4] ?? "#ffc928",
  })), [confettiKey]);

  return <div className="game-shell">
    <SafeAreaTopScrim backgroundColor="var(--bg)" />
    {importCode && <div className="import-banner" role="alertdialog" aria-label="Import progress">
      <div><strong>Progress link opened.</strong><span>Import coins, trophies, and scores from your other device? This replaces this device's progress.</span></div>
      <div className="import-actions"><button type="button" onClick={() => void doImport()}>Import</button><button type="button" onClick={() => setImportCode(null)}>Not now</button></div>
    </div>}
    {importDone && <p className="import-note" role="status">Progress imported! <button type="button" onClick={() => setImportDone(false)}>OK</button></p>}
    {importError && <p className="import-note" role="alert">That progress link didn't work. <button type="button" onClick={() => setImportError(false)}>OK</button></p>}
    {confettiKey > 0 && <div className="confetti-layer" key={confettiKey} aria-hidden="true">{confetti.map((piece) => <i key={piece.id} style={{ left: piece.left, animationDelay: piece.delay, translate: piece.drift, background: piece.color }} />)}</div>}

    {view === "menu" && <GameMenu
      state={state}
      onPlay={setView}
      onOpenShop={() => { setShopMessage(null); setShopOpen(true); }}
    />}

    {view === "sound-sort" && state && <SoundSortGame state={state} onBack={() => setView("menu")} onOpenShop={() => { setShopMessage(null); setShopOpen(true); }} onRecord={savePractice} />}
    {view === "pair-picker" && state && <PairPickerGame state={state} onBack={() => setView("menu")} onOpenShop={() => { setShopMessage(null); setShopOpen(true); }} onRecord={savePractice} />}
    {view === "write-it" && state && <WriteItGame state={state} onBack={() => setView("menu")} onOpenShop={() => { setShopMessage(null); setShopOpen(true); }} onRecord={savePractice} />}
    {view === "math-blasters" && state && <MathBlasters coins={state.coins} onBack={() => setView("menu")} onOpenShop={() => { setShopMessage(null); setShopOpen(true); }} onRecord={(correct) => savePractice("math-blasters", correct)} />}
    {view !== "menu" && view !== "bed" && !state && <div className="stats-loading page-loading">{game.isError ? "Progress couldn’t load yet." : "Loading your coins…"}</div>}

    {view === "bed" && <>
      <header className="play-header">
        <button className="games-button" type="button" onClick={() => setView("menu")} aria-label="Back to game menu"><GamesIcon /></button>
        <button className={`sound-button ${heard ? "heard" : ""}`} type="button" onClick={() => void playLetter()} aria-label="Play the letter name">
          <SpeakerIcon />
          <span>{heard ? "Hear it again" : "Tap to hear"}</span>
        </button>
        <button className="coin-purse" type="button" onClick={() => { setShopMessage(null); setShopOpen(true); }} aria-label={`${state?.coins ?? 10} coins, open prize shop`}><CoinIcon /><strong>{state?.coins ?? 10}</strong><small>SHOP</small></button>
        <audio ref={fallbackAudioRef} src={SOUNDS[target]} preload="auto" />
      </header>

      <main className="game-main">
        {audioProblem && <p className="audio-note" role="alert">Sound is blocked. Turn up the phone volume, then tap the red button again.</p>}
        <div className="instruction"><span className="step-dot">1</span><span>Listen</span><span className="step-line"/><span className="step-dot">2</span><span>Draw it</span></div>

        <section className={`draw-stage ${verdict ?? ""}`} aria-label="Letter drawing area">
          <canvas ref={canvasRef} width={700} height={590} className="drawing-canvas" aria-label="Drawing pad" onPointerDown={beginDraw} onPointerMove={moveDraw} onPointerUp={endDraw} onPointerCancel={endDraw} />
          {!hasInk && <div className="draw-hint" aria-hidden="true"><span>Draw here</span><span className="finger-trail">⌁</span></div>}
          {verdict && <div className={`verdict ${verdict}`} role="status">
            {verdict === "correct" ? <><div className="burst"><CoinIcon /><CoinIcon /><CoinIcon /></div><strong>JACKPOT!</strong><span>+5 coins</span></> :
              verdict === "wrong" ? <><strong>WHOMP WHOMP</strong><span>−3 coins</span></> :
              <><strong>Hmm, try again!</strong><span>That doesn&apos;t look like a letter yet. No coins lost.</span></>}
          </div>}
          <button className="clear-button" type="button" onClick={clear} disabled={!hasInk || !!verdict || record.isPending} aria-label="Clear drawing">Clear</button>
        </section>

        {record.isError && <p className="error-note" role="alert">That round didn’t save. Tap “Check it!” to try again.</p>}
        {!verdict ? <button className="check-button" type="button" onClick={check} disabled={!hasInk || record.isPending}>{record.isPending ? "Checking…" : "Check it!"}</button> :
          verdict === "retry" ? <button className="next-button" type="button" onClick={clear}>Try again <span aria-hidden="true">→</span></button> :
          <button className="next-button" type="button" onClick={nextRound}>Next letter <span aria-hidden="true">→</span></button>}
        {state ? <><TrophyCase owned={state.unlockedTrophies} onOpen={() => { setShopMessage(null); setShopOpen(true); }} /><Scoreboard state={state} onReset={() => reset.mutate()} resetting={reset.isPending} /></> : <div className="stats-loading">{game.isError ? "Progress couldn’t load yet." : "Loading your coins…"}</div>}
      </main>
    </>}

    {state && <PrizeShop
      state={state}
      open={shopOpen}
      onClose={() => setShopOpen(false)}
      onBuy={(trophyId) => unlock.mutate(trophyId)}
      buying={buyingTrophy}
      message={shopMessage}
    />}
  </div>;
}
