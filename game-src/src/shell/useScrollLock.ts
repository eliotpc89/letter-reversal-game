import { useLayoutEffect } from "react";

/**
 * Locks page scrolling while a game is open: the page never scrolls or
 * rubber-bands, and double-tap zoom is off. Taller game layouts scroll
 * inside the app root instead (see the arcade-locked rules in theme.css).
 */
export function useScrollLock(screenKey?: string) {
  useLayoutEffect(() => {
    // Reset both page and picker scrolling before fullscreen locks the HUD.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelectorAll<HTMLElement>(".hatch-space-root").forEach((root) => {
      root.scrollTop = 0;
      root.scrollLeft = 0;
    });
    document.documentElement.classList.add("arcade-locked");
    return () => {
      document.documentElement.classList.remove("arcade-locked");
    };
  }, [screenKey]);
}
