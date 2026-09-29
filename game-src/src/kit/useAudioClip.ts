import { useCallback, useEffect, useRef } from "react";

/**
 * Plays word/letter MP3 clips. Prefers Web Audio (decoded + compressed, with
 * an in-memory buffer cache) and falls back to an <audio> element for
 * embedded browsers that can't decode MP3 in Web Audio.
 *
 * Moved verbatim from App.tsx so every game shares one clip player.
 */
export function useAudioClip() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  useEffect(() => () => {
    sourceRef.current?.stop();
    audioRef.current?.pause();
    const context = contextRef.current;
    if (context && context.state !== "closed") void context.close();
  }, []);

  return useCallback(async (src: string) => {
    const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      try {
        const context = contextRef.current ?? new AudioCtx();
        contextRef.current = context;
        if (context.state === "suspended") await context.resume();
        if (context.state !== "running") throw new Error("Audio context is not running");

        let buffer = buffersRef.current.get(src);
        if (!buffer) {
          const response = await fetch(src, { cache: "force-cache" });
          if (!response.ok) throw new Error("Audio clip could not be loaded");
          buffer = await context.decodeAudioData(await response.arrayBuffer());
          buffersRef.current.set(src, buffer);
        }

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

    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = src;
    audio.preload = "auto";
    audio.volume = 1;
    audio.currentTime = 0;
    await audio.play();
  }, []);
}
