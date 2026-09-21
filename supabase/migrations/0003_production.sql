-- ===========================================================================
-- World Economy - Phases 3-5: businesses, resources, inventory, market
--
-- Adds the core money loop:
--   buy land -> build a business -> work it -> it produces while you are away
--   -> sell goods -> upgrade and hire -> buy more land
--
-- Same rules as 0001: the database owns every value, players get no direct
-- write access, and every change to cash or inventory is audited.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Ledger types become text with a CHECK.
--
-- 0001 used an enum, but every later phase (stocks, advertising, gambling)
-- adds more types, and extending an enum is awkward inside a migration
-- transaction. A checked text column is just as safe and far easier to grow.
-- ---------------------------------------------------------------------------

alter table public.player_transactions
  alter column type type text using type::text;

-- The old function's signature names the enum, so it has to go first.
drop function if exists public.apply_money_delta(uuid, numeric, public.ledger_type, text, uuid, text);
drop type if exists public.ledger_type;

alter table public.player_transactions
  add constraint player_transactions_type_check check (type in (
    'STARTING_BALANCE',
    'ADMIN_GRANT',
    'LAND_PURCHASE',
    'BUILDING_PURCHASE',
    'BUILDING_UPGRADE',
    'WORKER_HIRE',
    'WORK_REWARD',
    'BUSINESS_REVENUE',
    'RESOURCE_PURCHASE',
    'RESOURCE_SALE'
  ));

-- Recreated with a text `type` argument.
create or replace function public.apply_money_delta(
  p_player         uuid,
  p_amount         numeric,
  p_type           text,
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

revoke all on function public.apply_money_delta(uuid, numeric, text, text, uuid, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- resource_types: the goods economy. `price` is the live market price and is
-- the ONLY price any trade uses.
-- ---------------------------------------------------------------------------

create table public.resource_types (
  key         text primary key check (key ~ '^[a-z_]{2,24}$'),
  name        text not null,
  base_price  numeric(12, 2) not null check (base_price > 0),
  price       numeric(12, 2) not null check (price > 0),
  -- Raw goods are dug or grown; refined goods are made from raw ones.
  tier        text not null check (tier in ('raw', 'refined')),
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now()
);

insert into public.resource_types (key, name, base_price, price, tier, sort_order) values
  ('wheat', 'Wheat', 4.00,  4.00,  'raw',     1),
  ('ore',   'Ore',   7.00,  7.00,  'raw',     2),
  ('food',  'Food',  14.00, 14.00, 'refined', 3),
  ('steel', 'Steel', 22.00, 22.00, 'refined', 4);

-- ---------------------------------------------------------------------------
-- business_types: what a player can build, and its balance numbers.
--
-- Server-side data rather than TypeScript constants, so the server validates
-- every build and production tick against the same definition the UI shows.
-- ---------------------------------------------------------------------------

create table public.business_types (
  key              text primary key check (key ~ '^[a-z_]{2,24}$'),
  name             text not null,
  description      text not null,
  build_cost       numeric(20, 2) not null check (build_cost > 0),
  -- Zones this business may be built in.
  allowed_zones    public.plot_zone[] not null,
  -- What it produces per hour at level 1 with no workers. Null for a business
  -- that makes cash instead of goods.
  output_resource  text references public.resource_types (key),
  output_per_hour  numeric(10, 2) not null default 0 check (output_per_hour >= 0),
  -- What it consumes per unit of output, if anything.
  input_resource   text references public.resource_types (key),
  input_per_output numeric(10, 2) not null default 0 check (input_per_output >= 0),
  -- Instant reward for working it by hand, in units of output_resource.
  work_yield       numeric(10, 2) not null default 0 check (work_yield >= 0),
  -- A store turns goods into cash: units sold per hour, at this share of the
  -- market price. Lower than the market, because it needs no clicks.
  sells_goods      boolean not null default false,
  sell_rate_share  numeric(4, 3) not null default 0.85
                   check (sell_rate_share > 0 and sell_rate_share <= 1),
  -- A warehouse extends how long production accrues while you are offline.
  offline_bonus_hours integer not null default 0 check (offline_bonus_hours >= 0),
  sort_order       integer not null default 0
);

insert into public.business_types (
  key, name, description, build_cost, allowed_zones,
  output_resource, output_per_hour, input_resource, input_per_output,
  work_yield, sells_goods, offline_bonus_hours, sort_order
) values
  ('farm', 'Farm',
   'Grows wheat. Cheapest way to start earning, and the only thing rural land is good for.',
   5000, array['rural', 'residential']::public.plot_zone[],
   'wheat', 14, null, 0, 10, false, 0, 1),

  ('mine', 'Mine',
   'Digs ore out of the ground. Steel foundries will buy everything you produce.',
   7500, array['mining', 'industrial']::public.plot_zone[],
   'ore', 10, null, 0, 8, false, 0, 2),

  ('mill', 'Food Mill',
   'Turns 2 wheat into 1 food. Needs wheat in your inventory to keep running.',
   12000, array['industrial', 'commercial']::public.plot_zone[],
   'food', 6, 'wheat', 2, 5, false, 0, 3),

  ('foundry', 'Steel Foundry',
   'Turns 2 ore into 1 steel. Needs ore in your inventory to keep running.',
   15000, array['industrial']::public.plot_zone[],
   'steel', 5, 'ore', 2, 4, false, 0, 4),

  ('store', 'Store',
   'Sells goods from your inventory automatically, at 85% of the market price. No clicks needed.',
   6000, array['commercial', 'downtown', 'residential']::public.plot_zone[],
   null, 8, null, 0, 0, true, 0, 5),

  ('warehouse', 'Warehouse',
   'Adds 8 hours to how long your businesses keep producing while you are offline.',
   8000, array['industrial', 'waterfront']::public.plot_zone[],
   null, 0, null, 0, 0, false, 8, 6);

-- ---------------------------------------------------------------------------
-- buildings: one business per plot.
-- ---------------------------------------------------------------------------

create table public.buildings (
  id                uuid primary key default gen_random_uuid(),
  plot_id           uuid not null unique references public.plots (id) on delete cascade,
  owner_id          uuid not null references public.profiles (id) on delete cascade,
  business_type     text not null references public.business_types (key),
  level             integer not null default 1 check (level between 1 and 5),
  workers           integer not null default 0 check (workers >= 0),
  -- Production accrues from here; every collection moves it forward.
  last_collected_at timestamptz not null default now(),
  -- Active work is rate limited off this.
  last_worked_at    timestamptz,
  -- What the owner has sunk into it, for net worth.
  invested_value    numeric(20, 2) not null default 0 check (invested_value >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index buildings_owner_idx on public.buildings (owner_id);
create index buildings_type_idx on public.buildings (business_type);

create trigger buildings_touch_updated_at
  before update on public.buildings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- player_inventory: goods a player holds. Quantity can never go negative.
-- ---------------------------------------------------------------------------

create table public.player_inventory (
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  resource_key text not null references public.resource_types (key),
  quantity     numeric(16, 2) not null default 0 check (quantity >= 0),
  updated_at   timestamptz not null default now(),
  primary key (owner_id, resource_key)
);

-- ---------------------------------------------------------------------------
-- inventory_transactions: append-only goods ledger, so any quantity a player
-- holds can be traced the same way their cash can.
-- ---------------------------------------------------------------------------

create table public.inventory_transactions (
  id             bigserial primary key,
  player_id      uuid not null references public.profiles (id) on delete cascade,
  resource_key   text not null references public.resource_types (key),
  type           text not null check (type in (
                   'PRODUCTION', 'WORK_REWARD', 'CONSUMED',
                   'MARKET_BUY', 'MARKET_SELL', 'STORE_SALE', 'ADMIN_GRANT'
                 )),
  quantity       numeric(16, 2) not null,
  balance_after  numeric(16, 2) not null check (balance_after >= 0),
  reference_type text,
  reference_id   uuid,
  created_at     timestamptz not null default now()
);

create index inventory_transactions_player_idx
  on public.inventory_transactions (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: read what you are allowed to, write nothing.
-- ---------------------------------------------------------------------------

alter table public.resource_types         enable row level security;
alter table public.business_types         enable row level security;
alter table public.buildings              enable row level security;
alter table public.player_inventory       enable row level security;
alter table public.inventory_transactions enable row level security;

-- Prices and build costs are public knowledge; the UI shows them.
create policy resource_types_select_all on public.resource_types
  for select to authenticated using (true);

create policy business_types_select_all on public.business_types
  for select to authenticated using (true);

-- Buildings are visible on the map, so everyone can see everyone's.
create policy buildings_select_all on public.buildings
  for select to authenticated using (true);

-- Inventory is private.
create policy inventory_select_own on public.player_inventory
  for select to authenticated using (owner_id = auth.uid());

create policy inventory_transactions_select_own on public.inventory_transactions
  for select to authenticated using (player_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Privilege hardening, matching 0001: RLS is on AND the write grants are gone.
-- ---------------------------------------------------------------------------

revoke insert, update, delete, truncate on public.resource_types         from anon, authenticated;
revoke insert, update, delete, truncate on public.business_types         from anon, authenticated;
revoke insert, update, delete, truncate on public.buildings              from anon, authenticated;
revoke insert, update, delete, truncate on public.player_inventory       from anon, authenticated;
revoke insert, update, delete, truncate on public.inventory_transactions from anon, authenticated;
revoke all on public.inventory_transactions_id_seq from anon, authenticated;

revoke all on table public.resource_types         from anon;
revoke all on table public.business_types         from anon;
revoke all on table public.buildings              from anon;
revoke all on table public.player_inventory       from anon;
revoke all on table public.inventory_transactions from anon;
