"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  RefObject,
} from "react";
import type { Map as LeafletMap } from "leaflet";
import { MapPin, Search, X } from "lucide-react";

import { Spinner } from "@/components/ui/Spinner";
import { ApiError, api } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  PLACE_ZOOM,
  placeKindLabel,
  type GeocodePlace,
} from "@/lib/geocode";
import { useI18n } from "@/lib/i18n";

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 450;

interface LocationSearchProps {
  mapRef: RefObject<LeafletMap | null>;
  onSelect?: (place: GeocodePlace) => void;
  className?: string;
}

/**
 * Floating village / town search for the field map. Typeahead results come
 * from `/api/geocode`; choosing one flies the map there so a farmer does not
 * have to pan around looking for their fields.
 */
export function LocationSearch({
  mapRef,
  onSelect,
  className,
}: LocationSearchProps) {
  const baseId = useId();
  const { t } = useI18n();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const forceSearchRef = useRef(false);

  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [results, setResults] = useState<GeocodePlace[]>([]);
  const [searchedFor, setSearchedFor] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTick, setSearchTick] = useState(0);

  const trimmed = query.trim();

  useEffect(() => {
    // Selecting a result fills the input with its name; that is not a new
    // search, so do not reopen the dropdown.
    if (selectedName !== null && trimmed === selectedName) return;

    if (trimmed.length < MIN_QUERY_LENGTH) {
      // `handleChange` already cleared the results for short queries.
      return;
    }

    const force = forceSearchRef.current;
    forceSearchRef.current = false;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => {
        setLoading(true);
        setError(null);

        api
          .searchPlaces(trimmed, {
            signal: controller.signal,
          })
          .then((data) => {
            if (controller.signal.aborted) return;
            setResults(data.places ?? []);
            setSearchedFor(trimmed);
            setActiveIndex(0);
            setOpen(true);
          })
          .catch((cause) => {
            if (controller.signal.aborted) return;
            setResults([]);
            setSearchedFor(trimmed);
            setError(
              cause instanceof ApiError
                ? cause.message
                : "Could not search for places. Check your connection.",
            );
            setOpen(true);
          })
          .finally(() => {
            if (!controller.signal.aborted) setLoading(false);
          });
      },
      force ? 0 : SEARCH_DEBOUNCE_MS,
    );

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [trimmed, selectedName, searchTick]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView({
      block: "nearest",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex]);

  const selectPlace = (place: GeocodePlace) => {
    const map = mapRef.current;

    if (map) {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (place.bbox) {
        const [south, west, north, east] = place.bbox;
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          {
            padding: [36, 36],
            maxZoom: PLACE_ZOOM[place.kind] ?? 16,
            animate: !reduceMotion,
            duration: 0.6,
          },
        );
      } else {
        map.flyTo([place.lat, place.lng], PLACE_ZOOM[place.kind] ?? 16, {
          animate: !reduceMotion,
          duration: 0.6,
        });
      }
    }

    setQuery(place.name);
    setSelectedName(place.name);
    setResults([]);
    setError(null);
    setOpen(false);
    onSelect?.(place);
  };

  const clear = () => {
    setQuery("");
    setSelectedName(null);
    setResults([]);
    setSearchedFor("");
    setError(null);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleChange = (value: string) => {
    setQuery(value);
    setSelectedName(null);
    setError(null);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearchedFor("");
      setOpen(false);
    }
  };

  const submitSearch = () => {
    if (searchedFor === trimmed) {
      const place = results[activeIndex] ?? results[0];
      if (place) selectPlace(place);
      return;
    }

    // Enter before the debounce fired: search immediately instead of
    // appearing to do nothing.
    if (trimmed.length >= MIN_QUERY_LENGTH && !loading) {
      forceSearchRef.current = true;
      setSearchTick((tick) => tick + 1);
    }
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setActiveIndex((current) => (open ? (current + 1) % results.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setActiveIndex((current) =>
        open ? (current - 1 + results.length) % results.length : results.length - 1,
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      submitSearch();
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const showEmpty =
    !loading && !error && results.length === 0 && searchedFor === trimmed;

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <div
        role="search"
        className="map-panel flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5"
      >
        <Search aria-hidden className="h-4 w-4 shrink-0 text-ink-soft" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={(event) => {
            if (selectedName !== null && trimmed === selectedName) {
              event.currentTarget.select();
            }
            if (
              selectedName === null &&
              results.length > 0 &&
              searchedFor === trimmed
            ) {
              setOpen(true);
            }
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && results.length > 0 ? optionId(activeIndex) : undefined
          }
          aria-label={t("Search for a village, town or coordinates")}
          placeholder={t("Search village, town or lat, lng")}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-1 text-base font-medium outline-none placeholder:font-normal placeholder:text-ink-soft sm:text-sm"
        />
        {loading ? <Spinner className="h-4 w-4 shrink-0 text-ink-soft" /> : null}
        {query ? (
          <button
            type="button"
            onClick={clear}
            aria-label={t("Clear location search")}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-[var(--card-muted)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="map-panel absolute inset-x-0 top-[calc(100%+0.45rem)] z-[600] overflow-hidden rounded-2xl p-1.5">
          {error ? (
            <p role="alert" className="px-3 py-3 text-xs leading-relaxed text-danger-700">
              {t(error)}
            </p>
          ) : results.length > 0 ? (
            <>
              <ul
                id={listId}
                role="listbox"
                aria-label={t("Location search results")}
                className="max-h-[min(50dvh,20rem)] overflow-y-auto"
              >
                {results.map((place, index) => {
                  const active = index === activeIndex;
                  return (
                    <li
                      key={place.id}
                      id={optionId(index)}
                      role="option"
                      aria-selected={active}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectPlace(place)}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-xl px-2.5 py-2 transition-colors",
                        active
                          ? "bg-[var(--card-muted)]"
                          : "hover:bg-[var(--card-muted)]",
                      )}
                    >
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-leaf-100 text-leaf-700">
                        <MapPin aria-hidden className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold leading-snug">
                          {place.name}
                        </span>
                        <span className="muted mt-0.5 block truncate text-[0.7rem] leading-snug">
                          <span className="font-semibold uppercase tracking-[0.08em] text-leaf-700">
                            {t(placeKindLabel(place.kind))}
                          </span>
                          {place.detail ? ` · ${place.detail}` : ""}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="muted border-t border-[var(--color-line)] px-3 pb-1 pt-2 text-[0.62rem] leading-relaxed">
                {t("Search by Photon · © OpenStreetMap contributors")}
              </p>
            </>
          ) : showEmpty ? (
            <div className="px-3 py-3">
              <p className="text-sm font-semibold">{t("No places found")}</p>
              <p className="muted mt-0.5 text-xs leading-relaxed">
                {t("Try a village name, a nearby town, or a lat, lng pair.")}
              </p>
            </div>
          ) : (
            <p className="muted flex items-center gap-2 px-3 py-3 text-xs">
              <Spinner className="h-3.5 w-3.5" />
              {t("Searching…")}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
