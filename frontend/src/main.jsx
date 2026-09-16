import { PaymentForm, PaymentHistory, RemovedEntries } from "./Payments.jsx";
import { GoogleEmbed } from "./GoogleRouteSearch.jsx";
import {
  TripPlanner,
  FinishTrip,
  ReceiptExpense,
  PhotoReading,
} from "./TripWorkflow.jsx";
import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Car,
  LayoutDashboard,
  Route,
  Wallet,
  Users,
  CalendarDays,
  Settings,
  Bell,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronDown,
  Navigation,
  Fuel,
  Gauge,
  MapPin,
  ShieldCheck,
  EyeOff,
  Camera,
  X,
  LogOut,
  Check,
  Clock,
  Menu,
  RefreshCw,
  Copy,
  Sparkles,
  LoaderCircle,
  Download,
  Trash2,
  Leaf,
} from "lucide-react";
import "./styles.css";

const money = (c) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    c / 100,
  );
const number = (n) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n || 0);
const date = (d) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const initials = (n) =>
  n
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
async function api(path, method = "GET", body) {
  const res = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", "X-CoDrive": "1" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res
    .json()
    .catch(() => ({ detail: "The server could not complete your request." }));
  if (!res.ok)
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : Array.isArray(data.detail)
          ? data.detail.map((d) => `${d.loc.at(-1)}: ${d.msg}`).join(". ")
          : "Something went wrong.",
    );
  return data;
}
const Button = ({ children, variant = "", ...props }) => (
  <button className={"btn " + variant} {...props}>
    {children}
  </button>
);
const Field = ({ label, children, ...props }) => (
  <label className="field">
    <span>{label}</span>
    {children || <input {...props} />}
  </label>
);
function Modal({ title, subtitle, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement;
    const d = ref.current;
    d.showModal();
    return () => {
      d.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button
          className="icon-btn"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [me, setMe] = useState(null),
    [data, setData] = useState(null),
    [vid, setVid] = useState(null),
    [config, setConfig] = useState({}),
    [boot, setBoot] = useState(true),
    [page, setPage] = useState("Dashboard"),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All trips"),
    [geoError, setGeoError] = useState("");
  const [prefill, setPrefill] = useState({});
  const noticeRef = useRef(null),
    watchRef = useRef(null),
    lastPosition = useRef(0);
  const refresh = async (selected = vid) => {
    const m = await api("/me");
    setMe(m);
    const id =
      selected && m.vehicles.some((v) => v.id === selected)
        ? selected
        : m.vehicles[0]?.id;
    setVid(id || null);
    if (id) setData(await api("/vehicles/" + id));
    else setData(null);
  };
  useEffect(() => {
    api("/config")
      .then(setConfig)
      .catch(() => {});
    refresh()
      .catch((e) => {
        if (!e.message.includes("sign in")) setError(e.message);
      })
      .finally(() => setBoot(false));
  }, []);
  useEffect(() => {
    if (!vid) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const d = await api("/vehicles/" + vid);
        if (!cancelled) {
          setData(d);
          const latest = d.notifications[0]?.id;
          if (noticeRef.current !== null && latest > noticeRef.current)
            setToast(d.notifications[0].message);
          noticeRef.current = latest;
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
      noticeRef.current = null;
    };
  }, [vid]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 6500);
    return () => clearTimeout(id);
  }, [toast]);
  const active = data?.trips.find((t) => !t.ended_at),
    mine = active?.user_id === me?.user.id;
  useEffect(() => {
    if (
      !active ||
      !mine ||
      !active.sharing ||
      !active.participants?.some((p) => p.user_id === me?.user.id)
    )
      return;
    if (!navigator.geolocation) {
      setGeoError("This browser does not support location sharing.");
      return;
    }
    let live = true;
    setGeoError("");
    watchRef.current = navigator.geolocation.watchPosition(
      (p) => {
        if (!live || Date.now() - lastPosition.current < 10000) return;
        lastPosition.current = Date.now();
        api(`/trips/${active.id}/location`, "POST", {
          latitude: p.coords.latitude,
          longitude: p.coords.longitude,
        })
          .then(() => {
            if (live) setGeoError("");
          })
          .catch((e) => {
            if (live) setGeoError(e.message);
          });
      },
      (e) => {
        if (live)
          setGeoError(
            e.code === 1
              ? "Location permission was denied. Enable it in browser settings, or switch to private travel."
              : "Waiting for a GPS signal. Keep the app open.",
          );
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => {
      live = false;
      navigator.geolocation.clearWatch(watchRef.current);
      lastPosition.current = 0;
    };
  }, [active?.id, active?.sharing, mine]);
  async function run(action, success, close = true) {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      await refresh(result?.vehicleId || vid);
      if (close) setModal(null);
      if (success) setToast(success);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function open(type, values = {}) {
    setError("");
    setPrefill(values);
    setModal(type);
  }
  function nav(p) {
    setPage(p);
    setMobile(false);
    setError("");
  }
  if (boot)
    return (
      <div className="loading">
        <div className="brand">
          <span className="brand-mark">
            <Car />
          </span>
          CoDrive
        </div>
        <LoaderCircle className="spin" /> Opening your garage…
      </div>
    );
  if (!me)
    return (
      <Auth
        config={config}
        error={error}
        busy={busy}
        onSubmit={(path, body) =>
          run(() => api(path, "POST", body), "Welcome to CoDrive.")
        }
        onDemo={() =>
          run(() => api("/demo", "POST"), "Your sample garage is ready.")
        }
      />
    );
  const v = data?.vehicle,
    owners = data?.owners || [],
    trips = data?.trips || [],
    done = trips.filter((t) => t.ended_at),
    totalMiles = owners.reduce((s, o) => s + o.miles, 0),
    totalFuel = owners.reduce((s, o) => s + o.fuel_cents, 0),
    myOwner = owners.find((o) => o.id === me.user.id),
    nowDate = new Date();
  const navItems = [
    [LayoutDashboard, "Dashboard"],
    [Route, "Trips"],
    [Wallet, "Expenses"],
    [Users, "Co-owners"],
    [CalendarDays, "Schedule"],
  ];
  const visibleTrips = trips.filter(
    (t) =>
      (filter !== "My trips" || t.user_id === me.user.id) &&
      (filter !== "Private trips" || !t.sharing) &&
      `${t.origin} ${t.destination} ${t.driver} ${t.purpose}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const canRemove = (row) =>
    row.user_id === me.user.id || v.created_by === me.user.id;
  const askRemove = (kind, id) => open("remove", { kind, id });
  const restoreRecord = (kind, id) =>
    run(
      () => api(`/records/${kind}/${id}`, "PATCH", { deleted: false }),
      "Entry restored. Balances updated.",
    );
  const tripTable = (rows) => (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>TRIP & DESTINATION</th>
            <th>RECORDED BY</th>
            <th>DISTANCE</th>
            <th>
              FUEL COST{" "}
              <span title="Estimated from miles / MPG × saved fuel price">
                ⓘ
              </span>
            </th>
            <th>DATE</th>
            <th>TYPE</th>
            <th>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td>
                <div
                  className={
                    "trip-icon " + t.purpose.toLowerCase().replace(" ", "")
                  }
                >
                  <Route size={17} />
                </div>
                <div className="trip-name">
                  <strong>{t.destination}</strong>
                  <small>
                    {t.origin} <ArrowRight size={11} /> {t.destination}
                  </small>
                </div>
              </td>
              <td>
                <span className={"avatar tiny color" + (t.user_id % 3)}>
                  {initials(t.driver)}
                </span>{" "}
                {t.user_id === me.user.id ? "You" : t.driver.split(" ")[0]}
              </td>
              <td>
                {t.ended_at ? (
                  number(t.end_odometer - t.start_odometer) + " mi"
                ) : (
                  <span className="status">In progress</span>
                )}
              </td>
              <td>
                <strong>{t.ended_at ? money(t.cost_cents) : "—"}</strong>
                <small className="trip-shares">
                  {t.participants
                    .map((p) => `${p.name}: ${money(p.cost_cents)}`)
                    .join(" · ")}
                </small>
              </td>
              <td>{date(t.started_at)}</td>
              <td>
                <span
                  className={"pill " + t.purpose.toLowerCase().replace(" ", "")}
                >
                  {t.purpose}
                </span>
                {!t.sharing && <EyeOff size={13} className="private-icon" />}
              </td>
              <td>
                {t.ended_at && canRemove(t) && (
                  <button
                    className="text-btn"
                    onClick={() => askRemove("trips", t.id)}
                  >
                    Delete trip
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <Empty
          icon={Route}
          title="No trips yet"
          text="Start a drive to keep your distance and costs in one place."
        />
      )}
    </div>
  );
  return (
    <div className="app-shell">
      <aside className={mobile ? "sidebar open" : "sidebar"}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            nav("Dashboard");
          }}
        >
          <span className="brand-mark">
            <Car size={24} />
          </span>
          CoDrive<span className="brand-dot">.</span>
        </a>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav>
          {navItems.map(([Icon, label]) => (
            <button
              key={label}
              className={page === label ? "nav-item selected" : "nav-item"}
              onClick={() => nav(label)}
            >
              <Icon size={19} />
              {label}
              {label === "Trips" && active && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={page === "Settings" ? "nav-item selected" : "nav-item"}
            onClick={() => nav("Settings")}
          >
            <Settings size={19} />
            Settings & integrations
          </button>
          <div className="profile">
            <span className="avatar">{initials(me.user.name)}</span>
            <div>
              <strong>{me.user.name}</strong>
              <small>
                {me.user.email.endsWith("@demo.invalid")
                  ? "Demo workspace"
                  : "Personal account"}
              </small>
            </div>
            <button
              className="icon-btn"
              title="Sign out"
              aria-label="Sign out"
              onClick={async () => {
                try {
                  await api("/auth/logout", "POST");
                  setMe(null);
                  setData(null);
                  setVid(null);
                  setError("");
                } catch (e) {
                  setError(e.message);
                }
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          className="scrim"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="today">
              <CalendarDays size={15} />
              {nowDate.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <button
              className="notification-btn"
              aria-label="Open notifications"
              onClick={() => open("notifications")}
            >
              <Bell size={19} />
              {data?.notifications.length > 0 && <i />}
            </button>
            <span className="avatar small">{initials(me.user.name)}</span>
          </div>
        </header>
        <main>
          {error && !modal && (
            <div className="error" role="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!v ? (
            <>
              <div className="page-heading">
                <div>
                  <h1>Your vehicles</h1>
                </div>
              </div>
              <div className="onboarding-grid">
                <div className="card onboarding">
                  <Car size={40} />
                  <h2>Add a vehicle</h2>
                  <p>
                    Set up a shared vehicle with its current odometer, fuel
                    economy, and pump price.
                  </p>
                  <Button onClick={() => open("vehicle")}>
                    <Plus size={17} />
                    Add a vehicle
                  </Button>
                </div>
                <div className="card onboarding">
                  <Users size={40} />
                  <h2>Join a vehicle</h2>
                  <p>
                    Already sharing a car? Use the invitation code from your
                    garage creator.
                  </p>
                  <Button variant="secondary" onClick={() => open("join")}>
                    Join a garage
                    <ArrowRight size={17} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <h1>{page === "Dashboard" ? "Dashboard" : page}</h1>
                </div>
                <div className="heading-actions">
                  {page === "Trips" ? (
                    <Button onClick={() => open("trip")}>
                      <Plus size={18} />
                      {active ? "Record a past trip" : "Start a trip"}
                    </Button>
                  ) : page === "Expenses" ? (
                    <Button onClick={() => open("expense")}>
                      <Plus size={18} />
                      Add expense
                    </Button>
                  ) : page === "Schedule" ? (
                    <Button onClick={() => open("routine")}>
                      <Plus size={18} />
                      Add routine
                    </Button>
                  ) : page === "Co-owners" && v.invite ? (
                    <Button onClick={() => open("invite")}>
                      <Plus size={18} />
                      Invite co-owner
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="vehicle-status-row">
                <strong aria-label="Current vehicle mileage">
                  {number(v.odometer)} <span>mi</span>
                </strong>
                <span className={"availability " + (active ? "driving" : "")}>
                  <i />
                  {active ? "In use" : "Available"}
                </span>
                <button className="text-btn" onClick={() => open("details")}>
                  Vehicle details
                </button>
              </div>
              {active && page !== "Dashboard" && (
                <div className="live-banner">
                  <span className="live-pulse" />
                  <div>
                    <strong>
                      {mine
                        ? "Your recorded trip is in progress"
                        : "Trip recorded by " + active.driver}
                    </strong>
                    <small>
                      {active.sharing
                        ? `${active.origin} → ${active.destination}`
                        : "Private travel · costs are still shared"}
                    </small>
                  </div>
                  <Button variant="secondary" onClick={() => open("drive")}>
                    {mine ? "Manage drive" : "View drive"}
                    <ArrowRight size={16} />
                  </Button>
                </div>
              )}
              {page === "Dashboard" && (
                <div className="simple-dashboard">
                  <div className="balance-strip">
                    <div>
                      <span>Your balance</span>
                      <strong>{money(myOwner?.balance_cents || 0)}</strong>
                      <small>
                        {(myOwner?.balance_cents || 0) < 0
                          ? "Credit"
                          : "Estimated costs less payments"}
                      </small>
                    </div>
                    <div>
                      <span>Your fuel share</span>
                      <strong>{money(myOwner?.fuel_cents || 0)}</strong>
                    </div>
                  </div>
                  <section className="card trip-entry">
                    <h2>
                      {active
                        ? mine
                          ? "End trip"
                          : `Trip recorded by ${active.driver}`
                        : "Start trip"}
                    </h2>
                    {!active ? (
                      <TripPlanner
                        key={v.id}
                        compact
                        owners={owners}
                        userId={me.user.id}
                        vehicle={v}
                        api={api}
                        config={config}
                        busy={busy}
                        onSubmit={(b) =>
                          run(
                            () => api(`/vehicles/${vid}/trips`, "POST", b),
                            "Trip started.",
                          )
                        }
                        onManual={(b) =>
                          run(
                            () =>
                              api(`/vehicles/${vid}/trips/manual`, "POST", b),
                            "Trip saved.",
                          )
                        }
                      />
                    ) : mine ? (
                      <>
                        <p>
                          Starting odometer:{" "}
                          <strong>{number(active.start_odometer)} mi</strong>
                        </p>
                        <p>
                          Split between{" "}
                          {active.participants.map((p) => p.name).join(", ")}
                        </p>
                        <FinishTrip
                          key={active.id}
                          trip={active}
                          prefill={{}}
                          api={api}
                          config={config}
                          busy={busy}
                          onFinish={(b) =>
                            run(
                              () =>
                                api(`/trips/${active.id}/finish`, "POST", b),
                              "Trip finished. Costs updated.",
                            )
                          }
                        />
                      </>
                    ) : (
                      <p>
                        Starting odometer: {number(active.start_odometer)} mi
                      </p>
                    )}
                    <div className="dashboard-actions">
                      <button
                        className="text-btn"
                        onClick={() => open(active ? "drive" : "trip")}
                      >
                        {active ? "Map & trip options" : "Map & past trips"}
                      </button>
                    </div>
                  </section>
                  <div>
                    <Button variant="secondary" onClick={() => open("expense")}>
                      <Plus size={18} />
                      Add expense
                    </Button>
                  </div>
                  <section className="card simple-history">
                    <div className="card-heading">
                      <h2>Recent trips</h2>
                      <button className="text-btn" onClick={() => nav("Trips")}>
                        View all
                      </button>
                    </div>
                    {done.slice(0, 4).map((t) => (
                      <div className="trip-summary" key={t.id}>
                        <div>
                          <strong>
                            {t.destination === "Trip"
                              ? t.driver
                              : t.destination}
                          </strong>
                          <small>
                            {number(t.start_odometer)} →{" "}
                            {number(t.end_odometer)} mi · {date(t.started_at)}
                          </small>
                          <small>
                            {t.participants
                              .map((p) => `${p.name}: ${money(p.cost_cents)}`)
                              .join(" · ")}
                          </small>
                        </div>
                        <div>
                          <strong>{money(t.cost_cents)}</strong>
                          <small>
                            {number(t.end_odometer - t.start_odometer)} mi
                          </small>
                        </div>
                      </div>
                    ))}
                    {!done.length && <p>No completed trips.</p>}
                  </section>
                </div>
              )}
              {page === "Trips" && (
                <section className="card">
                  <div className="toolbar">
                    <div className="tabs">
                      {["All trips", "My trips", "Private trips"].map((x) => (
                        <button
                          key={x}
                          className={filter === x ? "active" : ""}
                          onClick={() => setFilter(x)}
                        >
                          {x}
                        </button>
                      ))}
                    </div>
                    <input
                      aria-label="Search trips"
                      placeholder="Search destination or driver…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => exportTrips(visibleTrips)}
                    >
                      <Download size={16} />
                      Export
                    </Button>
                  </div>
                  {tripTable(visibleTrips)}
                </section>
              )}
              {page === "Expenses" && (
                <>
                  <PaymentHistory
                    payments={data.payments || []}
                    canRemove={canRemove}
                    onRemove={askRemove}
                    onAdd={() => open("payment")}
                  />
                  <div className="stats-grid three">
                    <Stat
                      label="Estimated fuel used"
                      value={money(totalFuel)}
                      icon={Fuel}
                      note="Charged to the person driving"
                      color="mint"
                    />
                    <Stat
                      label="Purchases recorded"
                      value={money(
                        data.expenses.reduce((s, e) => s + e.amount_cents, 0),
                      )}
                      icon={Wallet}
                      note="Credited to the person paying"
                      color="peach"
                    />
                    <Stat
                      label="Your net balance"
                      value={money(myOwner.balance_cents)}
                      icon={Users}
                      note="Negative means credit carried forward"
                      color="lavender"
                    />
                  </div>
                  <div className="info-note">
                    <ShieldCheck size={21} />
                    <p>
                      <strong>Simple, transparent math.</strong> Fuel use =
                      miles ÷ MPG × saved price. Other expenses are split
                      equally among owners at the time of entry. Fuel purchases
                      give the payer credit. Direct payments reduce the sender’s
                      balance and increase the recipient’s. Balances are
                      estimates, not payment requests; unused fuel credit
                      carries forward.
                    </p>
                  </div>
                  <section className="card">
                    <div className="card-heading">
                      <h2>Owner balances</h2>
                      <span className="subtle-tag">All time · USD</span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>CO-OWNER</th>
                            <th>FUEL USED (EST.)</th>
                            <th>SHARED EXPENSES</th>
                            <th>PURCHASES PAID</th>
                            <th>PAYMENTS SENT</th>
                            <th>RECEIVED</th>
                            <th>NET BALANCE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {owners.map((o) => (
                            <tr key={o.id}>
                              <td>
                                <span className="avatar tiny">
                                  {initials(o.name)}
                                </span>
                                {o.name}
                              </td>
                              <td>{money(o.fuel_cents)}</td>
                              <td>{money(o.shared_cents)}</td>
                              <td>{money(o.paid_cents)}</td>
                              <td>{money(o.sent_cents || 0)}</td>
                              <td>{money(o.received_cents || 0)}</td>
                              <td>
                                <strong>{money(o.balance_cents)}</strong>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <section className="card section-gap">
                    <div className="card-heading">
                      <h2>Expense journal</h2>
                      <Button
                        variant="secondary"
                        onClick={() => open("expense")}
                      >
                        <Plus size={16} />
                        Add expense
                      </Button>
                    </div>
                    {data.expenses.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>DESCRIPTION</th>
                              <th>PAID BY</th>
                              <th>CATEGORY</th>
                              <th>AMOUNT</th>
                              <th>DATE</th>
                              <th>ACTIONS</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.expenses.map((e) => (
                              <tr key={e.id}>
                                <td>
                                  <strong>{e.description}</strong>
                                </td>
                                <td>{e.payer}</td>
                                <td>
                                  <span className="pill">{e.category}</span>
                                </td>
                                <td>{money(e.amount_cents)}</td>
                                <td>{date(e.created_at)}</td>
                                <td>
                                  {canRemove(e) && (
                                    <button
                                      className="text-btn"
                                      onClick={() =>
                                        askRemove("expenses", e.id)
                                      }
                                    >
                                      Delete expense
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        icon={Wallet}
                        title="A clean slate"
                        text="Add fuel receipts, maintenance, insurance, and other shared costs."
                      />
                    )}
                  </section>
                </>
              )}
              {["Trips", "Expenses"].includes(page) && (
                <RemovedEntries
                  entries={data.removed || []}
                  busy={busy}
                  onRestore={restoreRecord}
                />
              )}
              {page === "Co-owners" && (
                <div className="owners-grid">
                  {owners.map((o, i) => (
                    <section className="card owner-card" key={o.id}>
                      <span className={"avatar large color" + i}>
                        {initials(o.name)}
                      </span>
                      <span className="subtle-tag">
                        {o.id === v.created_by ? "Garage creator" : "Co-owner"}
                      </span>
                      <h2>
                        {o.name}
                        {o.id === me.user.id ? " (you)" : ""}
                      </h2>
                      <p>Sharing the road since joining this garage</p>
                      <div className="owner-metrics">
                        <div>
                          <strong>{number(o.miles)}</strong>
                          <small>Miles driven</small>
                        </div>
                        <div>
                          <strong>{o.trip_count}</strong>
                          <small>Trips taken</small>
                        </div>
                        <div>
                          <strong>{money(o.balance_cents)}</strong>
                          <small>Net balance</small>
                        </div>
                      </div>
                    </section>
                  ))}
                  {v.invite && (
                    <button
                      className="invite-card"
                      onClick={() => open("invite")}
                    >
                      <Plus size={28} />
                      <h3>Room for one more?</h3>
                      <p>Invite someone to your shared garage</p>
                    </button>
                  )}
                </div>
              )}
              {page === "Schedule" && (
                <>
                  <div className="info-note">
                    <CalendarDays size={20} />
                    <p>
                      Routines are reusable plans in your local time. They never
                      start a trip or charge anyone automatically. The driver
                      confirms actual odometer readings.
                    </p>
                  </div>
                  <div className="routine-grid">
                    {data.routines.map((r) => (
                      <section className="card routine-card" key={r.id}>
                        <div className="card-heading">
                          <span className="round-icon">
                            <CalendarDays />
                          </span>
                          {r.user_id === me.user.id && (
                            <button
                              className="icon-btn"
                              aria-label="Delete routine"
                              onClick={() =>
                                run(
                                  () => api("/routines/" + r.id, "DELETE"),
                                  "Routine removed.",
                                )
                              }
                            >
                              <Trash2 size={17} />
                            </button>
                          )}
                        </div>
                        <span className="pill commute">{r.purpose}</span>
                        <h2>
                          {r.origin} <ArrowRight size={18} /> {r.destination}
                        </h2>
                        <p>
                          {r.driver} · {r.time}
                        </p>
                        <div className="day-row">
                          {[
                            "Mon",
                            "Tue",
                            "Wed",
                            "Thu",
                            "Fri",
                            "Sat",
                            "Sun",
                          ].map((d) => (
                            <span
                              key={d}
                              className={r.days.includes(d) ? "on" : ""}
                            >
                              {d[0]}
                            </span>
                          ))}
                        </div>
                        <div className="routine-foot">
                          <span>
                            {number(r.miles)} mi · ~
                            {money((r.miles / v.mpg) * v.fuel_price * 100)}
                          </span>
                          <Button
                            variant="secondary"
                            disabled={!!active || r.user_id !== me.user.id}
                            onClick={() => open("trip", r)}
                          >
                            Start drive
                            <ArrowRight size={15} />
                          </Button>
                        </div>
                      </section>
                    ))}
                  </div>
                  {!data.routines.length && (
                    <section className="card">
                      <Empty
                        icon={CalendarDays}
                        title="Find your rhythm"
                        text="Create a routine for work, school, or the weekly grocery run."
                      />
                    </section>
                  )}
                </>
              )}
              {page === "Settings" && (
                <SettingsPage
                  vehicle={v}
                  config={config}
                  busy={busy}
                  save={(body) =>
                    run(
                      () => api("/vehicles/" + vid, "PATCH", body),
                      "Vehicle preferences saved.",
                      false,
                    )
                  }
                  open={open}
                />
              )}
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            {
              payment: "Record a payment to another owner",
              remove: "Delete this entry?",
              trip: "Trip options",
              details: "Vehicle details",
              expense: "Record a shared expense",
              vehicle: "Add your vehicle",
              join: "Join a shared garage",
              routine: "Build your everyday route",
              scan: "A photo. A little AI. Your confirmation.",
              drive: mine ? "Current trip" : "Current trip",
              invite: "Good things are better shared",
              notifications: "Your garage activity",
            }[modal]
          }
          subtitle={
            {
              trip: "Confirm your odometer and choose what you share.",
              expense: "Record what you paid. We’ll do the fair-share math.",
              scan: "Gemini readings are suggestions. Always check the original photo.",
            }[modal]
          }
          onClose={() => setModal(null)}
        >
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {modal === "payment" && (
            <PaymentForm
              owners={owners}
              userId={me.user.id}
              busy={busy}
              onSubmit={(body) =>
                run(
                  () => api(`/vehicles/${vid}/payments`, "POST", body),
                  "Payment recorded. Both owner balances updated.",
                )
              }
            />
          )}
          {modal === "remove" && (
            <div className="modal-body form">
              <p>
                This removes the entry from totals and recalculates everyone’s
                balance. You can restore it from Deleted entries.
              </p>
              {prefill.kind === "trips" && (
                <p>
                  The vehicle’s current odometer will not change. If the reading
                  was wrong too, correct it in Vehicle details after removing
                  the trip.
                </p>
              )}
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(
                    () =>
                      api(`/records/${prefill.kind}/${prefill.id}`, "PATCH", {
                        deleted: true,
                      }),
                    "Entry deleted. You can restore it from Deleted entries.",
                  )
                }
              >
                Delete entry
              </button>
              <button className="btn secondary" onClick={() => setModal(null)}>
                Keep entry
              </button>
            </div>
          )}
          {modal === "vehicle" && (
            <DataForm
              busy={busy}
              submit="Create shared garage"
              fields={[
                ["name", "Vehicle name", "text", "2022 Toyota RAV4"],
                ["plate", "License plate", "text", "IL · CD 2048"],
                ["odometer", "Current odometer (miles)", "number", "28460"],
                ["mpg", "Fuel economy (US MPG)", "number", "30"],
                [
                  "fuel_price",
                  "Fuel price (USD / US gallon)",
                  "number",
                  "3.65",
                ],
              ]}
              onSubmit={(b) =>
                run(
                  async () => ({
                    vehicleId: (await api("/vehicles", "POST", b)).id,
                  }),
                  "Your garage is ready.",
                )
              }
            />
          )}
          {modal === "details" && (
            <>
              <div className="modal-body vehicle-summary">
                <strong>{v.name}</strong>
                {me.vehicles.length > 1 && (
                  <label className="field">
                    <span>Switch vehicle</span>
                    <select
                      aria-label="Select vehicle"
                      value={vid}
                      onChange={(e) => {
                        setModal(null);
                        setVid(+e.target.value);
                        setData(null);
                      }}
                    >
                      {me.vehicles.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <span>
                  {v.plate} · {owners.length} co-owners · {number(v.odometer)}{" "}
                  mi
                </span>
              </div>
              <DataForm
                initial={v}
                busy={busy}
                submit="Save vehicle details"
                fields={[
                  ["name", "Vehicle name", "text"],
                  ["plate", "License plate", "text"],
                  ["odometer", "Current odometer (miles)", "number"],
                  ["mpg", "Fuel economy (US MPG)", "number"],
                  ["fuel_price", "Fuel price (USD / gallon)", "number"],
                ]}
                note="Changes to fuel economy and price apply to future trips. Existing trip charges stay unchanged."
                onSubmit={(b) =>
                  run(
                    () => api("/vehicles/" + vid + "/details", "PATCH", b),
                    "Vehicle details updated.",
                  )
                }
              />
            </>
          )}
          {modal === "join" && (
            <DataForm
              busy={busy}
              submit="Join garage"
              fields={[
                [
                  "code",
                  "Invitation code",
                  "text",
                  "Paste the code from your garage creator",
                ],
              ]}
              onSubmit={(b) =>
                run(
                  async () => ({
                    vehicleId: (await api("/vehicles/join", "POST", b)).id,
                  }),
                  "You joined the garage.",
                )
              }
            />
          )}
          {modal === "trip" && (
            <TripPlanner
              owners={owners}
              userId={me.user.id}
              api={api}
              config={config}
              hasActive={!!active}
              onManual={(b) =>
                run(
                  () => api("/vehicles/" + vid + "/trips/manual", "POST", b),
                  "Past trip saved. Mileage and balances updated.",
                )
              }
              vehicle={v}
              prefill={prefill}
              busy={busy}
              onSubmit={(b) =>
                run(
                  () => api("/vehicles/" + vid + "/trips", "POST", b),
                  "Trip started. Your co-owners have been notified.",
                )
              }
              onScan={() => open("scan")}
            />
          )}
          {modal === "expense" && (
            <ReceiptExpense
              api={api}
              config={config}
              initial={prefill}
              busy={busy}
              onSubmit={(b) =>
                run(
                  () => api("/vehicles/" + vid + "/expenses", "POST", b),
                  "Expense recorded. Balances updated.",
                )
              }
            />
          )}
          {modal === "routine" && (
            <RoutineForm
              busy={busy}
              onSubmit={(b) =>
                run(
                  () => api("/vehicles/" + vid + "/routines", "POST", b),
                  "Your routine is ready.",
                )
              }
            />
          )}
          {modal === "scan" && (
            <ScanForm
              config={config}
              onUse={(r) => {
                if (r.receipt_total != null)
                  open("expense", {
                    amount: r.receipt_total,
                    category: "Fuel purchase",
                    description: "Fuel receipt",
                  });
                else if (r.odometer != null) {
                  if (active && mine)
                    open("drive", { end_odometer: r.odometer });
                  else if (!active)
                    open("trip", { start_odometer: r.odometer });
                  else
                    setToast(
                      "Reading: " +
                        r.odometer +
                        " miles. The current driver must finish their trip.",
                    );
                }
              }}
            />
          )}
          {modal === "drive" && active && (
            <DrivePanel
              config={config}
              trip={active}
              mine={mine}
              busy={busy}
              geoError={geoError}
              prefill={prefill}
              onPrivacy={(sharing) =>
                run(
                  () =>
                    api("/trips/" + active.id + "/privacy", "PATCH", {
                      sharing,
                    }),
                  sharing
                    ? "Location sharing enabled."
                    : "Location sharing stopped and saved coordinates cleared.",
                  false,
                )
              }
              onFinish={(body) =>
                run(
                  () => api("/trips/" + active.id + "/finish", "POST", body),
                  "Trip completed. Your cost has been added.",
                )
              }
              onScan={() => open("scan")}
            />
          )}
          {modal === "drive" && !active && (
            <Empty
              icon={Check}
              title="This trip is complete"
              text="The vehicle is available again."
            />
          )}
          {modal === "invite" && (
            <div className="modal-body">
              <div className="info-note">
                <Users size={24} />
                <p>
                  Anyone with this code can join this garage and see shared
                  trips, balances, and shared live locations. Share it only with
                  your co-owners.
                </p>
              </div>
              <div className="invite-code">{v.invite}</div>
              <Button
                onClick={() =>
                  navigator.clipboard
                    .writeText(v.invite)
                    .then(() => setToast("Invitation code copied."))
                    .catch(() =>
                      setError(
                        "Clipboard unavailable. Select and copy the code above.",
                      ),
                    )
                }
              >
                <Copy size={16} />
                Copy invite code
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(
                    () => api("/vehicles/" + vid + "/invite", "POST"),
                    "A new invitation code is ready.",
                    false,
                  )
                }
              >
                <RefreshCw size={16} />
                Replace code
              </Button>
              <p className="muted">
                Replacing the code invalidates the previous code. Existing
                owners keep access.
              </p>
            </div>
          )}
          {modal === "notifications" && (
            <div className="modal-body notifications">
              {data?.notifications.map((n) => (
                <div key={n.id}>
                  <span className="round-icon">
                    <Bell size={17} />
                  </span>
                  <p>
                    {n.message}
                    <small>{new Date(n.created_at).toLocaleString()}</small>
                  </p>
                </div>
              ))}
              {!data?.notifications.length && (
                <Empty
                  icon={Bell}
                  title="All caught up"
                  text="Your garage activity will appear here."
                />
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
function Auth({ config, error, busy, onSubmit, onDemo }) {
  const [register, setRegister] = useState(false);
  return (
    <div className="auth-page">
      <div className="auth-form">
        <h1>CoDrive</h1>
        <h2>{register ? "Create account" : "Sign in"}</h2>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const b = Object.fromEntries(new FormData(e.currentTarget));
            onSubmit("/auth/" + (register ? "register" : "login"), b);
          }}
        >
          {register && (
            <Field
              label="Your name"
              name="name"
              required
              autoComplete="name"
              placeholder="Alex Morgan"
              maxLength={60}
            />
          )}
          <Field
            label="Email address"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
          <Field
            label="Password"
            name="password"
            type="password"
            minLength={10}
            maxLength={128}
            required
            autoComplete={register ? "new-password" : "current-password"}
            placeholder="At least 10 characters"
          />
          <Button disabled={busy} type="submit">
            {busy ? <LoaderCircle className="spin" size={17} /> : null}
            {register ? "Create account" : "Sign in"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="auth-switch">
          {register ? "Already part of the crew?" : "New to CoDrive?"}{" "}
          <button className="text-btn" onClick={() => setRegister(!register)}>
            {register ? "Sign in" : "Create an account"}
          </button>
        </p>
        {config.demo && (
          <>
            <div className="divider">
              <span>JUST LOOKING AROUND?</span>
            </div>
            <Button variant="secondary" disabled={busy} onClick={onDemo}>
              Explore a demo garage
              <ArrowUpRight size={17} />
            </Button>
            <small className="demo-note">
              A fresh sample workspace. No signup needed.
            </small>
          </>
        )}
      </div>
    </div>
  );
}
function Stat({ label, value, unit, icon: Icon, note, color }) {
  return (
    <section className="card stat">
      <div className="stat-top">
        <span>{label}</span>
        <span className={"stat-icon " + color}>
          <Icon size={18} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        <small>{unit}</small>
      </div>
      <p>{note}</p>
    </section>
  );
}
function Empty({ icon: Icon, title, text }) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function ActivityChart({ trips }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 13 + i);
    const key = d.toDateString();
    return {
      date: d,
      value: trips
        .filter((t) => new Date(t.started_at).toDateString() === key)
        .reduce((s, t) => s + t.end_odometer - t.start_odometer, 0),
    };
  });
  const max = Math.max(25, ...days.map((d) => d.value));
  return (
    <div className="chart">
      <div className="chart-labels">
        {[1, 0.75, 0.5, 0.25, 0].map((n) => (
          <span key={n}>{Math.round(max * n)}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-grid">
          {[0, 1, 2, 3, 4].map((n) => (
            <div key={n} />
          ))}
        </div>
        <div className="bars">
          {days.map((d, i) => (
            <div className="bar-col" key={i}>
              <div
                className={"bar " + (i === 13 ? "current" : "")}
                style={{ height: `${Math.max((d.value / max) * 100, 1)}%` }}
                title={`${date(d.date)}: ${number(d.value)} mi`}
              />
              <span>{i % 3 === 0 || i === 13 ? d.date.getDate() : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function PurposeSummary({ trips }) {
  const purposes = ["Commute", "Errands", "Personal", "Road trip"].map(
    (name) => ({
      name,
      miles: trips
        .filter((t) => t.purpose === name)
        .reduce((sum, t) => sum + t.end_odometer - t.start_odometer, 0),
    }),
  );
  const total = purposes.reduce((sum, p) => sum + p.miles, 0);
  return (
    <section className="card purpose-summary">
      <div>
        <h2>What moves your car?</h2>
        <p>All-time distance by purpose</p>
      </div>
      <div className="purpose-items">
        {purposes.map((p) => (
          <div key={p.name}>
            <span className={"pill " + p.name.toLowerCase().replace(" ", "")}>
              {p.name}
            </span>
            <strong>{number(p.miles)} mi</strong>
            <small>
              {total ? Math.round((p.miles / total) * 100) : 0}% of miles
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
function Donut({ owners, total }) {
  let offset = 0;
  const colors = ["#237c64", "#a8cabb", "#eed29e", "#99b8d1"];
  return (
    <div className="donut">
      <svg viewBox="0 0 160 160" aria-label="Mileage by owner" role="img">
        <circle
          cx="80"
          cy="80"
          r="61"
          fill="none"
          stroke="#edf2ee"
          strokeWidth="19"
        />
        {owners.map((o, i) => {
          const portion = total ? (o.miles / total) * 383.27 : 0;
          const el = (
            <circle
              key={o.id}
              cx="80"
              cy="80"
              r="61"
              fill="none"
              stroke={colors[i % 4]}
              strokeWidth="19"
              strokeDasharray={`${Math.max(0, portion - 4)} ${383.27 - Math.max(0, portion - 4)}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 80 80)"
            />
          );
          offset += portion;
          return el;
        })}
      </svg>
      <div>
        <strong>{number(total)}</strong>
        <span>shared miles</span>
      </div>
    </div>
  );
}
function DataForm({ fields, onSubmit, busy, submit, initial = {}, note }) {
  return (
    <form
      className="modal-body form"
      onSubmit={(e) => {
        e.preventDefault();
        const b = Object.fromEntries(new FormData(e.currentTarget));
        fields.forEach(([n, , type]) => {
          if (type === "number") b[n] = Number(b[n]);
        });
        onSubmit(b);
      }}
    >
      {fields.map(([name, label, type, placeholder]) => (
        <Field key={name} label={label}>
          {Array.isArray(type) ? (
            <select name={name} defaultValue={initial[name] || type[0]}>
              {type.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          ) : (
            <input
              name={name}
              type={type}
              placeholder={placeholder}
              defaultValue={initial[name]}
              required
              step={type === "number" ? "any" : undefined}
              min={type === "number" ? 0 : undefined}
            />
          )}
        </Field>
      ))}
      {note && <p className="form-note">{note}</p>}
      <Button disabled={busy} type="submit">
        {busy ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <Check size={17} />
        )}{" "}
        {submit}
      </Button>
    </form>
  );
}
function RoutineForm({ busy, onSubmit }) {
  const [days, setDays] = useState(["Mon", "Tue", "Wed", "Thu", "Fri"]);
  return (
    <div className="modal-body">
      <label className="field">
        <span>Repeat on (your local time)</span>
      </label>
      <div className="day-row selectable">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <button
            type="button"
            key={d}
            className={days.includes(d) ? "on" : ""}
            aria-pressed={days.includes(d)}
            onClick={() =>
              setDays(
                days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
              )
            }
          >
            {d}
          </button>
        ))}
      </div>
      <DataForm
        busy={busy || !days.length}
        submit="Save routine"
        fields={[
          ["origin", "Starting from", "text", "Home"],
          ["destination", "Going to", "text", "Office"],
          ["time", "Departure time", "time"],
          ["miles", "Expected distance (mi)", "number", "24"],
          [
            "purpose",
            "Purpose",
            ["Commute", "Errands", "Personal", "Road trip"],
          ],
        ]}
        onSubmit={(b) => onSubmit({ ...b, days: days.join(", ") })}
      />
    </div>
  );
}
function MapView({ trip, mine }) {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  let url = "";
  if (key && (trip.sharing || mine)) {
    if (trip.latitude != null)
      url = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${trip.latitude},${trip.longitude}&zoom=14`;
    else
      url = `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(key)}&origin=${encodeURIComponent(trip.origin)}&destination=${encodeURIComponent(trip.destination)}&mode=driving`;
  }
  return url ? (
    <GoogleEmbed src={url} title="Trip map" />
  ) : (
    <div className="map-placeholder">
      <div className="map-grid" />
      <span className="round-icon">
        {trip.sharing ? <MapPin /> : <EyeOff />}
      </span>
      <h3>{trip.sharing ? "Trip map" : "A little space for yourself."}</h3>
      <p>
        {trip.sharing
          ? "Add a Google Maps key to display the route in-app. GPS sharing works independently."
          : "Live location is off. Your mileage and fuel cost will still be recorded."}
      </p>
    </div>
  );
}
function DrivePanel({
  config,
  trip,
  mine,
  busy,
  geoError,
  prefill,
  onPrivacy,
  onFinish,
  onScan,
}) {
  return (
    <div className="modal-body">
      <div className="drive-route">
        <MapPin size={20} />
        <div>
          <strong>
            {trip.origin} → {trip.destination}
          </strong>
          <small>{trip.driver}</small>
        </div>
      </div>
      <MapView trip={trip} mine={mine} />
      {!!trip.sharing && (
        <p className="form-note">
          {trip.location_at
            ? `Last GPS update: ${new Date(trip.location_at).toLocaleTimeString()}${Date.now() - new Date(trip.location_at) > 60000 ? " · Signal may be stale" : ""}`
            : "Waiting for the driver’s first GPS update."}{" "}
          {trip.latitude != null
            ? `(${trip.latitude.toFixed(4)}, ${trip.longitude.toFixed(4)})`
            : ""}
        </p>
      )}
      {mine && (
        <>
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!trip.sharing}
              disabled={
                busy ||
                !trip.participants.some((p) => p.user_id === trip.user_id)
              }
              onChange={(e) => onPrivacy(e.target.checked)}
            />
            <div>
              <strong>Share my live location</strong>
              <small>
                Turning this off also hides your route from co-owners.
                Coordinates are deleted when the drive ends.
              </small>
            </div>
          </label>
          {geoError && trip.sharing && <p className="error">{geoError}</p>}
          <a
            className="text-btn external-link"
            target="_blank"
            rel="noreferrer"
            href={
              "https://www.google.com/maps/dir/?api=1&origin=" +
              encodeURIComponent(trip.origin) +
              "&destination=" +
              encodeURIComponent(trip.destination) +
              "&travelmode=driving"
            }
          >
            Open turn-by-turn navigation in Google Maps
            <ArrowUpRight size={16} />
          </a>
          <FinishTrip
            trip={trip}
            prefill={prefill}
            api={api}
            config={config}
            busy={busy}
            onFinish={onFinish}
          />
        </>
      )}
    </div>
  );
}
function ScanForm({ config, onUse }) {
  return (
    <div className="modal-body">
      <PhotoReading api={api} config={config} onRead={onUse} />
    </div>
  );
}
function SettingsPage({ vehicle: v, config, busy, save, open }) {
  const [price, setPrice] = useState(v.fuel_price),
    [mpg, setMpg] = useState(v.mpg),
    [quote, setQuote] = useState(null),
    [error, setError] = useState(""),
    [fetching, setFetching] = useState(false);
  useEffect(() => {
    setPrice(v.fuel_price);
    setMpg(v.mpg);
  }, [v.id, v.fuel_price, v.mpg]);
  return (
    <div className="settings-grid">
      <section className="card settings-card">
        <h2>Vehicle preferences</h2>
        <p>
          Changes apply to future trips. Completed trips keep their original
          rates.
        </p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            save({ mpg: +mpg, fuel_price: +price });
          }}
        >
          <Field
            label="Fuel economy (US MPG)"
            type="number"
            step="any"
            min="0.1"
            max="200"
            value={mpg}
            onChange={(e) => setMpg(e.target.value)}
            required
          />
          <Field
            label="Local fuel price (USD / US gallon)"
            type="number"
            step="any"
            min="0.01"
            max="30"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <Button
            variant="secondary"
            type="button"
            disabled={fetching}
            onClick={async () => {
              setFetching(true);
              setError("");
              try {
                setQuote(await api("/fuel-price"));
              } catch (e) {
                setError(e.message);
              } finally {
                setFetching(false);
              }
            }}
          >
            <RefreshCw size={16} className={fetching ? "spin" : ""} />
            Look up US average
          </Button>
          {error && <div className="error">{error}</div>}
          {quote && (
            <div className="info-note">
              <div>
                <strong>
                  {money(quote.price * 100)}/gal · {quote.date}
                </strong>
                <p>{quote.source}. This is not a live local pump price.</p>
                <button
                  className="text-btn"
                  type="button"
                  onClick={() => {
                    setPrice(quote.price);
                    setQuote(null);
                  }}
                >
                  Use this reference price
                </button>
              </div>
            </div>
          )}
          <Button disabled={busy} type="submit">
            Save preferences
            <Check size={16} />
          </Button>
        </form>
      </section>
      <section className="card settings-card">
        <h2>Your connected services</h2>
        <p>Keys stay in environment files, outside source control.</p>
        {[
          [
            Sparkles,
            "Gemini photo reader",
            config.gemini,
            "Server · GEMINI_API_KEY",
          ],
          [
            MapPin,
            "Google Maps Embed",
            !!import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
            "Browser · VITE_GOOGLE_MAPS_API_KEY",
          ],
          [Fuel, "EIA fuel reference", config.fuel_api, "Server · EIA_API_KEY"],
        ].map(([Icon, name, on, note]) => (
          <div className="integration" key={name}>
            <span className="round-icon">
              <Icon size={20} />
            </span>
            <div>
              <strong>{name}</strong>
              <small>{note}</small>
            </div>
            <span className={"pill " + (on ? "commute" : "")}>
              {on ? "Configured" : "Not set up"}
            </span>
          </div>
        ))}
        <div className="info-note">
          <ShieldCheck size={20} />
          <p>
            Private by default. In-app notifications update while the app is
            open. Background location and push notifications are not enabled in
            this version.
          </p>
        </div>
        <h3>Garage management</h3>
        <div className="button-row">
          <Button variant="secondary" onClick={() => open("vehicle")}>
            <Plus size={16} />
            Add vehicle
          </Button>
          <Button variant="secondary" onClick={() => open("join")}>
            <Users size={16} />
            Join garage
          </Button>
        </div>
      </section>
    </div>
  );
}
function exportTrips(trips) {
  const safe = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+@\-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  const rows = [
    [
      "Date",
      "Driver",
      "Origin",
      "Destination",
      "Purpose",
      "Miles",
      "Estimated fuel cost USD",
    ],
    ...trips.map((t) => [
      t.started_at,
      t.driver,
      t.origin,
      t.destination,
      t.purpose,
      t.ended_at ? t.end_odometer - t.start_odometer : "",
      t.ended_at ? (t.cost_cents / 100).toFixed(2) : "",
    ]),
  ];
  const url = URL.createObjectURL(
    new Blob([rows.map((r) => r.map(safe).join(",")).join("\n")], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "codrive-trips.csv";
  a.click();
  URL.revokeObjectURL(url);
}

createRoot(document.getElementById("root")).render(<App />);
