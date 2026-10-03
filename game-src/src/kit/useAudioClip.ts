import { useCallback, useEffect, useRef } from "react";
import { ensureAudioContext } from "./audio";

/**
 * Plays word/letter MP3 clips. Prefers Web Audio (decoded + compressed, with
 * an in-memory buffer cache) and falls back to an <audio> element for
 * embedded browsers that can't decode MP3 in Web Audio.
 *
 * Uses the shared audio context and cancels stale playback on pause/unmount.
 */
export function useAudioClip() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const generationRef = useRef(0);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  const stop = useCallback(() => {
    generationRef.current++;
    try { sourceRef.current?.stop(); } catch { /* Already stopped. */ }
    sourceRef.current = null;
    audioRef.current?.pause();
  }, []);

  useEffect(() => () => {
    stop();
  }, [stop]);

  const play = useCallback(async (src: string) => {
    stop();
    const generation = generationRef.current;
    const context = ensureAudioContext();
    if (context) {
      try {
        if (context.state === "suspended") await context.resume();
        if (context.state !== "running") throw new Error("Audio context is not running");

        let buffer = buffersRef.current.get(src);
        if (!buffer) {
          const response = await fetch(src, { cache: "force-cache" });
          if (!response.ok) throw new Error("Audio clip could not be loaded");
          buffer = await context.decodeAudioData(await response.arrayBuffer());
          buffersRef.current.set(src, buffer);
        }

        if (generation !== generationRef.current) return;
        try { sourceRef.current?.stop(); } catch { /* The previous clip already ended. */ }
        const source = context.createBufferSource();
        const gain = context.createGain();
        const compressor = context.createDynamicsCompressor();
        gain.gain.value = 1.45;
        compressor.threshold.value = -18;
        compressor.knee.value = 12;
        compressor.ratio.value = 6;
        source.buffer = buffer;
        source.connect(gain).connect(compressor).connect(context.destination);
        source.start();
        sourceRef.current = source;
        return;
      } catch {
        // Some embedded browsers cannot decode MP3 with Web Audio; use media playback below.
      }
    }

    if (generation !== generationRef.current) return;
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = src;
    audio.preload = "auto";
    audio.volume = 1;
    audio.currentTime = 0;
    await audio.play();
  }, [stop]);
  return Object.assign(play, { stop });
}
