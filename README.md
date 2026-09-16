# CoDrive

**Shared journeys. Fair costs.** A React + JavaScript frontend and Python/FastAPI backend for a jointly owned car. Track who drives, estimate their fuel use, record shared expenses, plan recurring trips, and share location only when the driver opts in.

## Run locally

Requires Python 3.12+ and Node 22.12+ (or Node 24).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.lock
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm --prefix frontend ci
npm --prefix frontend run build
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open **http://localhost:8000**. Create an account, add a vehicle, then use **Co-owners → Invite co-owner** to share the invitation code. A second owner creates their own account and joins using that code. You can share several vehicles with different groups.

For a populated sample garage, set `DEMO_MODE=true` in `backend/.env`, restart the API, and choose **Explore a demo garage** on the sign-in screen. Every demo session gets its own isolated garage with sample owners and twelve sample trips. Demo accounts cannot be recovered after signing out; disable demo mode on a public installation. Demo data stays in SQLite until you remove that development database.

For frontend development, run `uvicorn backend.main:app --reload` in one terminal and `npm --prefix frontend run dev` in another. Open **http://localhost:5173**. Vite proxies `/api` to Python, keeping authentication same-origin.

## Keys and services

**Never paste secret keys into chat, source code, or GitHub.** Both `.env` files are gitignored. The app works with manual inputs before any keys are configured.

| Feature | Get a key | Put it here | Notes |
|---|---|---|---|
| Gemini photo reading | [Google AI Studio](https://aistudio.google.com/apikey) | `GEMINI_API_KEY` in `backend/.env` | Server only. `GEMINI_MODEL` defaults to `gemini-2.5-flash`; select an image-capable model available to your account. Free quota, availability, and limits vary by model/account. |
| Embedded Google routes / shared position | [Google Cloud Console](https://console.cloud.google.com/google/maps-apis/credentials) | `VITE_GOOGLE_MAPS_API_KEY` in `frontend/.env` | Enable **Maps Embed API**. Restrict key to Maps Embed API and your website referrers, including localhost for development. Browser keys are visible by design. Rebuild after changes. |
| US gasoline reference price | [EIA API registration](https://www.eia.gov/opendata/register.php) | `EIA_API_KEY` in `backend/.env` | Weekly US regular gasoline average, not real-time station pricing. Review and save it manually in Settings, or use a local receipt price. |
| Date/time | No key needed | Server UTC clock | Trip timestamps come from the server; UI dates are shown in the browser's time zone. Keep the host clock synchronized. |

Restart the backend after changing its keys. Read the current [Gemini pricing/free-tier terms](https://ai.google.dev/gemini-api/docs/pricing), [image API documentation](https://ai.google.dev/gemini-api/docs/image-understanding), [Maps Embed setup](https://developers.google.com/maps/documentation/embed/get-started), [Google key restrictions](https://developers.google.com/maps/api-security-best-practices), and [EIA documentation](https://www.eia.gov/opendata/documentation.php) before enabling the integrations. Gemini free-tier inputs may be used to improve Google products. The scan form requests explicit consent before uploading. CoDrive re-encodes the image to strip metadata and does not persist photos. Avoid uploading sensitive photos.

## What works

- Password accounts with scrypt hashing; expiring, hashed, HttpOnly-cookie sessions; logout; same-origin CSRF protection; basic login throttling.
- Multiple vehicles, high-entropy invitation codes, creator-only invite rotation, membership checks on vehicle data.
- Dashboard with real stored mileage, time, costs, recent trips, and owner contributions. Empty garages show honest empty states.
- Starting and finishing drives using confirmed odometer readings, with one active trip per vehicle enforced by SQLite.
- Driver-only GPS updates and location controls. Location sharing starts **off**. Private routes are redacted for other owners; turning sharing off or ending a trip deletes coordinates. Only the latest position is stored.
- Co-owner dashboards and activity notifications refresh every five seconds while the app is open.
- In-app Google route/position embeds when configured; an external Google Maps link for turn-by-turn navigation. There is no custom in-app turn-by-turn engine.
- Gemini-assisted odometer/fuel-gauge/receipt reading, editable review, then explicit confirmation. Manual entry remains available.
- Expense journal, deterministic cent-based equal splits, individual owner balances, and CSV trip export.
- Recurring trip templates with selected weekdays and a local departure time. Drivers manually start them; templates never automatically bill or reserve the car.
- Responsive desktop/mobile layout and keyboard-accessible native dialogs.

## How the cost calculation works

A speedometer shows speed, not total distance. Use the **odometer** before and after a trip. A fuel gauge is approximate and cannot establish exact fuel consumption.

```
distance = ending odometer − starting odometer
estimated gallons consumed = distance ÷ vehicle MPG
estimated trip cost = consumed gallons × fuel price at trip start
owner balance = estimated trip costs + share of non-fuel expenses − purchases paid
```

Costs are rounded half-up to integer cents. MPG and price are captured when a trip starts, so changing settings cannot rewrite older costs. Non-fuel purchases are split among the owners who belong to the garage at entry time; leftover cents are assigned deterministically by owner ID. Future members do not inherit old expense shares.

Fuel purchases are a payer credit rather than a second consumption charge. Negative balances carry forward (including money paid for fuel still in the tank). This is an **estimated running ledger**, not exact tank inventory accounting or instructions for who should pay whom. Actual vehicle MPG changes with conditions. Reconcile against receipts and full-tank records before settling money. No payment processing or transfers are implemented. Initial fuel inventory and opening balances are not modeled.

The app currently uses **USD, miles, US gallons**, a single driver per trip, and equal non-fuel sharing. Insurance, maintenance, and parking can be recorded manually. Every owner can update the shared MPG/price and record their own payments. Photo readings never automatically change a ledger.

## Location and notifications

Browser GPS needs permission and HTTPS outside localhost. Keep the app open: browsers may pause location when backgrounded or the device locks. Updates are throttled to ten seconds. Other owners poll every five seconds, and the drive screen shows the last GPS timestamp and flags positions older than a minute. Turning sharing off clears the server's saved point immediately; another open screen drops it on its next poll. Already viewed information cannot be recalled.

This version provides **in-app activity notifications only**. Background tracking, email/SMS/mobile push delivery, reservations/conflict scheduling, password reset, email verification, owner removal, trip corrections, and payment settlement are future work. Recurring times are displayed as local time without a persisted garage time zone. Private travel hides route addresses and GPS from co-owners, but the driver's identity, purpose, distance, timestamps, and cost remain visible for shared accounting. Authorized server operators can access stored route addresses.

## Validate

```bash
.venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
```

Tests exercise authentication and authorization, private-route redaction, location deletion, single-active-trip enforcement, rate snapshots, cost rounding, fuel credits, historical expense sharing, invite rotation, routine ownership, integration fallbacks, and demo isolation. GitHub Actions runs backend tests and the frontend build. Live provider calls require your keys and are not part of automated tests.

## Deployment and GitHub

Repository: [Sujjal1/trip_planner](https://github.com/Sujjal1/trip_planner).

The Python service can serve the built React app and API from the same origin. Before public deployment:

1. Build the frontend with the domain-restricted Maps key, if used.
2. Provide backend environment variables through your host's secret manager. Set `COOKIE_SECURE=true`, `DEMO_MODE=false`, and an absolute `DATABASE_PATH` on a persistent volume.
3. Run behind HTTPS with a request size limit of 8 MB and trusted proxy configuration. Do not expose a development server.
4. Back up the database, restrict filesystem access, and set provider quotas. Free-tier API limits can interrupt scanning; manual entry is the fallback.
5. Add shared rate limiting and account recovery before broad public use. The included throttle is per-process, suitable for a small single-process pilot.

SQLite is suitable for a small shared garage. Use PostgreSQL and shared session/rate-limit infrastructure when scaling across instances. This initial version is for a private pilot, not an audited financial or fleet-management system.

GitHub Pages alone cannot host the Python API. Choose a Python-capable host with persistent storage, or host the frontend and proxy its `/api` requests to the backend. All current data lives in SQLite; there is no automatic cloud synchronization beyond clients talking to the same server.

## Map-first and photo-assisted trips

**Vehicle details** now opens an editable vehicle card for name, plate, odometer, MPG, and fuel price. Odometer adjustments cannot invalidate recorded trips or change during an active drive.

**Start a trip** opens an embedded Google map. Search for origin and destination, then select Google suggestions to preview driving directions before starting. Google Maps Embed does not expose clicked pins back to the app, so choose from the Google search results above the map. This uses Google Places and Maps Embed; Google-powered autocomplete is described below; in-app turn-by-turn navigation is not implemented.

Use **Record a past trip** if you did not have your phone. Supply the actual start/end times and odometer readings; the app calculates costs and updates balances atomically. Overlapping times and contradictory odometer readings are rejected. Retrospective costs use current vehicle MPG and price, clearly shown before saving.

Start/end dashboard photos and fuel receipts can now be read inline without losing your route. After Gemini consent, selecting a photo starts extraction automatically and fills the corresponding fields. Confirm once to save: distance, estimated fuel cost, odometer, and owner balances update together. Photos cannot reliably determine exact fuel consumption; unreadable values still require manual entry. Financial records are not silently posted from uncertain image readings.

### Google-powered location selection

The planner now uses live Google Places autocomplete results, fetched through authenticated Python endpoints to avoid the native widget's browser RPC connection failures. Select a suggestion to resolve its address and Google place ID; the route preview updates only after selection, rather than reloading on every keystroke. Start and destination are saved on the trip. There is also an explicit current-location button and a manual-entry fallback. Map loading feedback and **Reload map** are available before and during a drive.

Enable **Places API (New)** with billing in your Google project, alongside Maps Embed API. Local development reuses the existing key from `frontend/.env` with the `APP_ORIGIN` referrer. For production (`COOKIE_SECURE=true`), configure a separate server-only `GOOGLE_PLACES_API_KEY` in `backend/.env`, restricted to Places API (New) and your server IP. Keep the browser Maps Embed key restricted to your website. Autocomplete session tokens are carried through place-details selection; only the needed place fields are requested. Places has its own pricing and quotas, separate from Maps Embed.

The Google map iframe itself still cannot send a clicked pin back to CoDrive; choose the Google suggestion above the map. Google place IDs identify the selected locations in the preview; resolved addresses are stored in trip history. Background turn-by-turn navigation is not implemented.
