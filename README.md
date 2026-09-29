# CoDrive

A shared-car web app for recording trips, splitting estimated fuel costs, and tracking what each owner has paid or owes. Built with React and JavaScript, a Python/FastAPI backend, and PostgreSQL in production.

**[Open CoDrive](https://codrive-sujjal.onrender.com/)** · [GitHub](https://github.com/Sujjal1/trip_planner) · [Build checks](https://github.com/Sujjal1/trip_planner/actions/workflows/ci.yml)

The website runs on Render with a Neon database. Both are configured on Free plans. Render may sleep when idle, so the first visit can take longer to load. The frontend and backend share one HTTPS address; no mobile app installation is needed.

## Getting started

1. Open the website and create an account.
2. Add your vehicle with its current odometer, default MPG, and fuel price, or join an existing vehicle with an invitation code.
3. Invite other owners through **Co-owners → Invite co-owner**.
4. Start a trip, enter the starting odometer, and select who is riding. You are selected initially, but you can deselect yourself and record a trip for other owners.
5. End the trip with the ending odometer. Optionally enter the trip's MPG; leaving it blank uses the default captured when the trip started.

Use the small photo option beside an odometer field to read a dashboard photo, or type the number yourself. Review extracted values before saving.

## Features

- **Simple dashboard:** current odometer, vehicle availability, trip controls, Add expense, and recent trips.
- **Shared trips:** select one or more riders and split estimated fuel costs equally. Only one trip can be active per vehicle.
- **Trip management:** any co-owner can finish or cancel an active trip, or edit and delete a completed trip. Cancellation frees the vehicle without recording mileage or charges and clears shared coordinates.
- **Mileage and MPG:** per-trip readings, total vehicle miles and average MPG, owner mileage and MPG summaries, and CSV trip export.
- **Expenses:** record fuel, maintenance, insurance, parking, or other expenses and choose who paid. Any co-owner can edit an expense.
- **Payments:** select **Paid by**, **Paid to**, and an amount to record money already paid outside CoDrive. Notes are optional. CoDrive does not transfer money.
- **Maps:** Google-powered location search, embedded routes, optional live location sharing, and a link to Google Maps navigation.
- **Photo assistance:** Gemini reads odometer photos and fuel receipts into editable fields. Manual entry remains available when scanning fails.
- **Past and recurring trips:** record a missed trip or save a recurring-trip template. Templates do not automatically start or charge trips.
- **Shared accounts and vehicles:** password-protected accounts, invitation codes, multiple vehicles, and in-app activity notifications.

## Costs, balances, and mileage

The app uses **USD, miles, US gallons, and MPG**. Use odometer readings for distance; a speedometer or fuel gauge alone cannot establish exact fuel consumption.

```text
trip miles = ending odometer − starting odometer
estimated gallons = trip miles ÷ trip MPG
estimated fuel cost = estimated gallons × fuel price captured at trip start

owner balance = purchases paid + payments sent
                − trip fuel shares − shared expense charges − payments received
```

**Positive balance = credit. Negative balance = money owed.** Recording a payment increases the sender's balance toward zero and decreases the recipient's credit by the same amount.

MPG and fuel price are captured at trip start. You can override MPG when finishing or editing a trip; changing vehicle defaults alone does not recalculate older trips. Costs are rounded to cents, with leftover split cents assigned consistently by owner ID.

Fuel purchases credit the payer without charging consumption twice. Non-fuel expenses are split among owners at entry time; editing an expense rebuilds its split using the current owners. Balances are an estimated running ledger, not exact tank inventory or automatically assigned debts between specific people.

Vehicle mileage counts each completed trip once. Each selected rider receives that trip's full distance in their personal total, so owner totals can exceed vehicle mileage when people travel together. Average MPG is total miles divided by total estimated gallons, rather than a simple average of trip MPG values. Deleted and cancelled trips are excluded.

### Corrections and cancellation

Any co-owner can edit or delete a completed trip. Expense and payment deletion is limited to the recorded payer or garage creator. Deleted entries are retained for restoration; the Trips/Expenses sections show available restoration actions. Restoring a trip must not conflict with other recorded trips.

Deleting a completed trip does not lower the current vehicle odometer. Correct it in **Vehicle details** if needed, subject to existing trip readings. Cancelled active trips cannot be restored as completed trips; start a new trip instead.

## Maps, privacy, and current limits

Location sharing starts off. Only the trip recorder controls their location updates, and sharing is disabled when that person is not a selected rider. Turning sharing off, finishing, or cancelling clears saved coordinates. Private route addresses and GPS are hidden from other owners; shared accounting information remains visible.

Browser GPS requires permission and HTTPS outside localhost. Keep the website open: updates may pause when the browser is backgrounded or the phone locks. Only the latest position is stored. Location updates are throttled to ten seconds; co-owner dashboards refresh every five seconds while open.

Choose a Google search suggestion above the map to set a location. Clicking a pin inside the embedded map does not select it in CoDrive. Spoken turn-by-turn navigation opens in Google Maps; CoDrive does not provide its own navigation engine or reliable background tracking.

Notifications are in-app only. Email/SMS/push notifications, password reset, email verification, and an owner-removal interface are not implemented. Recurring times use local time without a stored garage time zone.

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

Open [localhost:8000](http://localhost:8000). With `DATABASE_URL` empty, local development uses SQLite at `DATABASE_PATH`. Local accounts and trips are separate from the hosted database and are not automatically uploaded.

For development with automatic reload, run these in separate terminals:

```bash
uvicorn backend.main:app --reload
npm --prefix frontend run dev
```

Open [localhost:5173](http://localhost:5173). Vite proxies `/api` to Python.

For sample data, set `DEMO_MODE=true` in `backend/.env`, restart, and choose **Explore a demo garage** on the sign-in screen. Each demo session creates its own sample garage. Demo accounts cannot be recovered after signing out; keep demo mode disabled in production.

## API keys and configuration

Manual trip and expense entry works without API keys. Keep local secrets in the gitignored environment files and hosted secrets in **Render → Environment**. Never commit real keys or database passwords.

| Setting | Purpose | Local location |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection URL; empty uses SQLite | `backend/.env` |
| `DATABASE_PATH` | Local SQLite file path | `backend/.env` |
| `GEMINI_API_KEY` | Photo reading; obtain from [Google AI Studio](https://aistudio.google.com/apikey) | `backend/.env` |
| `GEMINI_MODEL` | Image-capable model; app default is `gemini-2.5-flash` | `backend/.env` |
| `GOOGLE_PLACES_API_KEY` | Server-side Places API (New) search; configure in [Google Cloud](https://console.cloud.google.com/google/maps-apis/credentials) | `backend/.env` |
| `VITE_GOOGLE_MAPS_API_KEY` | Browser-visible Maps Embed API key | `frontend/.env` |
| `EIA_API_KEY` | US gasoline reference price; obtain from [EIA](https://www.eia.gov/opendata/register.php) | `backend/.env` |
| `COOKIE_SECURE` | `true` for hosted HTTPS, `false` for local HTTP | `backend/.env` |
| `DEMO_MODE` | Sample garages locally; keep `false` in production | `backend/.env` |
| `APP_ORIGIN` | Local Places fallback referrer, such as `http://localhost:8000` | `backend/.env` |

Restrict the browser key to Maps Embed API and allowed website referrers. Keep the production Places key server-only, restricted to Places API (New) and server outbound addresses. Local development can fall back to the frontend key for Places if that key permits it. Restart the backend after server setting changes; rebuild the frontend after changing its Maps key.

EIA supplies a weekly US regular-gasoline reference price, not live station prices. Review and save it in vehicle settings or use a receipt-based price. Dates come from the server clock and require no API key.

Photos are sent to Gemini after consent, re-encoded to remove metadata, and not persisted by CoDrive. Review the provider's current data-use terms before uploading sensitive images. API quotas and billing are separate from hosting: check the current [Gemini terms](https://ai.google.dev/gemini-api/docs/pricing) and [Maps billing information](https://developers.google.com/maps/billing-and-pricing/overview), and configure quotas for your budget.

## Deployment

- **Source:** this GitHub repository's `main` branch.
- **Hosting:** Render Free web service, building the Docker image and serving React and FastAPI together over HTTPS.
- **Database:** Neon PostgreSQL, connected privately through `DATABASE_URL`.
- **Configuration:** [`render.yaml`](render.yaml), with `COOKIE_SECURE=true` and `DEMO_MODE=false`.
- **Health check:** [`/api/health`](https://codrive-sujjal.onrender.com/api/health).

The old `codex/codrive-mvp` branch has been retired. Push updates to `main`; Render follows that branch. The Blueprint specifies deployment after checks pass. The current deployment requires no AWS resources. GitHub Pages is not used because it cannot run the Python API.

Render requires `DATABASE_URL` at startup to avoid saving production records to temporary disk. Keep the Neon URL and server API keys private in Render's environment settings; only the Maps Embed key is intentionally browser-visible. Keep backups and review provider usage limits. Free hosting does not guarantee unlimited service or free third-party API calls.

See [deployment instructions](deploy/README.md) for Render/Neon setup and alternative Docker hosting.

## Validation

```bash
TEST_DATABASE_URL='' DATABASE_URL='' .venv/bin/python -m pytest backend/tests -q
npm --prefix frontend run build
```

Tests use temporary SQLite databases by default. Set `TEST_DATABASE_URL` only to a disposable PostgreSQL test database: the test suite clears its tables.

[GitHub Actions](https://github.com/Sujjal1/trip_planner/actions/workflows/ci.yml) runs tests against SQLite and PostgreSQL, builds the frontend, validates deployment configuration, and builds and checks the Docker container. Coverage includes authentication, membership permissions, trip costs and cancellation, mileage statistics, balance signs, payments, corrections, privacy, and integration fallbacks. Live provider calls are not part of automated tests.
