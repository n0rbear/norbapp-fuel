"use client";

import { useEffect, useId, useRef, useState } from "react";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  trailing?: React.ReactNode;
};

function newSessionToken() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

/** Text input with debounced server-side place suggestions. */
export function AddressInput({ label, value, onChange, placeholder, disabled, trailing }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const session = useRef<string>("");
  const skipNext = useRef(false);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = value.trim();
    if (disabled || q.length < 3) return;
    if (!session.current) session.current = newSessionToken();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q, session: session.current });
        const res = await fetch(`/api/autocomplete?${params}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: string[] };
        setSuggestions(data.suggestions);
        setActive(-1);
      } catch {
        // Aborted or offline – suggestions are optional.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, disabled]);

  const choose = (s: string) => {
    skipNext.current = true;
    session.current = "";
    onChange(s);
    setSuggestions([]);
    setOpen(false);
  };

  const showList = open && suggestions.length > 0 && !disabled && value.trim().length >= 3;

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-row">
        <div className="combo">
          <input
            id={id}
            type="text"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (!showList) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, suggestions.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter" && active >= 0) {
                e.preventDefault();
                choose(suggestions[active]);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {showList && (
            <ul className="suggestions" id={listId} role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={s}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                >
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
        {trailing}
      </div>
    </div>
  );
}
