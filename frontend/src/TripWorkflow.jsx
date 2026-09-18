import GoogleRouteSearch from "./GoogleRouteSearch.jsx";
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
          Read with Gemini (Google may use photos to improve its products).
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
          <Check size={16} /> Photo read. Check the numbers before saving.
        </p>
      )}
    </section>
  );
}

export function OdometerInput({
  label,
  value,
  onChange,
  min = 0,
  api,
  config,
  onBusy,
}) {
  const [photo, setPhoto] = useState(false);
  return (
    <div className="odometer-field">
      <label className="field">
        <span>{label} (miles)</span>
        <div className="odometer-control">
          <input
            aria-label={label}
            required
            type="number"
            inputMode="decimal"
            min={min}
            max="2000000"
            step="0.1"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Photo for ${label.toLowerCase()}`}
            aria-expanded={photo}
            onClick={() => setPhoto(!photo)}
          >
            <Camera size={20} />
          </button>
        </div>
      </label>
      <div hidden={!photo}>
        <PhotoReading
          api={api}
          config={config}
          kind="odometer"
          label={label + " photo"}
          onBusy={onBusy}
          onRead={(r) => onChange(r.odometer)}
        />
      </div>
    </div>
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
  owners = [],
  userId,
  compact = false,
}) {
  const [mode, setMode] = useState(hasActive ? "past" : "live");
  const [origin, setOrigin] = useState(prefill.origin || "");
  const [destination, setDestination] = useState(prefill.destination || "");
  const [start, setStart] = useState(
    prefill.start_odometer ?? vehicle.odometer,
  );
  const [end, setEnd] = useState("");
  const [selected, setSelected] = useState([userId]);
  const [readingStart, setReadingStart] = useState(false),
    [readingEnd, setReadingEnd] = useState(false);
  const [route, setRoute] = useState(false);
  const estimate =
    end !== "" && +end >= +start
      ? ((+end - +start) / vehicle.mpg) * vehicle.fuel_price
      : null;
  return (
    <form
      className="form trip-form"
      onSubmit={(e) => {
        e.preventDefault();
        const b = Object.fromEntries(new FormData(e.currentTarget));
        b.origin = origin.trim() || "Not specified";
        b.destination = destination.trim() || "Trip";
        b.purpose = b.purpose || "Personal";
        b.start_odometer = +start;
        b.sharing = b.sharing === "on" && selected.includes(userId);
        b.participant_ids = selected;
        if (mode === "past") {
          b.end_odometer = +end;
          b.started_at = new Date(b.started_at).toISOString();
          b.ended_at = new Date(b.ended_at).toISOString();
          onManual(b);
        } else onSubmit(b);
      }}
    >
      {!compact && (
        <div className="tabs">
          <button
            type="button"
            disabled={hasActive}
            className={mode === "live" ? "active" : ""}
            onClick={() => setMode("live")}
          >
            Start trip
          </button>
          <button
            type="button"
            className={mode === "past" ? "active" : ""}
            onClick={() => setMode("past")}
          >
            Past trip
          </button>
        </div>
      )}
      <OdometerInput
        label="Starting odometer"
        value={start}
        onChange={setStart}
        min={mode === "live" ? vehicle.odometer : 0}
        api={api}
        config={config}
        onBusy={setReadingStart}
      />
      {mode === "past" && (
        <>
          <OdometerInput
            label="Ending odometer"
            value={end}
            onChange={setEnd}
            min={start}
            api={api}
            config={config}
            onBusy={setReadingEnd}
          />
          <details open>
            <summary>Trip dates</summary>
            <div className="form-row">
              <label className="field">
                <span>Started</span>
                <input name="started_at" type="datetime-local" required />
              </label>
              <label className="field">
                <span>Finished</span>
                <input name="ended_at" type="datetime-local" required />
              </label>
            </div>
          </details>
        </>
      )}
      <fieldset className="riders">
        <legend>Who’s riding?</legend>
        <div className="rider-options">
          {owners.map((o) => (
            <label
              key={o.id}
              className={selected.includes(o.id) ? "rider selected" : "rider"}
            >
              <input
                type="checkbox"
                checked={selected.includes(o.id)}
                onChange={(e) =>
                  setSelected(
                    e.target.checked
                      ? [...selected, o.id]
                      : selected.filter((id) => id !== o.id),
                  )
                }
              />
              {o.id === userId ? "You" : o.name}
            </label>
          ))}
        </div>
        <small>
          {selected.length
            ? `Fuel cost split equally between ${selected.length} ${selected.length === 1 ? "person" : "people"}.`
            : "Select at least one rider."}
        </small>
      </fieldset>
      {!compact && (
        <details onToggle={(e) => setRoute(e.currentTarget.open)}>
          <summary>Map, destination & privacy</summary>
          {route && (
            <GoogleRouteSearch
              origin={origin}
              destination={destination}
              setOrigin={setOrigin}
              setDestination={setDestination}
            />
          )}
          <label className="field">
            <span>Purpose</span>
            <select name="purpose" defaultValue={prefill.purpose || "Personal"}>
              {["Commute", "Errands", "Personal", "Road trip"].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label className="check-label">
            <input
              name="sharing"
              type="checkbox"
              disabled={!selected.includes(userId)}
            />
            <span>Share route and live location with co-owners</span>
          </label>
        </details>
      )}
      <p className="form-note">
        {vehicle.mpg} MPG · {money(vehicle.fuel_price)}/gal
        {estimate !== null ? ` · ${money(estimate)} estimated fuel` : ""}
      </p>
      <button
        className="btn"
        disabled={busy || readingStart || readingEnd || selected.length === 0}
      >
        {mode === "past" ? "Save trip" : "Start trip"}
      </button>
    </form>
  );
}

export function FinishTrip({
  trip,
  prefill = {},
  api,
  config,
  busy,
  onFinish,
}) {
  const [end, setEnd] = useState(prefill.end_odometer ?? ""),
    [mpg, setMpg] = useState(prefill.mpg ?? ""),
    [reading, setReading] = useState(false);
  const distance = +end - trip.start_odometer;
  const tripMpg = mpg === "" ? trip.mpg : +mpg;
  const cost = Math.round((distance / tripMpg) * trip.fuel_price * 100);
  const riders = trip.participants || [
    { user_id: trip.user_id, name: trip.driver },
  ];
  return (
    <form
      className="form finish-trip"
      onSubmit={(e) => {
        e.preventDefault();
        onFinish({ end_odometer: +end, ...(mpg === "" ? {} : { mpg: +mpg }) });
      }}
    >
      <OdometerInput
        label="Ending odometer"
        value={end}
        onChange={setEnd}
        min={trip.start_odometer}
        api={api}
        config={config}
        onBusy={setReading}
      />
      <label className="field">
        <span>Fuel economy for this trip (optional MPG)</span>
        <input type="number" min="0.1" max="200" step="0.1" placeholder={`Default: ${trip.mpg} MPG`} value={mpg} onChange={(e) => setMpg(e.target.value)} />
      </label>
      {end !== "" && distance >= 0 && tripMpg > 0 && tripMpg <= 200 && (
        <div className="cost-preview">
          <strong>{money(cost / 100)}</strong>
          <span>{distance.toFixed(1)} miles · estimated fuel</span>
          {riders.map((p, i) => (
            <small key={p.user_id}>
              {p.name}:{" "}
              {money(
                (Math.floor(cost / riders.length) +
                  (i < cost % riders.length ? 1 : 0)) /
                  100,
              )}
            </small>
          ))}
        </div>
      )}
      <button className="btn" disabled={busy || reading || end === ""}>
        End trip & save
      </button>
    </form>
  );
}

export function ReceiptExpense({ api, config, owners, userId, initial = {}, busy, onSubmit }) {
  const [reading, setReading] = useState(false);
  const [payer, setPayer] = useState(String(userId));
  const [amount, setAmount] = useState(initial.amount ?? ""),
    [category, setCategory] = useState(initial.category || "Fuel purchase"),
    [description, setDescription] = useState(initial.description || "");
  return (
    <form className="modal-body form" onSubmit={(e) => {
      e.preventDefault();
      onSubmit({ payer_id: Number(payer), description: description.trim() || category, category, amount: +amount });
    }}>
      <label className="field"><span>Paid by</span>
        <select value={payer} onChange={e => setPayer(e.target.value)}>
          {owners.map(o => <option key={o.id} value={o.id}>{o.id === userId ? `${o.name} (you)` : o.name}</option>)}
        </select>
      </label>
      <label className="field"><span>Amount paid (USD)</span>
        <input required type="number" min="0.01" max="100000" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
      </label>
      <details>
        <summary>Optional details & receipt</summary>
        <div className="form">
          <label className="field"><span>Category</span>
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {["Fuel purchase", "Maintenance", "Insurance", "Parking", "Other"].map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="field"><span>Description (optional)</span>
            <input minLength="2" maxLength="140" value={description} onChange={e => setDescription(e.target.value)} />
          </label>
          <PhotoReading api={api} config={config} kind="receipt_total" onBusy={setReading} label="Read a fuel receipt" onRead={r => {
            if (r.receipt_total != null) { setAmount(r.receipt_total); setCategory("Fuel purchase"); setDescription("Fuel receipt"); }
          }} />
        </div>
      </details>
      <button className="btn" disabled={busy || reading}>Save expense</button>
    </form>
  );
}
