"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { PlaceInput, PlaceSuggestion } from "@/lib/api-types";
import type { LatLng } from "@/lib/geo";

/** What the user typed, plus coordinates once a suggestion was picked. */
export type PlaceValue = { text: string; location?: LatLng };

export const emptyPlace: PlaceValue = { text: "" };

export function toPlaceInput(v: PlaceValue): PlaceInput {
  return v.location ? { location: v.location, label: v.text } : { address: v.text.trim() };
}

type Props = {
  label: string;
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  placeholder?: string;
  /** Bias suggestions towards this point. */
  near?: LatLng;
  trailing?: React.ReactNode;
};

/** Text input with debounced server-side place suggestions. */
export function AddressInput({ label, value, onChange, placeholder, near, trailing }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const text = value.text;
  const picked = !!value.location;
  const nearLat = near?.lat;
  const nearLng = near?.lng;
  const lastQuery = useRef("");

  useEffect(() => {
    const q = text.trim();
    if (picked || q.length < 3 || q === lastQuery.current) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (nearLat !== undefined && nearLng !== undefined) {
          params.set("lat", nearLat.toFixed(3));
          params.set("lng", nearLng.toFixed(3));
        }
        const res = await fetch(`/api/autocomplete?${params}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { suggestions: PlaceSuggestion[] };
        lastQuery.current = q;
        setSuggestions(data.suggestions);
        setActive(-1);
      } catch {
        // Aborted or offline – suggestions are optional.
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, picked, nearLat, nearLng]);

  const choose = (s: PlaceSuggestion) => {
    onChange({ text: s.label, location: s.location });
    setOpen(false);
  };

  const showList = open && !picked && suggestions.length > 0 && text.trim().length >= 3;

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
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            autoComplete="off"
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              // Editing the text discards previously picked coordinates.
              onChange({ text: e.target.value });
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
          {picked && <span className="pin" aria-label="Pontos hely kiválasztva" title="Pontos hely kiválasztva">✓</span>}
          {showList && (
            <ul className="suggestions" id={listId} role="listbox">
              {suggestions.map((s, i) => (
                <li
                  key={`${s.label}-${i}`}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(s);
                  }}
                >
                  {s.label}
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
