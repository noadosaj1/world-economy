# Database

Postgres is the source of truth for World Economy. Money, land, ownership and
every other economic value live here, and the browser cannot write any of them.

## Applying the migrations

Run the files in `migrations/` in filename order against your Supabase project.

With the Supabase CLI:

```bash
supabase db push
```

Or paste each file into the SQL editor in the Supabase dashboard, oldest first.

| File | What it adds |
| --- | --- |
| `0001_foundation.sql` | Enums, `game_config`, `profiles`, `companies`, `plots`, `player_transactions`, the money/valuation/onboarding functions, RLS policies and privilege hardening. |
| `0002_world_plots.sql` | Seeds the 25x25 world grid: 400 plots across nine zones, with landmark plots taken off the market. |

Migrations are additive and reproducible. Never edit a migration that has been
applied to a live project - add a new one.

## The rules this schema enforces

1. **`profiles.cash` is written by exactly one function**, `apply_money_delta()`.
   It locks the wallet row, refuses to go negative, and writes a
   `player_transactions` row recording the balance before and after. Every
   amount a player holds can therefore be traced to its origin.
2. **Players have no write privileges** on `profiles`, `companies`, `plots`,
   `player_transactions` or `game_config`. RLS is on *and* the INSERT/UPDATE/
   DELETE grants are revoked, so a forgotten policy cannot become a write path.
3. **Mutations happen in `SECURITY DEFINER` functions** with a pinned
   `search_path`. Internal helpers are revoked from `anon` and `authenticated`;
   only deliberate entry points (`complete_onboarding`, `heartbeat`,
   `my_net_worth`) are granted.
4. **Onboarding is atomic.** Company creation, the starting grant and the
   starter-plot claim either all happen or none do. Concurrent onboarding is
   serialised by a row lock, and starter land is claimed with
   `FOR UPDATE SKIP LOCKED` so two players can never be handed the same plot.
5. **Errors are stable codes**, not Postgres text. `game_error('INSUFFICIENT_FUNDS')`
   is translated to a human sentence in `src/lib/errors.ts`.

## Running the tests

`supabase/tests/` holds a SQL suite that applies the migrations to a throwaway
database and asserts these guarantees, including the exploit scenarios: onboarding
twice for a double grant, writing your own balance, forging a ledger row, taking
land by UPDATE, reading another player's wallet, and whether a failed onboarding
leaves money behind.

```bash
# Against any Postgres you can create databases on:
PGHOST=... PGPORT=... PGUSER=... npm run test:db
```

`00_shim.sql` recreates the parts of Supabase the migrations depend on (the
`anon`/`authenticated`/`service_role` roles, a minimal `auth.users`, and
`auth.uid()`), including Supabase's default table grants - which is what makes
the `REVOKE` statements in `0001` a meaningful test rather than a no-op.

It is a test fixture and is never applied to a real project.
