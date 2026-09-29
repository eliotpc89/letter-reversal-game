import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadContent, getFallbackBundle, type ContentBundle } from "./loader";
import { buildBonusWords, buildTrickWordPacks, buildWordBank, type BonusWord, type TrickWordPack, type WordBank } from "./word-bank";
import type { MathBlasterPack, OddOneOutPack } from "./packs";

/** Everything a game needs from content: derived word lists plus the odd-one-out rounds. */
export type ArcadeContent = {
  bundle: ContentBundle;
  bank: WordBank;
  oddOneOut: OddOneOutPack;
  trickPacks: TrickWordPack[];
  bonusWords: BonusWord[];
  mathBlaster: MathBlasterPack;
};

const ContentContext = createContext<ArcadeContent | null>(null);

export function ContentProvider({ children }: { children: ReactNode }) {
  // Start on the bundled copy so games render instantly; upgrade to live
  // content when the fetch lands. A content update never unmounts a game.
  const [bundle, setBundle] = useState<ContentBundle>(getFallbackBundle);
  useEffect(() => {
    let live = true;
    void loadContent().then((next) => { if (live) setBundle(next); });
    return () => { live = false; };
  }, []);
  const value = useMemo<ArcadeContent>(() => ({
    bundle,
    bank: buildWordBank(bundle.packs["phonics-core"]),
    oddOneOut: bundle.packs["odd-one-out"],
    trickPacks: buildTrickWordPacks(bundle.packs["trick-words"]),
    bonusWords: buildBonusWords(bundle.packs["bonus-words"]),
    mathBlaster: bundle.packs["math-blaster"],
  }), [bundle]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

/** Word lists and content packs. Throws if called outside ContentProvider. */
export function useContent(): ArcadeContent {
  const content = useContext(ContentContext);
  if (!content) throw new Error("useContent must be used inside ContentProvider");
  return content;
}

/** Derived word lists (short-o/short-u words, pairs, audio) — the word-bank API. */
export function useWordBank(): WordBank {
  return useContent().bank;
}
