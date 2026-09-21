# World Economy

A persistent multiplayer 3D business sandbox. One shared world, one shared
economy: own land, run a company, produce goods, trade with other players and
build an empire that keeps running while you are logged out.

All currency in the game is fictional and has no real-world value. There are no
deposits, withdrawals, purchases or cash-outs, and no real-money gambling.

## Status: playable

The full money loop works end to end:

**Buy land → build a business → work it by hand → it produces while you're away
→ sell goods on the market → upgrade and hire → buy more land.**

What works today:

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
- **Buying land** — the cheapest unclaimed plots in each district, priced by zone
- **Six businesses** — Farm, Mine, Food Mill, Steel Foundry, Store, Warehouse,
  each buildable only in the districts that suit it
- **Active work** — work a business by hand for an instant batch of goods plus a
  cash tip, on a server-enforced cooldown
- **Offline production** — businesses keep producing while you are logged out,
  calculated from timestamps and capped (24h, extended by warehouses)
- **Two production chains** — `wheat → food` and `ore → steel`, so a farmer and a
  mill owner genuinely need each other
- **Inventory** — exact quantities, written only by the database
- **A resource market** — one server-set price per good that drifts with what
  players actually trade: selling pushes a price down, buying pushes it up
- **Upgrades and workers** — five levels, worker slots that scale with level
- **Businesses on the map** — a farm looks like a farm, and a level 5 anything
  towers over a level 1
- Everything persists: refreshing or logging out changes nothing

Not built yet, and deliberately marked "soon" in the navigation rather than
faked: the stock market, property rental, vehicles, advertising, the gambling
district and leaderboards. See [Roadmap](#roadmap).

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
  services/
    player/          the signed-in player's state
    economy/         economy read models and every game action
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

**Offline progress is arithmetic, not a background job.** Production is
`elapsed_hours x rate`, computed from `last_collected_at` when you come back
and capped. Nothing runs on a schedule, which is what lets the world keep
turning on serverless hosting.

**Every action is one database function.** `buy_plot`, `build_business`,
`work_business`, `collect_all`, `upgrade_business`, `hire_worker`,
`sell_resource`, `buy_resource`. Each validates, locks, acts and audits in a
single transaction. The server actions in `src/services/economy/actions.ts`
only shape input and translate errors - they never decide an outcome.

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
| 1 | Auth, profiles, companies, starting cash, starter land, app shell | ✅ done |
| 2 | The isometric city map: districts, buildings, clickable plots | ✅ done |
| 3 | First business: build, active work, passive income, inventory | ✅ done |
| 4 | Resources, production chains, the resource market | ✅ done |
| 5 | Buying land, upgrades, workers, warehouses | ✅ done |
| 6 | The stock market: shares, holdings, price history, valuation | next |
| 7 | Multiplayer presence: other players' companies live on the map | |
| 8 | Advertising: ad slots, billboards, image uploads, campaign stats | |
| 9 | Gambling district: roulette, slots, dice, blackjack, fictional sports, prediction markets | |
| 10 | Polish: models, sound, effects, onboarding, performance, mobile menus | |

Phase 5 is partly done: land, upgrades, workers and warehouses are in; shops,
property rental, vehicles and logistics are not.

## Deployment

Deploys to Vercel as-is. There is no long-running server process: offline
progression is calculated from timestamps when a player returns rather than by
a background loop, which is what makes the game serverless-friendly.

Set the three environment variables in the Vercel project, and point them at the
Supabase project whose migrations you have applied.
