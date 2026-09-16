import React, { useState, useEffect } from "react";
import { Camera, MapPin, Navigation, LoaderCircle, Check } from "lucide-react";
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

export function PhotoReading({
  api,
  config,
  onRead,
  onBusy,
  kind,
  label = "Read dashboard photo",
}) {
  const [consent, setConsent] = useState(false),
    [image, setImage] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState(null);
  async function read(value) {
    setBusy(true);
    onBusy?.(true);
    setError("");
    setResult(null);
    try {
      const r = await api("/scan", "POST", { image: value, consent: true });
      if (r.odometer == null && r.receipt_total == null)
        throw new Error(
          "No clear odometer or receipt total found. Try another photo or enter the reading.",
        );
      if (kind && r[kind] == null)
        throw new Error(
          kind === "odometer"
            ? "No clear odometer found. Use a dashboard photo or enter the reading manually."
            : "No receipt total found. Use a fuel receipt or enter the amount manually.",
        );
      setResult(r);
      onRead(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  }
  return (
    <section className="photo-inline">
      <strong>
        <Camera size={16} /> {label}
      </strong>
      <p>
        Take or upload a photo. We read it and fill in the numbers
        automatically.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={consent}
          disabled={busy}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked && image) read(image);
          }}
        />
        <span>
          Allow this photo to be sent to Gemini. Free-tier images may be used to
          improve Google products.
        </span>
      </label>
      <input
        aria-label={label}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={busy || !config.gemini}
        onChange={(e) => {
          setError("");
          setResult(null);
          setImage("");
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 5000000) {
            setError("Choose an image under 5 MB.");
            return;
          }
          const reader = new FileReader();
          reader.onload = () => {
            setImage(reader.result);
            if (consent) read(reader.result);
          };
          reader.readAsDataURL(file);
        }}
      />
      {!config.gemini && (
        <p>
          Photo reading is not configured. Manual readings are available below.
        </p>
      )}
      {busy && (
        <p role="status">
          <LoaderCircle size={16} className="spin" /> Reading your photo…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <p role="status">
          <Check size={16} /> Read successfully. {result.notes} Check the filled
          values before saving.
        </p>
      )}
    </section>
  );
}

function RouteSearch({ origin, destination, setOrigin, setDestination }) {
  const [preview, setPreview] = useState({ origin, destination });
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  useEffect(() => {
    const id = setTimeout(
      () =>
        setPreview({ origin: origin.trim(), destination: destination.trim() }),
      900,
    );
    return () => clearTimeout(id);
  }, [origin, destination]);
  const base = "https://www.google.com/maps/embed/v1/";
  const url = !key
    ? ""
    : preview.origin && preview.destination
      ? `${base}directions?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(preview.origin)}&destination=${encodeURIComponent(preview.destination)}&mode=driving`
      : preview.origin || preview.destination
        ? `${base}search?key=${encodeURIComponent(key)}&q=${encodeURIComponent(preview.origin || preview.destination)}`
        : `${base}view?key=${encodeURIComponent(key)}&center=39.5,-98.35&zoom=4`;
  return (
    <section className="route-search">
      <label className="field">
        <span>
          <MapPin size={14} /> Starting from
        </span>
        <input
          name="origin"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          required
          placeholder="Search a place or full address"
          maxLength={200}
        />
      </label>
      <label className="field">
        <span>
          <MapPin size={14} /> Going to
        </span>
        <input
          name="destination"
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          required
          placeholder="Search your destination"
          maxLength={200}
        />
      </label>
      {url ? (
        <iframe
          title="Plan your route in Google Maps"
          className="map planner-map"
          src={url}
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div className="info-note">
          Configure Google Maps to see the route here. You can still enter
          addresses manually.
        </div>
      )}
      <p className="form-note">
        Search with a place name or full address. The map updates as you type;
        both addresses show a driving route. If Google shows multiple results,
        refine the address above. Check the route before starting.
      </p>
    </section>
  );
}

export function TripPlanner({
  vehicle,
  prefill = {},
  busy,
  api,
  config,
  onSubmit,
  onManual,
  hasActive,
}) {
  const [mode, setMode] = useState(hasActive ? "past" : "live"),
    [origin, setOrigin] = useState(prefill.origin || ""),
    [destination, setDestination] = useState(prefill.destination || ""),
    [start, setStart] = useState(prefill.start_odometer ?? vehicle.odometer),
    [end, setEnd] = useState(""),
    [photoNote, setPhotoNote] = useState("");
  const [startReading, setStartReading] = useState(false),
    [endReading, setEndReading] = useState(false);
  const estimate =
    end !== "" && +end >= +start
      ? ((+end - +start) / vehicle.mpg) * vehicle.fuel_price
      : null;
  return (
    <form
      className="modal-body form"
      onSubmit={(e) => {
        e.preventDefault();
        const b = Object.fromEntries(new FormData(e.currentTarget));
        b.start_odometer = +start;
        b.sharing = b.sharing === "on";
        if (mode === "past") {
          b.end_odometer = +end;
          b.started_at = new Date(b.started_at).toISOString();
          b.ended_at = new Date(b.ended_at).toISOString();
          onManual(b);
        } else onSubmit(b);
      }}
    >
      <div className="tabs">
        <button
          type="button"
          disabled={hasActive}
          className={mode === "live" ? "active" : ""}
          onClick={() => setMode("live")}
        >
          Drive now
        </button>
        <button
          type="button"
          className={mode === "past" ? "active" : ""}
          onClick={() => setMode("past")}
        >
          Record a past trip
        </button>
      </div>
      <RouteSearch
        origin={origin}
        destination={destination}
        setOrigin={setOrigin}
        setDestination={setDestination}
      />
      <label className="field">
        <span>Purpose</span>
        <select name="purpose" defaultValue={prefill.purpose || "Commute"}>
          {["Commute", "Errands", "Personal", "Road trip"].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <PhotoReading
        api={api}
        config={config}
        kind="odometer"
        onBusy={setStartReading}
        label="Starting odometer photo"
        onRead={(r) => {
          if (r.odometer != null) {
            setStart(r.odometer);
            setPhotoNote("Starting odometer filled from your photo.");
          } else
            setPhotoNote(
              "That looks like a receipt. Use Add expense to record a fuel purchase.",
            );
        }}
      />
      <label className="field">
        <span>Starting odometer (miles) · photo-filled or manual</span>
        <input
          required
          type="number"
          min={mode === "live" ? vehicle.odometer : 0}
          max="2000000"
          step="0.1"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </label>
      {photoNote && <p className="form-note">{photoNote}</p>}
      {mode === "past" && (
        <>
          <PhotoReading
            api={api}
            config={config}
            kind="odometer"
            onBusy={setEndReading}
            label="Ending odometer photo"
            onRead={(r) => {
              if (r.odometer != null) setEnd(r.odometer);
            }}
          />
          <label className="field">
            <span>Ending odometer (miles)</span>
            <input
              required
              type="number"
              min={start}
              max="2000000"
              step="0.1"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <div className="form-row">
            <label className="field">
              <span>Started (local time)</span>
              <input name="started_at" type="datetime-local" required />
            </label>
            <label className="field">
              <span>Finished (local time)</span>
              <input name="ended_at" type="datetime-local" required />
            </label>
          </div>
          <p className="form-note">
            No phone on the drive? Record the actual readings and times here.
            Current vehicle MPG and fuel price are used for this retrospective
            estimate. Overlapping trips are rejected.
          </p>
        </>
      )}
      <label className="check-label">
        <input name="sharing" type="checkbox" />
        <span>
          {mode === "live"
            ? "Share live location and route with co-owners"
            : "Share this past route with co-owners"}
          <small>
            Off by default. Your cost and distance are still visible.
          </small>
        </span>
      </label>
      <div className="info-note">
        {estimate != null
          ? `${(+end - +start).toFixed(1)} miles · ${money(estimate)} estimated fuel cost. `
          : ""}
        Using {vehicle.mpg} MPG and {money(vehicle.fuel_price)}/gallon. Costs
        and balances update automatically when the trip is completed.
      </div>
      <button
        className="btn"
        disabled={busy || startReading || endReading}
        type="submit"
      >
        <Navigation size={17} />
        {mode === "live" ? "Confirm & start drive" : "Confirm & save past trip"}
      </button>
    </form>
  );
}

export function FinishTrip({ trip, prefill, api, config, busy, onFinish }) {
  const [end, setEnd] = useState(prefill.end_odometer ?? "");
  const [reading, setReading] = useState(false);
  const distance = +end - trip.start_odometer;
  return (
    <section className="form finish-trip">
      <PhotoReading
        api={api}
        config={config}
        kind="odometer"
        onBusy={setReading}
        label="Finish with a dashboard photo"
        onRead={(r) => {
          if (r.odometer != null) setEnd(r.odometer);
        }}
      />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onFinish({ end_odometer: +end });
        }}
      >
        <label className="field">
          <span>Ending odometer (miles) · photo-filled or manual</span>
          <input
            required
            type="number"
            step="0.1"
            min={trip.start_odometer}
            max="2000000"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        {end !== "" && distance >= 0 && (
          <div className="info-note">
            <div>
              <strong>
                {distance.toFixed(1)} miles ·{" "}
                {money((distance / trip.mpg) * trip.fuel_price)} estimated fuel
              </strong>
              <p>
                Your vehicle odometer, trip history, and owner balance will
                update together.
              </p>
            </div>
          </div>
        )}
        <button
          className="btn"
          disabled={busy || reading || end === ""}
          type="submit"
        >
          <Check size={17} />
          Confirm & finish drive
        </button>
      </form>
    </section>
  );
}

export function ReceiptExpense({ api, config, initial = {}, busy, onSubmit }) {
  const [reading, setReading] = useState(false);
  const [amount, setAmount] = useState(initial.amount ?? ""),
    [category, setCategory] = useState(initial.category || "Fuel purchase"),
    [description, setDescription] = useState(initial.description || "");
  return (
    <div className="modal-body form">
      <PhotoReading
        api={api}
        config={config}
        kind="receipt_total"
        onBusy={setReading}
        label="Read a fuel receipt"
        onRead={(r) => {
          if (r.receipt_total != null) {
            setAmount(r.receipt_total);
            setCategory("Fuel purchase");
            setDescription("Fuel receipt");
          }
        }}
      />
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit({ description, category, amount: +amount });
        }}
      >
        <label className="field">
          <span>Description</span>
          <input
            required
            minLength="2"
            maxLength="140"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Amount paid (USD)</span>
          <input
            required
            type="number"
            min="0.01"
            max="100000"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {[
              "Fuel purchase",
              "Maintenance",
              "Insurance",
              "Parking",
              "Other",
            ].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <p className="form-note">
          Confirm the extracted amount. Saving automatically credits your
          payment and updates all owner balances.
        </p>
        <button className="btn" disabled={busy || reading}>
          Confirm & save expense
        </button>
      </form>
    </div>
  );
}
