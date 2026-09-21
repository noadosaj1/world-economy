# World Economy

A persistent multiplayer 3D business sandbox. One shared world, one shared
economy: own land, run a company, produce goods, trade with other players and
build an empire that keeps running while you are logged out.

All currency in the game is fictional and has no real-world value. There are no
deposits, withdrawals, purchases or cash-outs, and no real-money gambling.

## Status: Phase 1 (foundation) complete

Phase 1 is the playable floor the rest of the game is built on. What works
end to end today:

- Email/password sign up and sign in via Supabase Auth
- A profile row created automatically for every new account
- Company creation: name, ticker, industry, with server-side validation
- A starting grant of **$10,000**, written with a ledger entry
- One **free starter plot**, claimed atomically from the world grid
- A dashboard showing cash, net worth, land and the full money ledger
- Company and Land pages backed by real rows
- An **isometric 3D city map** you pan, zoom, rotate and click: an island of
  400 plots across nine districts, with roads, varied buildings, and a price
  tag on every plot for sale and the owner's name on every claimed one
- Everything persists: refreshing or logging out changes nothing

Not built yet, and deliberately marked "soon" in the navigation rather than
faked: businesses and active work, resources and production, the resource
market, shops, workers, vehicles, property rental, the stock market, other
players visible in the world, advertising and the gambling district. See
[Roadmap](#roadmap).

## Getting started

Requires Node 20+ and a Supabase project.

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase values
```

Apply the database migrations - see [`supabase/README.md`](supabase/README.md).
The app will show setup instructions instead of the game until this is done.

```bash
npm run dev                    # http://localhost:3000
```

### Environment variables

| Variable | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser and server. Public. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser and server. Public; RLS is what protects data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Bypasses RLS. Never expose it. |

`src/lib/supabase/admin.ts` imports `server-only`, so pulling the service-role
client into a client component is a build error rather than a leak.

## Architecture

The one rule everything else follows: **the browser is never authoritative.**

```
Browser  ──requests──▶  Server Action / Route Handler
                              │
                              ▼
                     SECURITY DEFINER function in Postgres
                       (validates, locks, writes, audits)
                              │
                              ▼
                        Database  ← the source of truth
```

A player's client can ask to do something. It cannot decide money, inventory,
ownership, production rewards or - once the casino exists - a gambling outcome.
Those all come back from the database.

```
src/
  app/
    (auth)/          sign in / sign up
    (game)/          the shell: dashboard, world, company, land
    onboarding/      company creation
    auth/            OAuth-style callback + sign out
  components/        UI primitives and the HUD shell
  config/            economy.ts - all balance numbers in one place
  game/
    world/           grid maths, terrain, city blocks, map camera, labels, HUD
  lib/
    supabase/        browser / server / admin clients
    economy/         money parsing and formatting
    validation/      zod schemas mirroring the DB constraints
    errors.ts        game error codes -> human sentences
  services/          server-side data loading
  types/             database row types
supabase/
  migrations/        the schema, in order
  tests/             SQL test suite incl. exploit scenarios
```

### Design decisions worth knowing

**Money is `numeric(20,2)`, and arrives in JavaScript as a string.** That is
deliberate: exact decimal arithmetic in Postgres, no floating-point drift on a
balance. Parse with `toAmount()` at the point of display.

**Balance values live in the database, not in the code.** The `game_config`
table is what server logic reads, so the economy can be retuned without a
deploy. `src/config/economy.ts` mirrors the defaults for the UI and documents
them in one readable place.

**The world grid has one source of truth.** A cell is either a plot row or a
gap, and the renderer draws road in every gap. Nothing in the client decides
where anything is.

**The 3D bundle is lazy.** Three.js, R3F and drei load only on `/world`.

**Scenery is never a fake business.** Background city blocks are drawn only on
*unclaimed* land, and a claimed plot is marked by its label and pad colour
rather than by a building - because Phase 1 has no businesses yet, and drawing
one would show a company that does not exist.

**The map is a map, not a walkable world.** You look down on the city and
click plots. There is no avatar and no first- or third-person camera; an
earlier draft had one, and it was the wrong game.

## Development

```bash
npm run check      # typecheck + lint + unit tests
npm run typecheck
npm run lint
npm run test       # vitest
npm run test:db    # applies migrations to a throwaway Postgres and tests them
npm run build
```

`npm run test:db` needs a Postgres you can create databases on (`PGHOST`,
`PGPORT`, `PGUSER`). It is the suite that actually proves the anti-cheat
guarantees; see [`supabase/README.md`](supabase/README.md).

## Roadmap

Each phase leaves the game playable.

| Phase | Contents | Status |
| --- | --- | --- |
| 1 | Auth, profiles, companies, starting cash, starter land, app shell, 3D world | ✅ done |
| 2 | Richer world: districts, props, vehicles as scenery, day lighting | next |
| 3 | First business: place a farm, active work, passive income, sell produce | |
| 4 | Resources, production chains, factories, mines, the resource market | |
| 5 | More land, shops, workers, vehicles, logistics, property rental | |
| 6 | The stock market: shares, holdings, price history, valuation | |
| 7 | Multiplayer presence: other players' companies live on the map | |
| 8 | Advertising: ad slots, billboards, image uploads, campaign stats | |
| 9 | Gambling district: roulette, slots, dice, blackjack, fictional sports, prediction markets | |
| 10 | Polish: models, sound, effects, onboarding, performance, mobile menus | |

## Deployment

Deploys to Vercel as-is. There is no long-running server process: offline
progression is calculated from timestamps when a player returns rather than by
a background loop, which is what makes the game serverless-friendly.

Set the three environment variables in the Vercel project, and point them at the
Supabase project whose migrations you have applied.
