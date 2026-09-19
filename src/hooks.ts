import { useCallback, useEffect, useRef, useState } from "react";

/** Filter/sort state lives in the URL so a view can be bookmarked and shared. */
export function useUrlState(defaults: Record<string, string>) {
  const read = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const out = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = params.get(key);
      if (value !== null) out[key] = value;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [state, setState] = useState<Record<string, string>>(read);

  useEffect(() => {
    const onPop = () => setState(read());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [read]);

  const set = useCallback(
    (patch: Record<string, string>, opts?: { push?: boolean }) => {
      setState((prev) => {
        const next = { ...prev, ...patch };
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(next)) {
          if (value && value !== defaults[key]) params.set(key, value);
        }
        const url = params.toString()
          ? `${window.location.pathname}?${params}`
          : window.location.pathname;
        if (opts?.push) window.history.pushState(null, "", url);
        else window.history.replaceState(null, "", url);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return [state, set] as const;
}

export interface ToastMessage {
  id: number;
  kind: "ok" | "error";
  text: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastMessage["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, kind === "error" ? 6000 : 3000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

/** Delays a fast-changing value — used by the search box. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

export function useEscape(onEscape: () => void, active = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape, active]);
}
