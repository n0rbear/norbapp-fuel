"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "norbapp-fuel:storage";

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/**
 * A string setting remembered in localStorage. Renders `fallback` on the
 * server and until hydration, so there is no hydration mismatch.
 */
export function usePersistentState<T extends string>(
  key: string,
  fallback: T,
  isValid: (v: string) => v is T,
): [T, (value: T) => void] {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );
  const value = stored !== null && isValid(stored) ? stored : fallback;

  const set = useCallback(
    (next: T) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Private mode / blocked storage: the choice just isn't remembered.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );

  return [value, set];
}
