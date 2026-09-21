import { useEffect } from "react";
import { useTerminal } from "./market/store";

/**
 * Resolves the user's theme preference ("system" follows the OS via
 * prefers-color-scheme) into the concrete `theme` the rest of the app already
 * consumes. Lives at the terminal root so every pane's engine, the DOM
 * data-theme and the legend all re-sync on a live OS theme flip.
 */
export function useSystemTheme() {
  const pref = useTerminal((s) => s.themePref);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      if (useTerminal.getState().themePref !== "system") return;
      useTerminal.getState().setTheme(mq.matches ? "dark" : "light");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);
}
