// Canonical game ids. This module is a leaf (no imports) so both the
// persistence layer (api.ts) and the component registry (registry.tsx) can
// depend on it without creating an import cycle.
//
// Adding a game: append its id here AND add its entry to GAMES in
// registry.tsx. The registry throws at load time if the two disagree.

export const GAME_IDS: string[] = [
  "bed",
  "sound-sort",
  "pair-picker",
  "write-it",
  "odd-one-out",
  "math-blasters",
];

/** Game ids that earn practice stats (everything but the bed drawing game). */
export const PRACTICE_GAME_IDS: string[] = GAME_IDS.filter((id) => id !== "bed");
