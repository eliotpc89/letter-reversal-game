# AGENTS.md — letter-reversal-game

## Audio generation: BATCH it, never one clip per TTS call

**Rule (Eliot, Nov 17 2026): spoken math facts and word clips are generated in
batches — one TTS call for the whole batch, split deterministically — never one
TTS call per clip.**

Why: one-call-per-clip (the old `generate_openai_audio.py` path for facts) gives
every clip a cold start. The Nov 17 2026 subtraction batch proved it: durations
scattered 0.57–1.45 s, inconsistent pace and emphasis, and every clip carries its
own phrase-initial onset and phrase-final mouth-reset artifacts. A batch take is
one warm performance: the Nov 17 test batch of 8 landed at 1.98–2.21 s per fact,
peaks −5 to −9 dB, clean tails throughout.

### The sandwich pattern

Speak the batch as ONE list, every item sandwiched by the separator word
**Click** (Eliot's separator; substitute only if a take proves it unspeakable):

```
Click. <fact 1>. Click. <fact 2>. Click. … <fact N>. Click. <fact 1 again>.
```

- The separators are sacrificial: they absorb the cold-start onset and the
  phrase-final mouth reset that ruined single clips (see box/fox, Sep 2026),
  and they are thrown away in the split.
- **The list ends with a sacrificial duplicate of fact 1 — not a trailing
  Click.** `gpt-4o-mini-tts` will not speak a trailing separator: `Click.`,
  `Click. Click.`, and even `Click. Banana.` after the last fact were all
  silently dropped (3 test takes, Nov 17 2026). It *will* speak a trailing
  repeated fact. The duplicate is discarded; its phrase-final artifacts go
  with it.
- Instructions to the model: read the list exactly as written, say every item
  including the repeated fact at the end, same emphasis every time, pause
  distinctly after each separator and each fact, add nothing.

### The split (deterministic for a fixed take)

Implemented in `scripts/generate_batch_audio.py`. Do not hand-split.

1. Decode to 16 kHz mono; 10 ms peak envelope; silence = below −45 dB for
   ≥ 150 ms.
2. Do **not** trust raw segment count: a fact can split at a mid-fact pause.
   Classify separators instead — a separator segment is **short (≤ 0.55 s;
   facts run 1.1–2.3 s)** with a real pause (≥ 0.28 s) on at least one side.
   Facts are the spans *between* separators, merging any sub-segments.
3. Require exactly N+1 separators for N facts, the first segment a separator,
   and at least one segment after the last separator (the sacrificial
   duplicate). **Any mismatch fails the take — never guess, never hand-align.**
   Regenerate the take instead.
4. Cut each fact with a 70 ms head / 100 ms tail pad, clamped so cuts never
   reach into a separator (≥ 50 ms clear). **Loudnorm only**
   (`loudnorm=I=-20:TP=-2:LRA=7`) — no `silenceremove` on cut segments; it
   ate valid audio in the Sep 2026 box/fox work.
5. Validate every clip: duration 0.4–2.6 s, peak > −30 dB, final-20 ms
   tail < −25 dB. A batch where the facts' durations scatter wildly
   (e.g. one at 2× the median) is suspect — flag it, don't ship it.

### Shipping gate

- Ear-check a sample in chat before committing a batch (same
  render-before-push rule as visuals). Static checks do not verify the
  spoken words are correct.
- Bump `AUDIO_CACHE_BUST` whenever clips are re-recorded — devices fetch
  audio with `cache: "force-cache"` and will otherwise keep playing the
  old takes.
- Write clips to BOTH `game-src/public/content/audio/…` and the built
  `docs/content/audio/…` (or rebuild), and verify the mirrors match.

### Status: EAR-APPROVED (Eliot, Nov 17 2026 — "All sound perfect")

Work in batches of ~7–8 facts per TTS call. That size was tested first
(batch of 8), ear-approved, and only then used for the full run.

### Reference runs (Nov 17 2026)

Test batch of 8 subtraction facts (12−9 … 5−5), voice `marin`,
`gpt-4o-mini-tts`: take 5 accepted — 19 raw segments (9 separators,
one fact split mid-pause and merged, sacrificial duplicate present),
8/8 clips passed static checks, durations 1.98–2.21 s. Eliot ear-checked
all 8 in chat: perfect.

Full run the same night: the remaining 50 subtraction facts in 7 batches
of 7 + 1 single. One batch's first take failed the split (14 segments)
and was regenerated — the fail-the-take gate working as designed.
49/50 passed static checks outright; the one flag, 8−8=0 at 2.66 s, was
just over the 2.6 s duration cap with a clean peak/tail — the cap is a
flag to listen, not a defect. All 58 facts (test 8 + rest 50) re-recorded
this way, durations ~1.9–2.6 s vs the old single-call batch's 0.57–1.45 s.
