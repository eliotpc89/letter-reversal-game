import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SafeAreaTopScrim } from "./safe-area";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type ApiResponse, type Letter, type PracticeGameId, type TrophyId, type Vowel } from "./api";
import { CoinIcon } from "./icons";
import { ensureAudioContext } from "./kit/audio";
import { playJackpot, playWhomp } from "./kit/sfx";
import { TROPHIES } from "./platform/trophies";
import { TrophyCase } from "./platform/TrophyCase";
import { PrizeShop } from "./platform/PrizeShop";
import { GrownUpTransferPanel } from "./platform/DeviceTransfer";
import { GAMES, getGame } from "./games/registry";
import { useContent } from "./content/ContentContext";
import type { GameContext } from "./games/types";

type GameState = ApiResponse<typeof api, "getGameState">;

function MissedWordsReview({ state, onFocus, onReset, resetting }: { state: GameState | undefined; onFocus: () => void; onReset: () => void; resetting: boolean }) {
  const missed = [...(state?.wordStats ?? [])].filter((row) => row.misses > 0).sort((a, b) => b.misses - a.misses || a.word.localeCompare(b.word));
  return <section className="missed-review" aria-labelledby="missed-words-title">
    <div className="missed-review-topline"><div><h2 id="missed-words-title">Missed words</h2><p>{missed.length ? "Words that need another pass." : "Missed words will show up here as Miles plays."}</p></div><div className="missed-review-actions">{missed.length > 0 && <button type="button" onClick={onFocus}>Focus these</button>}<button type="button" onClick={onReset} disabled={missed.length === 0 || resetting}>{resetting ? "Resetting…" : "Reset missed words"}</button></div></div>
    {missed.length > 0 && <div className="missed-word-list">{missed.slice(0, 12).map((row) => <span key={row.word} className="missed-word-chip"><b>{row.word}</b><small>{row.vowel === "o" ? "ŏ" : "ŭ"} · {row.misses} miss{row.misses === 1 ? "" : "es"}</small></span>)}</div>}
  </section>;
}

function MissedNumbersReview({ state, onFocus, onReset, resetting }: { state: GameState | undefined; onFocus: () => void; onReset: () => void; resetting: boolean }) {
  const missed = [...(state?.mathStats ?? [])].filter((row) => row.misses > 0).sort((a, b) => b.misses - a.misses || a.problem.localeCompare(b.problem));
  return <section className="missed-review" aria-labelledby="missed-numbers-title">
    <div className="missed-review-topline"><div><h2 id="missed-numbers-title">Missed numbers</h2><p>{missed.length ? "Problems that need another pass." : "Missed math problems will show up here as Miles plays."}</p></div><div className="missed-review-actions">{missed.length > 0 && <button type="button" onClick={onFocus}>Focus these</button>}<button type="button" onClick={onReset} disabled={missed.length === 0 || resetting}>{resetting ? "Resetting…" : "Reset missed numbers"}</button></div></div>
    {missed.length > 0 && <div className="missed-word-list">{missed.slice(0, 12).map((row) => <span key={row.problem} className="missed-word-chip"><b>{row.problem}</b><small>{row.misses} miss{row.misses === 1 ? "" : "es"}</small></span>)}</div>}
  </section>;
}

function GameMenu({ state, onPlay, onOpenShop, onResetMissed, resettingMissed, onResetMissedNumbers, resettingMissedNumbers }: { state: GameState | undefined; onPlay: (id: string, focusMissed?: boolean) => void; onOpenShop: () => void; onResetMissed: () => void; resettingMissed: boolean; onResetMissedNumbers: () => void; resettingMissedNumbers: boolean }) {
  const { bank } = useContent();
  const hero = GAMES.find((game) => game.tile === "hero");
  const grid = GAMES.filter((game) => game.tile === "grid");
  const wide = GAMES.filter((game) => game.tile === "wide");
  return <>
    <header className="menu-tools">
      <span className="game-count">{GAMES.length} games</span>
      <button className="coin-purse" type="button" onClick={onOpenShop} aria-label={`${state?.coins ?? 10} coins, open prize shop`}>
        <CoinIcon /><strong>{state?.coins ?? 10}</strong><small>SHOP</small>
      </button>
    </header>
    <main className="menu-main">
      <section className="menu-intro" aria-labelledby="game-menu-title">
        <p>Ready to play?</p>
        <h1 id="game-menu-title">Pick a game</h1>
      </section>

      {hero && <button className={`game-tile ${hero.tileClass}`} type="button" onClick={() => onPlay(hero.id)} aria-label={hero.playLabel}>
        {hero.art}
        <span className="game-tile-copy">
          <span className="game-name">{hero.name}</span>
          <span className="game-pronunciation">{hero.tagline}</span>
          <span className="game-rule">{hero.rule}</span>
        </span>
        <span className="play-pill">Play <span aria-hidden="true">→</span></span>
      </button>}

      <section className="practice-grid" aria-label="Short o and u games">
        {grid.map((game) => {
          const stat = state && game.statLine ? game.statLine(state) : undefined;
          return <button className={`practice-tile ${game.tileClass}`} type="button" onClick={() => onPlay(game.id)} aria-label={game.playLabel} key={game.id}>
            <span className="practice-art" aria-hidden="true">{game.art}</span>
            <span className="practice-copy"><b>{game.name}</b><span>{game.note?.(bank)}</span>{stat && <small>{stat}</small>}</span>
            <span className="tile-arrow" aria-hidden="true">→</span>
          </button>;
        })}
      </section>

      {wide.map((game) => <button className={`game-tile ${game.tileClass}`} type="button" onClick={() => onPlay(game.id)} aria-label={game.playLabel} key={game.id}>
        <span className={game.artClass ?? "math-tile-art"} aria-hidden="true">{game.art}</span>
        <span className="game-tile-copy">
          <span className="game-name">{game.name}</span>
          <span className="game-pronunciation">{game.tagline}</span>
          <span className="game-rule">{game.rule}</span>
        </span>
        <span className="play-pill">Play <span aria-hidden="true">→</span></span>
      </button>)}

      <section className="coming-row" aria-labelledby="coming-title">
        <div><h2 id="coming-title">More games soon</h2><p>Every game uses the same coins and prizes.</p></div>
        <div className="empty-game-slots" aria-hidden="true"><span>+</span></div>
      </section>

      <MissedWordsReview state={state} onFocus={() => onPlay("sound-blaster", true)} onReset={onResetMissed} resetting={resettingMissed} />
      <MissedNumbersReview state={state} onFocus={() => onPlay("math-blasters", true)} onReset={onResetMissedNumbers} resetting={resettingMissedNumbers} />

      {state ? <TrophyCase owned={state.unlockedTrophies} onOpen={onOpenShop} /> : <div className="stats-loading">Loading your coins…</div>}
      {state ? <GrownUpTransferPanel state={state} /> : null}
    </main>
  </>;
}

export function App() {
  const queryClient = useQueryClient();
  const [view, setView] = useState("menu");
  const [confettiKey, setConfettiKey] = useState(0);
  const [shopOpen, setShopOpen] = useState(false);
  const [shopMessage, setShopMessage] = useState<string | null>(null);
  const [buyingTrophy, setBuyingTrophy] = useState<TrophyId | null>(null);
  const [importCode, setImportCode] = useState<string | null>(null);
  const [importError, setImportError] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [focusMissed, setFocusMissed] = useState(false);

  const startGame = useCallback((id: string, focus = false) => {
    setFocusMissed(focus);
    setView(id);
  }, []);

  const game = useQuery({ queryKey: ["game-state"], queryFn: () => api.getGameState({}) });
  const state = game.data;

  const celebrate = useCallback((correct: boolean) => {
    if (correct) { setConfettiKey((value) => value + 1); playJackpot(); }
    else playWhomp();
  }, []);

  const record = useMutation({
    mutationFn: (entry: { target: Letter; correct: boolean }) => api.recordAttempt(entry),
    onSuccess: (result, entry) => {
      queryClient.setQueryData(["game-state"], result.state);
      celebrate(entry.correct);
    },
  });

  const practice = useMutation({
    mutationFn: (entry: { gameId: PracticeGameId; correct: boolean; word?: { word: string; vowel: Vowel }; problem?: string }) => api.recordPracticeAttempt(entry),
    onSuccess: (result, entry) => {
      queryClient.setQueryData(["game-state"], result.state);
      // Math Blasters owns its laser/damage sounds and local mute toggle.
      if (entry.gameId === "math-blasters") {
        if (entry.correct) setConfettiKey((value) => value + 1);
      } else celebrate(entry.correct);
    },
  });

  const resetMissedWords = useMutation({
    mutationFn: () => api.resetMissedWords({}),
    onSuccess: (next) => queryClient.setQueryData(["game-state"], next),
  });

  const resetMissedNumbers = useMutation({
    mutationFn: () => api.resetMissedNumbers({}),
    onSuccess: (next) => queryClient.setQueryData(["game-state"], next),
  });

  const bonus = useMutation({
    mutationFn: (coins: number) => api.awardStreakBonus({ coins }),
    onSuccess: (result) => {
      queryClient.setQueryData(["game-state"], result.state);
      setConfettiKey((value) => value + 1);
      playJackpot();
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
        playJackpot();
      } else if (result.status === "not-enough-coins") setShopMessage("Keep playing to earn more coins!");
      else setShopMessage("That trophy is already in your case.");
    },
    onError: () => setShopMessage("That didn’t unlock. Try again."),
    onSettled: () => setBuyingTrophy(null),
  });

  const openShop = useCallback(() => { setShopMessage(null); setShopOpen(true); }, []);

  const savePractice = useCallback(async (gameId: string, correct: boolean, detail?: { word: string; vowel: Vowel } | { problem: string }) => {
    ensureAudioContext();
    const word = detail && "word" in detail ? { word: detail.word, vowel: detail.vowel } : undefined;
    const problem = detail && "problem" in detail ? detail.problem : undefined;
    await practice.mutateAsync({ gameId, correct, word, problem });
  }, [practice]);

  const recordLetter = useCallback(async (target: Letter, correct: boolean) => {
    ensureAudioContext();
    await record.mutateAsync({ target, correct });
  }, [record]);

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

  const confetti = useMemo(() => Array.from({ length: 34 }, (_, index) => ({
    id: `${confettiKey}-${index}`,
    left: `${(index * 37) % 100}%`,
    delay: `${(index % 7) * 0.06}s`,
    drift: `${((index * 19) % 70) - 35}px`,
    color: ["#ffc928", "#e64b3c", "#2f9e68", "#2a75bb"][index % 4] ?? "#ffc928",
  })), [confettiKey]);

  const gameDef = view === "menu" ? undefined : getGame(view);
  const ctx: GameContext | null = state && gameDef ? {
    state,
    coins: state.coins,
    onBack: () => setView("menu"),
    onOpenShop: openShop,
    onRecord: (correct, detail) => savePractice(gameDef.id, correct, detail),
    awardBonus: (coins) => bonus.mutateAsync(coins).then(() => undefined),
    recordLetter,
    onReset: () => reset.mutate(),
    resetting: reset.isPending,
    focusMissed,
  } : null;

  return <div className="game-shell">
    <SafeAreaTopScrim backgroundColor="var(--bg)" />
    {importCode && <div className="import-banner" role="alertdialog" aria-label="Import progress">
      <div><strong>Coins + trophies link opened.</strong><span>Import these coins and trophies? Other history on this device will stay.</span></div>
      <div className="import-actions"><button type="button" onClick={() => void doImport()}>Import</button><button type="button" onClick={() => setImportCode(null)}>Not now</button></div>
    </div>}
    {importDone && <p className="import-note" role="status">Coins and trophies imported! <button type="button" onClick={() => setImportDone(false)}>OK</button></p>}
    {importError && <p className="import-note" role="alert">That progress link didn't work. <button type="button" onClick={() => setImportError(false)}>OK</button></p>}
    {confettiKey > 0 && <div className="confetti-layer" key={confettiKey} aria-hidden="true">{confetti.map((piece) => <i key={piece.id} style={{ left: piece.left, animationDelay: piece.delay, translate: piece.drift, background: piece.color }} />)}</div>}

    {view === "menu" && <GameMenu
      state={state}
      onPlay={startGame}
      onOpenShop={openShop}
      onResetMissed={() => resetMissedWords.mutate()}
      resettingMissed={resetMissedWords.isPending}
      onResetMissedNumbers={() => resetMissedNumbers.mutate()}
      resettingMissedNumbers={resetMissedNumbers.isPending}
    />}

    {gameDef && (ctx
      ? gameDef.render(ctx)
      : <div className="stats-loading page-loading">{game.isError ? "Progress couldn’t load yet." : "Loading your coins…"}</div>)}

    {view !== "menu" && !gameDef && <div className="stats-loading page-loading">That game isn’t here anymore.</div>}

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
