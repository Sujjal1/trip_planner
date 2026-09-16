import React, { useEffect, useRef, useState } from "react";
import { MapPin, Navigation, RefreshCw } from "lucide-react";
async function mapsApi(path, body, signal) {
  const res = await fetch("/api/maps/" + path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CoDrive": "1" },
    body: JSON.stringify(body),
    signal,
  });
  const data = await res.json();
  if (!res.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "Google search is temporarily unavailable.",
    );
  return data;
}
function GooglePlaceInput({ label, value, onSelect, onClear, onError }) {
  const [query, setQuery] = useState(""),
    [suggestions, setSuggestions] = useState([]),
    [busy, setBusy] = useState(false),
    [open, setOpen] = useState(false),
    [highlight, setHighlight] = useState(-1);
  const token = useRef(crypto.randomUUID()),
    requestVersion = useRef(0),
    callbacks = useRef({ onSelect, onClear, onError });
  callbacks.current = { onSelect, onClear, onError };
  const listId = React.useId();
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSuggestions([]);
      setBusy(false);
      return;
    }
    const abort = new AbortController(),
      version = ++requestVersion.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const result = await mapsApi(
          "search",
          { query: query.trim(), session_token: token.current },
          abort.signal,
        );
        if (version === requestVersion.current) {
          setSuggestions(result.places);
          setHighlight(-1);
        }
      } catch (e) {
        if (e.name !== "AbortError") callbacks.current.onError(e.message);
      } finally {
        if (!abort.signal.aborted) setBusy(false);
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [query, open]);
  useEffect(() => {
    if (value) {
      setQuery(value);
      setOpen(false);
    } else if (!open) setQuery("");
  }, [value]);
  async function choose(p) {
    const version = ++requestVersion.current;
    setOpen(false);
    setBusy(true);
    try {
      const place = await mapsApi("place", {
        place_id: p.id,
        session_token: token.current,
      });
      if (version !== requestVersion.current) return;
      callbacks.current.onSelect({
        label: place.label.slice(0, 200),
        ref: "place_id:" + place.id,
      });
      setQuery(place.label);
      setSuggestions([]);
      token.current = crypto.randomUUID();
    } catch (e) {
      callbacks.current.onError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="field google-place-field">
      <label htmlFor={listId + "input"}>
        <MapPin size={14} /> {label}
      </label>
      <input
        id={listId + "input"}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        aria-controls={listId}
        aria-activedescendant={highlight >= 0 ? listId + highlight : undefined}
        value={query}
        placeholder="Search Google Maps"
        maxLength={200}
        autoComplete="off"
        onFocus={() => {
          if (!value) setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          requestVersion.current++;
          setQuery(e.target.value);
          setOpen(true);
          setSuggestions([]);
          callbacks.current.onClear();
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (open && highlight >= 0 && suggestions[highlight])
              choose(suggestions[highlight]);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {busy && (
        <p role="status" className="form-note">
          Searching Google…
        </p>
      )}
      {open && suggestions.length > 0 && (
        <ul id={listId} role="listbox" className="google-results">
          {suggestions.map((p, i) => (
            <li
              key={p.id}
              id={listId + i}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(p)}
            >
              <MapPin size={15} />
              {p.label}
            </li>
          ))}
        </ul>
      )}
      {value && <p className="selected-place">Selected: {value}</p>}
      <img
        className="google-attribution"
        alt="Powered by Google"
        src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png"
      />
    </div>
  );
}
export function GoogleEmbed({ src, title = "Trip map" }) {
  const [revision, setRevision] = useState(0),
    [loading, setLoading] = useState(true),
    [slow, setSlow] = useState(false);
  useEffect(() => {
    setLoading(true);
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), 15000);
    return () => clearTimeout(timer);
  }, [src, revision]);
  return (
    <div className="map-shell">
      {loading && (
        <p className="map-loading" role="status">
          {slow
            ? "Google Maps is taking longer than expected. Check your connection or reload the map."
            : "Loading Google Maps…"}
        </p>
      )}
      <iframe
        key={revision}
        title={title}
        className="map planner-map"
        src={src}
        referrerPolicy="strict-origin-when-cross-origin"
        onLoad={() => setLoading(false)}
        onError={() => setSlow(true)}
        allowFullScreen
      />
      <button
        type="button"
        className="text-btn"
        onClick={() => setRevision((n) => n + 1)}
      >
        <RefreshCw size={14} />
        Reload map
      </button>
    </div>
  );
}
export default function GoogleRouteSearch({
  origin,
  destination,
  setOrigin,
  setDestination,
}) {
  const [startRef, setStartRef] = useState(origin),
    [endRef, setEndRef] = useState(destination),
    [error, setError] = useState(""),
    [manual, setManual] = useState(false),
    [locating, setLocating] = useState(false),
    [locationError, setLocationError] = useState("");
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  const base = "https://www.google.com/maps/embed/v1/";
  const src = !key
    ? ""
    : startRef && endRef
      ? `${base}directions?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(startRef)}&destination=${encodeURIComponent(endRef)}&mode=driving`
      : startRef || endRef
        ? `${base}place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(startRef || endRef)}`
        : `${base}view?key=${encodeURIComponent(key)}&center=39.5,-98.35&zoom=4`;
  const selectStart = (p) => {
    setError("");
    setOrigin(p.label);
    setStartRef(p.ref);
  };
  const selectEnd = (p) => {
    setError("");
    setDestination(p.label);
    setEndRef(p.ref);
  };
  function locate() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError(
        "Your browser does not support location. Search for your starting point instead.",
      );
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const coordinates = `${p.coords.latitude.toFixed(6)},${p.coords.longitude.toFixed(6)}`;
        selectStart({ label: coordinates, ref: coordinates });
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(
          "Location is unavailable or permission was denied. Choose a starting place using Google search.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  return (
    <section className="route-search">
      <p className="form-note">
        Choose a Google suggestion for each location. Your selections set the
        route and are saved with the trip.
      </p>
      {!manual ? (
        <>
          <GooglePlaceInput
            label="Starting from"
            value={origin}
            onSelect={selectStart}
            onClear={() => {
              setOrigin("");
              setStartRef("");
            }}
            onError={setError}
          />
          <GooglePlaceInput
            label="Going to"
            value={destination}
            onSelect={selectEnd}
            onClear={() => {
              setDestination("");
              setEndRef("");
            }}
            onError={setError}
          />
          <input type="hidden" name="origin" value={origin} />
          <input type="hidden" name="destination" value={destination} />
        </>
      ) : (
        <>
          <label className="field">
            <span>Starting from (manual)</span>
            <input
              name="origin"
              required
              value={origin}
              maxLength={200}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Going to (manual)</span>
            <input
              name="destination"
              required
              value={destination}
              maxLength={200}
              onChange={(e) => setDestination(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn secondary"
            onClick={() => {
              setStartRef(origin.trim());
              setEndRef(destination.trim());
            }}
          >
            Preview entered route
          </button>
        </>
      )}
      <button
        type="button"
        className="text-btn"
        onClick={locate}
        disabled={locating}
      >
        <Navigation size={15} />
        {locating
          ? "Finding your location…"
          : "Use my current location as the start"}
      </button>
      <p className="form-note">
        Using your location sends it to Google to show your route. Co-owners
        only see the route if you enable sharing.
      </p>
      {locationError && <p className="error">{locationError}</p>}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button
        type="button"
        className="text-btn"
        onClick={() => setManual(!manual)}
      >
        {manual
          ? "Return to Google place search"
          : "Enter addresses manually instead"}
      </button>
      {src ? (
        <GoogleEmbed src={src} title="Plan your route in Google Maps" />
      ) : (
        <div className="info-note">
          A Google Maps key is required for the map preview.
        </div>
      )}
    </section>
  );
}
