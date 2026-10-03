// Shared WebAudio context for all game sounds.
//
// Every game previously created its own AudioContext; now there is one,
// created on first use (which always happens inside a user gesture, so the
// autoplay policy is satisfied) and resumed if the browser suspended it.

let shared: AudioContext | null = null;

export function ensureAudioContext(): AudioContext | null {
  const AudioCtx =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;
  if (!shared || shared.state === "closed") shared = new AudioCtx();
  if (shared.state !== "running") void shared.resume().catch(() => {});
  return shared;
}

export function closeSharedAudio(): void {
  if (shared && shared.state !== "closed") void shared.close();
  shared = null;
}
