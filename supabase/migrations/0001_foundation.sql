-- ===========================================================================
-- World Economy - Phase 1: Foundation
--
-- Design rules enforced here:
--   * The database is the single source of truth for money, ownership and
--     progression. The browser can never write these values directly.
--   * All user-facing writes go through SECURITY DEFINER functions that
--     validate, lock and audit. Direct INSERT/UPDATE/DELETE grants on
--     economic tables are not given to the `authenticated` role.
--   * Every money movement produces a row in player_transactions.
--   * Money is numeric(20,2): exact decimal arithmetic, no float drift.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.plot_zone as enum (
  'downtown',
  'commercial',
  'industrial',
  'residential',
  'rural',
  'mining',
  'waterfront',
  'entertainment',
  'gambling'
);

create type public.company_industry as enum (
  'agriculture',
  'mining',
  'manufacturing',
  'retail',
  'logistics',
  'entertainment',
  'services'
);

-- Ledger entry types. Extend with ALTER TYPE ... ADD VALUE in later phases.
create type public.ledger_type as enum (
  'STARTING_BALANCE',
  'LAND_PURCHASE',
  'ADMIN_GRANT'
);

-- ---------------------------------------------------------------------------
-- game_config: runtime-tunable economy values.
--
-- Server logic reads balance numbers from here rather than hardcoding them,
-- so the economy can be retuned without a code deploy. src/config/economy.ts
-- mirrors these defaults for display purposes; this table always wins.
-- ---------------------------------------------------------------------------

create table public.game_config (
  key         text primary key,
  value       numeric(20, 4) not null,
  description text not null,
  updated_at  timestamptz not null default now()
);

insert into public.game_config (key, value, description) values
  ('starting_cash',        10000, 'Cash granted to a player when they finish onboarding.'),
  ('offline_cap_hours',       24, 'Maximum hours of offline production credited on return.'),
  ('starter_plot_count',        1, 'Free plots granted at onboarding.');

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user. `cash` is the player's wallet.
-- ---------------------------------------------------------------------------

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  username       text not null unique
                 check (char_length(username) between 3 and 20
                        and username ~ '^[A-Za-z0-9_]+$'),
  cash           numeric(20, 2) not null default 0 check (cash >= 0),
  is_admin       boolean not null default false,
  onboarded_at   timestamptz,
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column public.profiles.cash is
  'Fictional in-game currency. Written only by apply_money_delta().';

-- ---------------------------------------------------------------------------
-- companies: exactly one main company per player.
-- ---------------------------------------------------------------------------

create table public.companies (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null unique references public.profiles (id) on delete cascade,
  name           text not null unique
                 check (char_length(btrim(name)) between 3 and 40),
  ticker         text not null unique check (ticker ~ '^[A-Z]{2,5}$'),
  industry       public.company_industry not null,
  logo_url       text,
  level          integer not null default 1 check (level between 1 and 100),
  total_revenue  numeric(20, 2) not null default 0 check (total_revenue >= 0),
  total_expenses numeric(20, 2) not null default 0 check (total_expenses >= 0),
  company_value  numeric(20, 2) not null default 0 check (company_value >= 0),
  stock_price    numeric(12, 2) not null default 10.00 check (stock_price > 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- plots: the world is a fixed grid of plots, seeded in 0002.
-- owner_id null  => unowned (buyable if is_purchasable).
-- ---------------------------------------------------------------------------

create table public.plots (
  id                  uuid primary key default gen_random_uuid(),
  grid_x              integer not null,
  grid_z              integer not null,
  zone                public.plot_zone not null,
  size                integer not null default 1 check (size between 1 and 4),
  purchase_price      numeric(20, 2) not null check (purchase_price >= 0),
  building_capacity   integer not null default 1 check (building_capacity > 0),
  owner_id            uuid references public.profiles (id) on delete set null,
  -- System landmarks (casino, city hall, public parks) are never for sale.
  is_purchasable      boolean not null default true,
  -- Cheap zones flagged as valid free starter land.
  is_starter_eligible boolean not null default false,
  acquired_at         timestamptz,
  created_at          timestamptz not null default now(),
  unique (grid_x, grid_z)
);

create index plots_owner_idx on public.plots (owner_id) where owner_id is not null;
create index plots_zone_idx on public.plots (zone);
create index plots_available_idx on public.plots (zone)
  where owner_id is null and is_purchasable;

-- ---------------------------------------------------------------------------
-- player_transactions: append-only money ledger. Every cash change lands here
-- with the before/after balance so any amount can be traced to its origin.
-- ---------------------------------------------------------------------------

create table public.player_transactions (
  id             bigserial primary key,
  player_id      uuid not null references public.profiles (id) on delete cascade,
  type           public.ledger_type not null,
  amount         numeric(20, 2) not null,
  balance_before numeric(20, 2) not null,
  balance_after  numeric(20, 2) not null,
  reference_type text,
  reference_id   uuid,
  description    text,
  created_at     timestamptz not null default now()
);

create index player_transactions_player_idx
  on public.player_transactions (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger companies_touch_updated_at
  before update on public.companies
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Error helper
--
-- Server logic raises stable machine-readable codes (INSUFFICIENT_FUNDS,
-- NOT_OWNER, ...). The web layer maps them to human sentences; it never shows
-- a raw Postgres error to the player.
-- ===========================================================================

create or replace function public.game_error(p_code text, p_detail text default null)
returns void
language plpgsql
immutable
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = p_code,
    detail  = coalesce(p_detail, '');
end;
$$;

-- ===========================================================================
-- apply_money_delta: the ONLY way profiles.cash changes.
--
-- Locks the wallet row, refuses to go negative, and writes an audit row.
-- Internal: not executable by anon/authenticated.
-- ===========================================================================

create or replace function public.apply_money_delta(
  p_player         uuid,
  p_amount         numeric,
  p_type           public.ledger_type,
  p_reference_type text default null,
  p_reference_id   uuid default null,
  p_description    text default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before numeric(20, 2);
  v_after  numeric(20, 2);
begin
  if p_amount is null or p_amount = 0 then
    perform public.game_error('INVALID_AMOUNT');
  end if;

  -- Row lock serialises concurrent spends: the same $10,000 cannot be
  -- committed twice by two simultaneous requests.
  select cash into v_before from public.profiles where id = p_player for update;
  if not found then
    perform public.game_error('PLAYER_NOT_FOUND');
  end if;

  v_after := round(v_before + p_amount, 2);
  if v_after < 0 then
    perform public.game_error('INSUFFICIENT_FUNDS');
  end if;

  update public.profiles set cash = v_after where id = p_player;

  insert into public.player_transactions (
    player_id, type, amount, balance_before, balance_after,
    reference_type, reference_id, description
  ) values (
    p_player, p_type, round(p_amount, 2), v_before, v_after,
    p_reference_type, p_reference_id, p_description
  );

  return v_after;
end;
$$;

-- ===========================================================================
-- Valuation. Centralised so nothing double-counts (see design note §32).
-- Phase 1 assets: cash + land. Buildings, inventory, vehicles and stock
-- holdings are folded in by later phases.
-- ===========================================================================

create or replace function public.player_land_value(p_player uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(purchase_price), 0)::numeric(20, 2)
  from public.plots
  where owner_id = p_player;
$$;

create or replace function public.player_net_worth(p_player uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (
    coalesce((select cash from public.profiles where id = p_player), 0)
    + public.player_land_value(p_player)
  )::numeric(20, 2);
$$;

-- A company is currently valued at the land it holds. Revenue-driven
-- valuation and stock pricing arrive with the stock market phase.
create or replace function public.recalculate_company_value(p_owner uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_value numeric(20, 2);
begin
  v_value := public.player_land_value(p_owner);
  update public.companies set company_value = v_value where owner_id = p_owner;
  return v_value;
end;
$$;

-- ===========================================================================
-- New auth user -> profile row, with a provisional username that onboarding
-- replaces with the player's chosen one.
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'player_' || substr(replace(new.id::text, '-', ''), 1, 12))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- complete_onboarding: atomic "become a player".
--
-- Sets the username, creates the company, grants the starting balance (with
-- a ledger row) and claims the free starter plot(s) - all or nothing.
-- ===========================================================================

create or replace function public.complete_onboarding(
  p_username     text,
  p_company_name text,
  p_ticker       text,
  p_industry     public.company_industry
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player   uuid := auth.uid();
  v_username text := btrim(coalesce(p_username, ''));
  v_name     text := btrim(coalesce(p_company_name, ''));
  v_ticker   text := upper(btrim(coalesce(p_ticker, '')));
  v_cash     numeric(20, 2);
  v_plots    integer;
  v_company  public.companies;
  v_plot_ids uuid[] := '{}';
  v_plot_id  uuid;
  v_i        integer;
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  -- Serialise against a second concurrent onboarding for the same player.
  perform 1 from public.profiles where id = v_player for update;
  if not found then
    perform public.game_error('PLAYER_NOT_FOUND');
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_player and onboarded_at is not null
  ) then
    perform public.game_error('ALREADY_ONBOARDED');
  end if;

  -- Server-side validation. The client validates too, for a nicer form, but
  -- these checks are the ones that count.
  if v_username !~ '^[A-Za-z0-9_]{3,20}$' then
    perform public.game_error('INVALID_USERNAME');
  end if;
  if char_length(v_name) < 3 or char_length(v_name) > 40 then
    perform public.game_error('INVALID_COMPANY_NAME');
  end if;
  -- Company names are rendered as plain text, never as markup, but we still
  -- refuse angle brackets and control characters outright.
  if v_name ~ '[<>]' or v_name ~ '[[:cntrl:]]' then
    perform public.game_error('INVALID_COMPANY_NAME');
  end if;
  if v_ticker !~ '^[A-Z]{2,5}$' then
    perform public.game_error('INVALID_TICKER');
  end if;

  if exists (select 1 from public.profiles where username = v_username and id <> v_player) then
    perform public.game_error('USERNAME_TAKEN');
  end if;
  if exists (select 1 from public.companies where lower(name) = lower(v_name)) then
    perform public.game_error('COMPANY_NAME_TAKEN');
  end if;
  if exists (select 1 from public.companies where ticker = v_ticker) then
    perform public.game_error('TICKER_TAKEN');
  end if;

  select value into v_cash from public.game_config where key = 'starting_cash';
  select value into v_plots from public.game_config where key = 'starter_plot_count';
  v_cash := coalesce(v_cash, 10000);
  v_plots := coalesce(v_plots, 1);

  update public.profiles set username = v_username where id = v_player;

  insert into public.companies (owner_id, name, ticker, industry)
  values (v_player, v_name, v_ticker, p_industry)
  returning * into v_company;

  -- Claim starter land. SKIP LOCKED means two players onboarding at the same
  -- moment can never be handed the same plot.
  for v_i in 1..v_plots loop
    select id into v_plot_id
    from public.plots
    where owner_id is null
      and is_purchasable
      and is_starter_eligible
    order by random()
    limit 1
    for update skip locked;

    if not found then
      perform public.game_error('NO_STARTER_LAND_AVAILABLE');
    end if;

    update public.plots
    set owner_id = v_player, acquired_at = now()
    where id = v_plot_id;

    v_plot_ids := v_plot_ids || v_plot_id;
  end loop;

  perform public.apply_money_delta(
    v_player, v_cash, 'STARTING_BALANCE', 'profile', v_player,
    'Welcome to World Economy'
  );

  update public.profiles
  set onboarded_at = now(), last_active_at = now()
  where id = v_player;

  perform public.recalculate_company_value(v_player);

  return jsonb_build_object(
    'company_id', v_company.id,
    'ticker', v_company.ticker,
    'starting_cash', v_cash,
    'plot_ids', to_jsonb(v_plot_ids)
  );
exception
  -- A lost race on one of the unique indexes surfaces as a friendly code
  -- rather than a Postgres constraint name.
  when unique_violation then
    perform public.game_error('NAME_TAKEN');
    return null;
end;
$$;

-- ===========================================================================
-- heartbeat: refreshes last_active_at, which offline progression keys off.
-- ===========================================================================

create or replace function public.heartbeat()
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  if auth.uid() is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;
  update public.profiles set last_active_at = v_now where id = auth.uid();
  return v_now;
end;
$$;

-- ===========================================================================
-- Row Level Security
--
-- Players get READ access to what they are allowed to see and NO direct write
-- access to anything economic. Mutations happen exclusively through the
-- SECURITY DEFINER functions above, which validate and audit.
-- ===========================================================================

alter table public.profiles            enable row level security;
alter table public.companies           enable row level security;
alter table public.plots               enable row level security;
alter table public.player_transactions enable row level security;
alter table public.game_config         enable row level security;

-- A player reads their own profile. Cash is private, so there is no
-- all-profiles read policy; public identity lives on `companies`.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- Companies are public entities: everyone can see names, tickers and values.
create policy companies_select_all on public.companies
  for select to authenticated
  using (true);

-- The world map is public: everyone can see every plot and who owns it.
create policy plots_select_all on public.plots
  for select to authenticated
  using (true);

-- A player can audit their own money, and only their own.
create policy transactions_select_own on public.player_transactions
  for select to authenticated
  using (player_id = auth.uid());

-- Balance numbers are not secret; the client shows them in the UI.
create policy game_config_select_all on public.game_config
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- Explicit privilege hardening.
--
-- Even with RLS on and no write policies, we remove the write grants so a
-- forgotten policy can never become a write path.
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate on public.profiles            from anon, authenticated;
revoke insert, update, delete, truncate on public.companies           from anon, authenticated;
revoke insert, update, delete, truncate on public.plots               from anon, authenticated;
revoke insert, update, delete, truncate on public.player_transactions from anon, authenticated;
revoke insert, update, delete, truncate on public.game_config         from anon, authenticated;
revoke all on public.player_transactions_id_seq from anon, authenticated;

revoke all on table public.profiles            from anon;
revoke all on table public.companies           from anon;
revoke all on table public.plots               from anon;
revoke all on table public.player_transactions from anon;
revoke all on table public.game_config         from anon;

-- ---------------------------------------------------------------------------
-- Function privileges.
--
-- SECURITY DEFINER functions are granted to PUBLIC by default, so internal
-- helpers must be explicitly locked down.
-- ---------------------------------------------------------------------------

revoke all on function public.apply_money_delta(uuid, numeric, public.ledger_type, text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.recalculate_company_value(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.player_land_value(uuid) from public, anon, authenticated;
revoke all on function public.player_net_worth(uuid) from public, anon, authenticated;

revoke all on function public.complete_onboarding(text, text, text, public.company_industry)
  from public, anon;
grant execute on function public.complete_onboarding(text, text, text, public.company_industry)
  to authenticated;

revoke all on function public.heartbeat() from public, anon;
grant execute on function public.heartbeat() to authenticated;

-- A player may ask for their own net worth; the function ignores any other id.
create or replace function public.my_net_worth()
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.player_net_worth(auth.uid());
$$;

revoke all on function public.my_net_worth() from public, anon;
grant execute on function public.my_net_worth() to authenticated;
