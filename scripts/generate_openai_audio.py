#!/usr/bin/env python3
"""Generate, normalize, and statically validate the game's speech MP3 library."""

from __future__ import annotations

import array
import csv
import html
import json
import math
import os
import pathlib
import random
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "game-src/src/assets"
REVIEW_ROOT = ROOT / "audio-review"
PREVIEW_ASSETS = REVIEW_ROOT / "assets/game-src/src/assets"
MODEL = "gpt-4o-mini-tts"
VOICE = "marin"
LETTER_NAMES = {
    "b": "bee",
    "c": "see",
    "d": "dee",
    "k": "kay",
    "n": "en",
    "p": "pee",
    "q": "cue",
    "u": "you",
}


def expected_speech(path: pathlib.Path) -> str:
    stem = path.stem
    if path.parent.name == "letters":
        try:
            return LETTER_NAMES[stem]
        except KeyError as exc:
            raise ValueError(f"No letter-name mapping for {path}") from exc
    if stem in ("short-o", "short-u"):
        return "short O" if stem == "short-o" else "short U"
    return stem.removesuffix("_new").replace("-", " ")


def call_tts(key: str, speech: str, destination: pathlib.Path) -> None:
    body = json.dumps(
        {
            "model": MODEL,
            "voice": VOICE,
            "input": speech,
            "response_format": "mp3",
            "instructions": (
                "Say only the supplied word or short label once, in a clear, "
                "neutral General American accent for a child's phonics game. "
                "Do not spell it, introduce it, explain it, or add other sounds. "
                "Use a natural, gently measured pace. For letter names, pronounce "
                "the supplied name as the English letter name."
            ),
        }
    ).encode()
    request = urllib.request.Request(
        "https://api.openai.com/v1/audio/speech",
        data=body,
        headers={
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        data = response.read()
    if len(data) < 100:
        raise ValueError("OpenAI returned an unexpectedly short response")
    destination.write_bytes(data)


def make_final_mp3(raw_mp3: pathlib.Path, output: pathlib.Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw_mp3),
            "-af",
            "silenceremove=start_periods=1:start_duration=0.03:start_threshold=-50dB:"
            "start_silence=0.07:stop_periods=1:stop_duration=0.03:"
            "stop_threshold=-50dB:stop_silence=0.10,loudnorm=I=-20:TP=-2:LRA=7",
            "-map", "0:a:0", "-codec:a", "libmp3lame", "-q:a", "4", str(output),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def inspect_audio(path: pathlib.Path) -> dict[str, float | int | str]:
    info = json.loads(
        subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration,size", "-of", "json", str(path)]
        )
    )
    duration = float(info["format"]["duration"])
    raw = subprocess.check_output(
        ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"]
    )
    samples = array.array("h")
    samples.frombytes(raw[: len(raw) - len(raw) % samples.itemsize])
    if sys.byteorder != "little":
        samples.byteswap()
    if not samples:
        return {"duration_s": duration, "rms": 0.0, "peak": 0.0, "lead_silence_s": duration, "tail_silence_s": duration, "size_bytes": int(info["format"]["size"])}
    peak_i = max(abs(value) for value in samples)
    sum_sq = sum(value * value for value in samples)
    rms = math.sqrt(sum_sq / len(samples)) / 32768.0
    active_indices = [i for i, value in enumerate(samples) if abs(value) > 100]
    if active_indices:
        lead = active_indices[0] / 16000
        tail = (len(samples) - 1 - active_indices[-1]) / 16000
    else:
        lead = tail = duration
    return {
        "duration_s": duration,
        "rms": rms,
        "peak": peak_i / 32768.0,
        "lead_silence_s": lead,
        "tail_silence_s": tail,
        "size_bytes": int(info["format"]["size"]),
    }


def warnings(metrics: dict[str, float | int | str]) -> list[str]:
    issues: list[str] = []
    if metrics["duration_s"] < 0.25 or metrics["duration_s"] > 3.5:
        issues.append("unusual duration")
    if metrics["rms"] < 0.007 or metrics["peak"] < 0.02:
        issues.append("too quiet or silent")
    if metrics["peak"] > 0.995:
        issues.append("possible clipping")
    if metrics["lead_silence_s"] > 0.22 or metrics["tail_silence_s"] > 0.22:
        issues.append("long leading or trailing silence")
    return issues


def write_report(rows: list[dict[str, object]], errors: list[str]) -> None:
    REVIEW_ROOT.mkdir(parents=True, exist_ok=True)
    fields = ["file", "spoken_text", "duration_s", "rms", "peak", "lead_silence_s", "tail_silence_s", "size_bytes", "status", "issues"]
    with (REVIEW_ROOT / "report.csv").open("w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in fields})
    error_html = "" if not errors else "<h2>Generation failures</h2><ul>" + "".join("<li>" + html.escape(e) + "</li>" for e in errors) + "</ul>"
    issue_rows = [row for row in rows if row.get("issues")]
    issue_html = "" if not issue_rows else "<h2>Needs a listen</h2><ul>" + "".join(
        "<li>" + html.escape(str(row["file"])) + ": " + html.escape(str(row["issues"])) + "</li>" for row in issue_rows
    ) + "</ul>"
    items = []
    for row in rows:
        rel = pathlib.Path(str(row["file"]))
        source = "assets/game-src/src/assets/" + rel.relative_to(ASSET_ROOT).as_posix()
        items.append(
            "<section><b>" + html.escape(str(row["file"])) + "</b> — " + html.escape(str(row["spoken_text"]))
            + "<br><small>" + html.escape(str(row.get("status", ""))) + " "
            + html.escape(str(row.get("issues", ""))) + "</small><br><audio controls preload=\"none\" src=\""
            + html.escape(source) + "\"></audio></section>"
        )
    page = (
        "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>OpenAI phonics audio review</title><style>body{font:16px system-ui;max-width:760px;margin:2rem auto;padding:0 1rem}section{padding:.8rem 0;border-bottom:1px solid #ddd}small{color:#555}audio{width:min(100%,420px)}</style>"
        "<h1>Phonics audio review</h1><p>Generated with OpenAI " + MODEL + ", voice " + VOICE + ". "
        + str(len(rows)) + " source MP3s checked. Static checks test decode, duration, level, clipping, and silence; they do not verify spoken-word accuracy.</p>"
        + error_html + issue_html + "<h2>All clips</h2>" + "".join(items) + "</html>"
    )
    (REVIEW_ROOT / "index.html").write_text(page, encoding="utf-8")


def main() -> int:
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        print("Missing repository Actions secret: openaivoice", file=sys.stderr)
        return 2
    assets = sorted(ASSET_ROOT.rglob("*.mp3"))
    if not assets:
        print("No source MP3 files found", file=sys.stderr)
        return 2
    for root in (PREVIEW_ASSETS,):
        root.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    errors: list[str] = []
    with tempfile.TemporaryDirectory(prefix="openai-audio-") as temporary:
        temp_root = pathlib.Path(temporary)
        for index, source in enumerate(assets, start=1):
            relative = source.relative_to(ASSET_ROOT)
            speech = expected_speech(source)
            raw_mp3 = temp_root / (relative.as_posix().replace("/", "_") + ".raw.mp3")
            final_mp3 = temp_root / (relative.as_posix().replace("/", "_") + ".mp3")
            last_error = ""
            accepted: dict[str, float | int | str] | None = None
            for attempt in range(1, 5):
                try:
                    call_tts(key, speech, raw_mp3)
                    make_final_mp3(raw_mp3, final_mp3)
                    metrics = inspect_audio(final_mp3)
                    reasons = warnings(metrics)
                    if reasons:
                        last_error = ", ".join(reasons)
                        print(f"Retrying {relative.as_posix()} after static check: {last_error}")
                        continue
                    accepted = metrics
                    break
                except urllib.error.HTTPError as exc:
                    code = exc.code
                    try:
                        details = json.loads(exc.read()).get("error", {}).get("code", "")
                    except Exception:
                        details = ""
                    safe = details if details in {"insufficient_quota", "rate_limit_exceeded", "invalid_api_key", "model_not_found"} else "unspecified"
                    if code == 429 or code >= 500:
                        wait = min(30, (2 ** (attempt - 1)) + random.random())
                        last_error = f"HTTP {code} ({safe})"
                        if attempt < 4:
                            print(f"Retrying {relative.as_posix()} after {last_error}")
                            time.sleep(wait)
                            continue
                    else:
                        last_error = f"HTTP {code} ({safe})"
                    break
                except Exception as exc:
                    last_error = type(exc).__name__
                    if attempt < 4:
                        time.sleep(min(10, 2 ** (attempt - 1)))
                        continue
                    break
            row: dict[str, object] = {"file": source.as_posix(), "spoken_text": speech}
            if accepted is None:
                row.update({"status": "FAILED", "issues": last_error or "generation failed"})
                errors.append(relative.as_posix() + ": " + str(row["issues"]))
            else:
                source.write_bytes(final_mp3.read_bytes())
                preview = PREVIEW_ASSETS / relative
                preview.parent.mkdir(parents=True, exist_ok=True)
                preview.write_bytes(final_mp3.read_bytes())
                row.update(accepted)
                row.update({"status": "PASS", "issues": ""})
            rows.append(row)
            print(f"[{index}/{len(assets)}] {row['status']} {relative.as_posix()}")
    write_report(rows, errors)
    failed = len(errors)
    flagged = sum(1 for row in rows if row.get("issues") and row.get("status") == "PASS")
    print(f"Checked {len(assets)} source MP3s; failed={failed}; review_flags={flagged}")
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
