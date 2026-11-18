#!/usr/bin/env python3
"""Batch-generate spoken math facts: CLICK-sandwich + deterministic split.

THE RULE (see AGENTS.md): never one TTS call per clip. One call speaks

    Click. <fact 1>. Click. <fact 2>. Click. ... <fact N>. Click. <fact 1 again>.

and this script splits the take deterministically. The trailing repeat of
fact 1 is sacrificial (gpt-4o-mini-tts silently drops a trailing separator;
it will speak a trailing fact). It is discarded.

Usage:
    OPENAI_API_KEY=... python3 scripts/generate_batch_audio.py \
        --facts "12-9,11-8,10-7,9-4,8-6,7-5,6-4,5-5" \
        --out-dir game-src/public/content/audio/math [--take existing.mp3]

Facts are "A-B" pairs spoken as "A minus B equals A-B".
Exit codes: 0 ok, 1 TTS failure, 2 split failure (take rejected), 3 validation.
"""
from __future__ import annotations

import argparse, json, os, pathlib, subprocess, sys, urllib.request

import numpy as np

SEP = "Click"
MODEL = "gpt-4o-mini-tts"
VOICE = "marin"
INSTRUCTIONS = (
    "Read the supplied list exactly as written, in a clear, neutral General "
    "American accent for a child's math game. Say every item in the list, "
    "including the repeated math fact at the very end. Say each math fact "
    "once, at a natural, gently measured pace, with the same emphasis every "
    "time. Say the separator word 'Click' clearly and pause distinctly after "
    "it and after each fact. Do not add, skip, spell, introduce, or explain "
    "anything."
)


def speech_text(facts):
    parts = [SEP]
    for a, b in facts:
        parts.append(f"{a} minus {b} equals {a - b}")
        parts.append(SEP)
    a, b = facts[0]
    parts.append(f"{a} minus {b} equals {a - b}")  # sacrificial duplicate
    return ". ".join(parts) + "."


def call_tts(key, text, dest):
    body = json.dumps({"model": MODEL, "voice": VOICE, "input": text,
                       "response_format": "mp3",
                       "instructions": INSTRUCTIONS}).encode()
    req = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech", data=body,
        headers={"Authorization": "Bearer " + key,
                 "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = resp.read()
    if len(data) < 100:
        raise ValueError("OpenAI returned an unexpectedly short response")
    dest.write_bytes(data)


def decode(path):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000",
         "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def segments(x, thresh_db=-45.0, min_gap_ms=150, min_seg_ms=120):
    win = 160  # 10 ms at 16 kHz
    n = len(x) // win
    env = np.abs(x[: n * win].reshape(n, win)).max(axis=1)
    env_db = 20 * np.log10(np.maximum(env, 1e-9))
    silent = env_db < thresh_db
    min_gap = min_gap_ms // 10
    segs, in_seg, seg_start, gap_run, gap_start = [], False, 0, 0, 0
    for idx, is_sil in enumerate(silent):
        if not is_sil:
            if not in_seg:
                in_seg, seg_start = True, idx
            gap_run = 0
        elif in_seg:
            if gap_run == 0:
                gap_start = idx
            gap_run += 1
            if gap_run >= min_gap:
                segs.append((seg_start, gap_start))
                in_seg, gap_run = False, 0
    if in_seg:
        segs.append((seg_start, n))
    return [(s / 100.0, e / 100.0) for s, e in segs if (e - s) * 10 >= min_seg_ms]


def split_facts(segs, n_facts):
    """Classify separators (short, paused); facts are spans between them.

    Raw segment count is NOT trusted: a fact can split at a mid-fact pause.
    Require exactly N+1 separators, first segment a separator, and at least
    one segment after the last separator (the sacrificial duplicate -- if it
    is missing, the duplicate was dropped and fact N is unprotected). Any
    mismatch returns None: fail the take, never guess.
    """
    if not segs:
        return None
    gaps_before = [segs[i][0] - segs[i - 1][1] if i else 9.9 for i in range(len(segs))]
    gaps_after = [segs[i + 1][0] - segs[i][1] if i + 1 < len(segs) else 9.9
                  for i in range(len(segs))]
    sep_idx = [i for i, (s, e) in enumerate(segs)
               if (e - s) <= 0.55 and (gaps_before[i] >= 0.28 or gaps_after[i] >= 0.28)]
    if len(sep_idx) != n_facts + 1 or sep_idx[0] != 0 or sep_idx[-1] == len(segs) - 1:
        return None
    return [(segs[a + 1][0], segs[b - 1][1], segs[a][1], segs[b][0])
            for a, b in zip(sep_idx, sep_idx[1:])]


def db(v):
    return 20 * float(np.log10(max(v, 1e-9)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--facts", required=True, help='e.g. "12-9,11-8,5-5"')
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--take", help="reuse an existing batch MP3 instead of calling TTS")
    ap.add_argument("--work-dir", default="/tmp/batch-audio")
    args = ap.parse_args()

    facts = [tuple(int(p) for p in f.split("-")) for f in args.facts.split(",")]
    out_dir = pathlib.Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    work = pathlib.Path(args.work_dir)
    work.mkdir(parents=True, exist_ok=True)
    raw = work / "batch_raw.mp3"

    if args.take:
        raw.write_bytes(pathlib.Path(args.take).read_bytes())
        print(f"reusing take: {args.take}")
    else:
        key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not key:
            print("Missing OPENAI_API_KEY", file=sys.stderr)
            return 1
        text = speech_text(facts)
        print("TEXT:", text)
        try:
            call_tts(key, text, raw)
        except Exception as exc:
            print("TTS FAILED:", type(exc).__name__)
            return 1

    x = decode(raw)
    print(f"raw duration: {len(x) / 16000:.2f}s")
    segs = segments(x)
    for i, (s, e) in enumerate(segs):
        print(f"  [{i:2d}] {s:6.2f}s - {e:6.2f}s  ({e - s:.2f}s)")
    spans = split_facts(segs, len(facts))
    if spans is None:
        print("SPLIT FAIL: separator pattern not found -- take rejected, not guessing.")
        return 2
    print(f"split OK: {len(spans)} facts between {len(facts) + 1} separators")

    wav = work / "batch.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(raw),
                    "-ac", "1", "-ar", "24000", str(wav)], check=True)
    bad = 0
    for (a, b), (s, e, prev_sep_end, next_sep_start) in zip(facts, spans):
        start = max(prev_sep_end + 0.05, s - 0.07)
        end = min(next_sep_start - 0.05, e + 0.10)
        name = f"{a}-minus-{b}-equals-{a - b}.mp3"
        out = out_dir / name
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", f"{start:.3f}",
             "-t", f"{end - start:.3f}", "-i", str(wav),
             "-af", "loudnorm=I=-20:TP=-2:LRA=7",
             "-codec:a", "libmp3lame", "-q:a", "4", str(out)], check=True)
        cx = decode(out)
        d, peak, tail = len(cx) / 16000, db(float(np.abs(cx).max())), db(float(np.abs(cx[-320:]).max()))
        ok = 0.4 <= d <= 2.6 and peak > -30 and tail < -25
        bad += 0 if ok else 1
        print(f"  {'PASS' if ok else 'CHECK'} {name}: {d:.2f}s peak {peak:.0f}dB tail20 {tail:.0f}dB")
    print(f"{len(facts) - bad}/{len(facts)} clips pass static checks")
    return 0 if not bad else 3


if __name__ == "__main__":
    raise SystemExit(main())
