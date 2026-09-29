import { useEffect } from "react";

/**
 * Locks page scrolling while a game is open: the page never scrolls or
 * rubber-bands, and double-tap zoom is off. Taller game layouts scroll
 * inside the app root instead (see the arcade-locked rules in theme.css).
 */
export function useScrollLock() {
  useEffect(() => {
    document.documentElement.classList.add("arcade-locked");
    return () => {
      document.documentElement.classList.remove("arcade-locked");
    };
  }, []);
}
