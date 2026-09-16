# CoDrive hosting

The repository is on GitHub. The deployment package serves the React frontend
and Python backend together over HTTPS so the existing secure-cookie login works
on iPhones without relying on third-party cookies.

GitHub Pages cannot run Python or proxy `/api`. Publishing the current frontend
there alone would show a page with broken sign-in and trip saving. A separate
Pages deployment needs a different cross-site authentication design first.

## Before launching AWS resources

Verify the signed-in account's Free Tier plan, remaining credits, expiry date,
and applicable compute, storage, and public IPv4 costs. This configuration does
not create AWS resources. Do not assume an AWS account means free hosting.
Budget alerts do not enforce a spending cap. A paid account cannot guarantee $0.

## Host setup

On a Linux host with Docker Compose and persistent storage:

1. Check out the intended GitHub revision.
2. Copy `deploy/.env.example` to `deploy/.env` and fill it in on the server.
3. Set a hostname you control to resolve to the server. Allow inbound ports
   80 and 443. Do not expose the database or application port 8000 publicly.
4. Run `docker compose -f deploy/compose.yaml --env-file deploy/.env up -d --build`.
5. Open `https://your-hostname/`, create a test account, and verify a garage,
   trip, expense, login after refresh, and photo scanning.

`VITE_GOOGLE_MAPS_API_KEY` is intentionally browser-visible; restrict it to the
deployment hostname and Maps Embed API. Rebuild after changing it. Configure
the server-only `GOOGLE_PLACES_API_KEY` for Places API (New) and the server's
outbound IP. Gemini and EIA keys stay on the server. Set API quotas in their
provider consoles consistent with your budget.

The named `garage-data` volume survives container replacement. Never use
`docker compose down -v` on a garage you need to keep. Back up SQLite using its
backup API before updates and copy backups off the host. The package starts
with an empty database; existing laptop data is not uploaded automatically.

This package runs one application process. Review account recovery and shared
rate limiting before expanding beyond a small pilot. Changing hosting does not
add turn-by-turn Google navigation.
