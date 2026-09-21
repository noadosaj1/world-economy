-- ===========================================================================
-- World Economy - Phases 3-5: the game actions
--
-- Every function here is the only way its part of the economy can change.
-- All of them: validate, lock, act, audit - in one transaction.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Inventory movement. The only way player_inventory changes.
-- ---------------------------------------------------------------------------

create or replace function public.apply_inventory_delta(
  p_player         uuid,
  p_resource       text,
  p_quantity       numeric,
  p_type           text,
  p_reference_type text default null,
  p_reference_id   uuid default null
)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_after numeric(16, 2);
begin
  if p_quantity is null or p_quantity = 0 then
    perform public.game_error('INVALID_QUANTITY');
  end if;

  -- Create the row on first use, then lock it for the update.
  insert into public.player_inventory (owner_id, resource_key, quantity)
  values (p_player, p_resource, 0)
  on conflict (owner_id, resource_key) do nothing;

  select quantity into v_after
  from public.player_inventory
  where owner_id = p_player and resource_key = p_resource
  for update;

  v_after := round(v_after + p_quantity, 2);
  if v_after < 0 then
    perform public.game_error('NOT_ENOUGH_GOODS');
  end if;

  update public.player_inventory
  set quantity = v_after, updated_at = now()
  where owner_id = p_player and resource_key = p_resource;

  insert into public.inventory_transactions (
    player_id, resource_key, type, quantity, balance_after,
    reference_type, reference_id
  ) values (
    p_player, p_resource, p_type, round(p_quantity, 2), v_after,
    p_reference_type, p_reference_id
  );

  return v_after;
end;
$$;

revoke all on function public.apply_inventory_delta(uuid, text, numeric, text, text, uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Output multipliers. Kept in one place so the UI and the server cannot drift.
--   level 1..5  ->  1.0 .. 3.0
--   each worker ->  +12%
-- ---------------------------------------------------------------------------

create or replace function public.production_multiplier(p_level integer, p_workers integer)
returns numeric
language sql
immutable
as $$
  select (1 + 0.5 * (greatest(p_level, 1) - 1)) * (1 + 0.12 * greatest(p_workers, 0));
$$;

/** Worker slots a building has at its current level. */
create or replace function public.max_workers(p_level integer)
returns integer
language sql
immutable
as $$
  select greatest(p_level, 1) * 2;
$$;

/** Cost to reach the next level. */
create or replace function public.upgrade_cost(p_build_cost numeric, p_level integer)
returns numeric
language sql
immutable
as $$
  select round(p_build_cost * 0.75 * greatest(p_level, 1), 2);
$$;

/** Cost of one more worker. */
create or replace function public.worker_cost(p_build_cost numeric)
returns numeric
language sql
immutable
as $$
  select round(p_build_cost * 0.05, 2);
$$;

-- ---------------------------------------------------------------------------
-- How long a player's production accrues while they are away: the base cap
-- from game_config, plus each warehouse they own, to a hard ceiling.
-- ---------------------------------------------------------------------------

create or replace function public.offline_cap_hours(p_player uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select least(
    72,
    coalesce((select value from public.game_config where key = 'offline_cap_hours'), 24)
    + coalesce((
      select sum(bt.offline_bonus_hours)
      from public.buildings b
      join public.business_types bt on bt.key = b.business_type
      where b.owner_id = p_player
    ), 0)
  )::numeric;
$$;

-- ---------------------------------------------------------------------------
-- buy_plot: claim unowned land.
-- ---------------------------------------------------------------------------

create or replace function public.buy_plot(p_plot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid := auth.uid();
  v_plot   public.plots;
  v_cash   numeric(20, 2);
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  -- Lock the plot: two players clicking Buy at the same moment cannot both
  -- succeed.
  select * into v_plot from public.plots where id = p_plot_id for update;
  if not found then
    perform public.game_error('PLOT_NOT_FOUND');
  end if;
  if not v_plot.is_purchasable then
    perform public.game_error('PLOT_NOT_FOR_SALE');
  end if;
  if v_plot.owner_id is not null then
    perform public.game_error('PLOT_ALREADY_OWNED');
  end if;

  v_cash := public.apply_money_delta(
    v_player, -v_plot.purchase_price, 'LAND_PURCHASE', 'plot', p_plot_id,
    'Bought land'
  );

  update public.plots
  set owner_id = v_player, acquired_at = now()
  where id = p_plot_id;

  perform public.recalculate_company_value(v_player);

  return jsonb_build_object('plot_id', p_plot_id, 'cash', v_cash);
end;
$$;

-- ---------------------------------------------------------------------------
-- build_business: put a business on a plot you own.
-- ---------------------------------------------------------------------------

create or replace function public.build_business(p_plot_id uuid, p_business_type text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player   uuid := auth.uid();
  v_plot     public.plots;
  v_type     public.business_types;
  v_building uuid;
  v_cash     numeric(20, 2);
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  select * into v_plot from public.plots where id = p_plot_id for update;
  if not found then
    perform public.game_error('PLOT_NOT_FOUND');
  end if;
  if v_plot.owner_id is distinct from v_player then
    perform public.game_error('NOT_OWNER');
  end if;

  if exists (select 1 from public.buildings where plot_id = p_plot_id) then
    perform public.game_error('PLOT_OCCUPIED');
  end if;

  select * into v_type from public.business_types where key = p_business_type;
  if not found then
    perform public.game_error('UNKNOWN_BUSINESS_TYPE');
  end if;

  -- Location matters: a farm cannot go downtown.
  if not (v_plot.zone = any (v_type.allowed_zones)) then
    perform public.game_error('WRONG_ZONE');
  end if;

  v_cash := public.apply_money_delta(
    v_player, -v_type.build_cost, 'BUILDING_PURCHASE', 'plot', p_plot_id,
    'Built ' || v_type.name
  );

  insert into public.buildings (
    plot_id, owner_id, business_type, invested_value, last_collected_at
  ) values (
    p_plot_id, v_player, p_business_type, v_type.build_cost, now()
  )
  returning id into v_building;

  perform public.recalculate_company_value(v_player);

  return jsonb_build_object('building_id', v_building, 'cash', v_cash);
end;
$$;

-- ---------------------------------------------------------------------------
-- upgrade_business / hire_worker
-- ---------------------------------------------------------------------------

create or replace function public.upgrade_business(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player   uuid := auth.uid();
  v_building public.buildings;
  v_type     public.business_types;
  v_cost     numeric(20, 2);
  v_cash     numeric(20, 2);
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  select * into v_building from public.buildings where id = p_building_id for update;
  if not found then
    perform public.game_error('BUILDING_NOT_FOUND');
  end if;
  if v_building.owner_id is distinct from v_player then
    perform public.game_error('NOT_OWNER');
  end if;
  if v_building.level >= 5 then
    perform public.game_error('MAX_LEVEL_REACHED');
  end if;

  select * into v_type from public.business_types where key = v_building.business_type;
  v_cost := public.upgrade_cost(v_type.build_cost, v_building.level);

  -- Bank whatever it has already produced, so an upgrade never eats output.
  perform public.collect_building(p_building_id, v_player);

  v_cash := public.apply_money_delta(
    v_player, -v_cost, 'BUILDING_UPGRADE', 'building', p_building_id,
    'Upgraded ' || v_type.name || ' to level ' || (v_building.level + 1)
  );

  update public.buildings
  set level = level + 1,
      invested_value = invested_value + v_cost
  where id = p_building_id;

  perform public.recalculate_company_value(v_player);

  return jsonb_build_object(
    'building_id', p_building_id,
    'level', v_building.level + 1,
    'cash', v_cash
  );
end;
$$;

create or replace function public.hire_worker(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player   uuid := auth.uid();
  v_building public.buildings;
  v_type     public.business_types;
  v_cost     numeric(20, 2);
  v_cash     numeric(20, 2);
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  select * into v_building from public.buildings where id = p_building_id for update;
  if not found then
    perform public.game_error('BUILDING_NOT_FOUND');
  end if;
  if v_building.owner_id is distinct from v_player then
    perform public.game_error('NOT_OWNER');
  end if;
  if v_building.workers >= public.max_workers(v_building.level) then
    perform public.game_error('NO_WORKER_SLOTS');
  end if;

  select * into v_type from public.business_types where key = v_building.business_type;
  v_cost := public.worker_cost(v_type.build_cost);

  perform public.collect_building(p_building_id, v_player);

  v_cash := public.apply_money_delta(
    v_player, -v_cost, 'WORKER_HIRE', 'building', p_building_id,
    'Hired a worker at ' || v_type.name
  );

  update public.buildings set workers = workers + 1 where id = p_building_id;
  perform public.recalculate_company_value(v_player);

  return jsonb_build_object(
    'building_id', p_building_id,
    'workers', v_building.workers + 1,
    'cash', v_cash
  );
end;
$$;

-- ===========================================================================
-- Production
--
-- Offline progress is calculated from timestamps, never by a background job:
-- elapsed time since last_collected_at, capped, times the building's rate.
-- That is what makes the world keep running with nothing running.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- collect_building: bank one building's output.
--
-- Internal - the p_player argument is the already-authenticated caller, so
-- this must never be exposed directly.
-- ---------------------------------------------------------------------------

create or replace function public.collect_building(p_building_id uuid, p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_building public.buildings;
  v_type     public.business_types;
  v_hours    numeric;
  v_cap      numeric;
  v_mult     numeric;
  v_produced numeric;
  v_needed   numeric;
  v_have     numeric;
  v_sold     numeric := 0;
  v_earned   numeric(20, 2) := 0;
  v_price    numeric(12, 2);
  v_resource text;
begin
  select * into v_building from public.buildings where id = p_building_id for update;
  if not found then
    perform public.game_error('BUILDING_NOT_FOUND');
  end if;
  if v_building.owner_id is distinct from p_player then
    perform public.game_error('NOT_OWNER');
  end if;

  select * into v_type from public.business_types where key = v_building.business_type;

  v_cap := public.offline_cap_hours(p_player);
  v_hours := least(
    extract(epoch from (now() - v_building.last_collected_at)) / 3600.0,
    v_cap
  );

  -- Nothing meaningful has accrued yet.
  if v_hours <= 0 then
    return jsonb_build_object('produced', 0, 'earned', 0, 'resource', null);
  end if;

  v_mult := public.production_multiplier(v_building.level, v_building.workers);

  -- A store turns goods already in the inventory into cash.
  if v_type.sells_goods then
    v_sold := floor(v_type.output_per_hour * v_hours * v_mult);

    for v_resource, v_price in
      select rt.key, rt.price
      from public.resource_types rt
      join public.player_inventory pi
        on pi.resource_key = rt.key and pi.owner_id = p_player
      where pi.quantity > 0
      -- Sell the most valuable goods first, which is what an owner would do.
      order by rt.price desc
    loop
      exit when v_sold <= 0;

      select quantity into v_have
      from public.player_inventory
      where owner_id = p_player and resource_key = v_resource;

      v_produced := least(v_sold, floor(v_have));
      continue when v_produced <= 0;

      perform public.apply_inventory_delta(
        p_player, v_resource, -v_produced, 'STORE_SALE', 'building', p_building_id
      );

      v_earned := v_earned + round(v_produced * v_price * v_type.sell_rate_share, 2);
      v_sold := v_sold - v_produced;
    end loop;

    if v_earned > 0 then
      perform public.apply_money_delta(
        p_player, v_earned, 'BUSINESS_REVENUE', 'building', p_building_id,
        v_type.name || ' sales'
      );
      update public.companies
      set total_revenue = total_revenue + v_earned
      where owner_id = p_player;
    end if;

    update public.buildings set last_collected_at = now() where id = p_building_id;
    return jsonb_build_object('produced', 0, 'earned', v_earned, 'resource', null);
  end if;

  -- A warehouse produces nothing; its whole effect is the offline bonus.
  if v_type.output_resource is null then
    update public.buildings set last_collected_at = now() where id = p_building_id;
    return jsonb_build_object('produced', 0, 'earned', 0, 'resource', null);
  end if;

  v_produced := floor(v_type.output_per_hour * v_hours * v_mult);

  -- A refinery is limited by the input it actually has.
  if v_type.input_resource is not null and v_produced > 0 then
    select coalesce(quantity, 0) into v_have
    from public.player_inventory
    where owner_id = p_player and resource_key = v_type.input_resource;

    v_produced := least(v_produced, floor(coalesce(v_have, 0) / v_type.input_per_output));

    if v_produced > 0 then
      v_needed := v_produced * v_type.input_per_output;
      perform public.apply_inventory_delta(
        p_player, v_type.input_resource, -v_needed, 'CONSUMED', 'building', p_building_id
      );
    end if;
  end if;

  if v_produced > 0 then
    perform public.apply_inventory_delta(
      p_player, v_type.output_resource, v_produced, 'PRODUCTION', 'building', p_building_id
    );
  end if;

  -- Move the clock forward whether or not anything was produced: a refinery
  -- starved of input does not bank hours to cash in later.
  update public.buildings set last_collected_at = now() where id = p_building_id;

  return jsonb_build_object(
    'produced', v_produced,
    'earned', 0,
    'resource', v_type.output_resource
  );
end;
$$;

revoke all on function public.collect_building(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- collect_all: bank every building the player owns, in one transaction.
-- ---------------------------------------------------------------------------

create or replace function public.collect_all()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player   uuid := auth.uid();
  v_building uuid;
  v_result   jsonb;
  v_goods    jsonb := '{}'::jsonb;
  v_earned   numeric(20, 2) := 0;
  v_resource text;
  v_produced numeric;
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  for v_building in
    select id from public.buildings where owner_id = v_player order by created_at
  loop
    v_result := public.collect_building(v_building, v_player);

    v_earned := v_earned + coalesce((v_result ->> 'earned')::numeric, 0);
    v_resource := v_result ->> 'resource';
    v_produced := coalesce((v_result ->> 'produced')::numeric, 0);

    if v_resource is not null and v_produced > 0 then
      v_goods := jsonb_set(
        v_goods,
        array[v_resource],
        to_jsonb(coalesce((v_goods ->> v_resource)::numeric, 0) + v_produced)
      );
    end if;
  end loop;

  return jsonb_build_object('earned', v_earned, 'goods', v_goods);
end;
$$;

-- ---------------------------------------------------------------------------
-- work_business: the active-work mechanic.
--
-- An instant batch of output plus a small cash tip, on a cooldown. The
-- cooldown is enforced here, from a stored timestamp, so a client that spams
-- the button 500 times a second still gets one payout per cooldown.
-- ---------------------------------------------------------------------------

create or replace function public.work_business(p_building_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player    uuid := auth.uid();
  v_building  public.buildings;
  v_type      public.business_types;
  v_cooldown  numeric;
  v_elapsed   numeric;
  v_mult      numeric;
  v_yield     numeric;
  v_tip       numeric(20, 2);
  v_price     numeric(12, 2);
  v_needed    numeric;
  v_have      numeric;
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  select * into v_building from public.buildings where id = p_building_id for update;
  if not found then
    perform public.game_error('BUILDING_NOT_FOUND');
  end if;
  if v_building.owner_id is distinct from v_player then
    perform public.game_error('NOT_OWNER');
  end if;

  select * into v_type from public.business_types where key = v_building.business_type;

  if v_type.work_yield <= 0 then
    perform public.game_error('CANNOT_BE_WORKED');
  end if;

  v_cooldown := coalesce(
    (select value from public.game_config where key = 'work_cooldown_seconds'), 60
  );

  if v_building.last_worked_at is not null then
    v_elapsed := extract(epoch from (now() - v_building.last_worked_at));
    if v_elapsed < v_cooldown then
      perform public.game_error(
        'ON_COOLDOWN',
        ceil(v_cooldown - v_elapsed)::text
      );
    end if;
  end if;

  v_mult := public.production_multiplier(v_building.level, v_building.workers);
  v_yield := floor(v_type.work_yield * v_mult);

  -- Working a refinery still needs the input on hand.
  if v_type.input_resource is not null then
    select coalesce(quantity, 0) into v_have
    from public.player_inventory
    where owner_id = v_player and resource_key = v_type.input_resource;

    v_yield := least(v_yield, floor(coalesce(v_have, 0) / v_type.input_per_output));

    if v_yield <= 0 then
      perform public.game_error('MISSING_INPUT', v_type.input_resource);
    end if;

    v_needed := v_yield * v_type.input_per_output;
    perform public.apply_inventory_delta(
      v_player, v_type.input_resource, -v_needed, 'CONSUMED', 'building', p_building_id
    );
  end if;

  perform public.apply_inventory_delta(
    v_player, v_type.output_resource, v_yield, 'WORK_REWARD', 'building', p_building_id
  );

  -- A small cash tip on top, so work always feels worth the click.
  select price into v_price from public.resource_types where key = v_type.output_resource;
  v_tip := round(v_yield * v_price * 0.1, 2);

  if v_tip > 0 then
    perform public.apply_money_delta(
      v_player, v_tip, 'WORK_REWARD', 'building', p_building_id,
      'Worked at ' || v_type.name
    );
    update public.companies
    set total_revenue = total_revenue + v_tip
    where owner_id = v_player;
  end if;

  update public.buildings set last_worked_at = now() where id = p_building_id;

  return jsonb_build_object(
    'resource', v_type.output_resource,
    'quantity', v_yield,
    'tip', v_tip,
    'cooldown_seconds', v_cooldown
  );
end;
$$;

-- ===========================================================================
-- The resource market
--
-- One server-side price per resource, which drifts with what players actually
-- trade: selling pushes a price down, buying pushes it up, clamped to a band
-- around its base so nothing can be driven to zero or to the moon.
-- ===========================================================================

create or replace function public.nudge_price(p_resource text, p_signed_volume numeric)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   public.resource_types;
  v_next  numeric(12, 2);
begin
  select * into v_row from public.resource_types where key = p_resource for update;

  -- A 100-unit trade moves the price by about 1%.
  v_next := round(v_row.price * (1 + (p_signed_volume / 10000.0)), 2);

  -- Never further than half to double the base price.
  v_next := greatest(round(v_row.base_price * 0.5, 2),
                     least(round(v_row.base_price * 2.0, 2), v_next));

  update public.resource_types
  set price = v_next, updated_at = now()
  where key = p_resource;

  return v_next;
end;
$$;

revoke all on function public.nudge_price(text, numeric) from public, anon, authenticated;

create or replace function public.sell_resource(p_resource text, p_quantity numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid := auth.uid();
  v_price  numeric(12, 2);
  v_gross  numeric(20, 2);
  v_cash   numeric(20, 2);
  v_left   numeric(16, 2);
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;
  -- Whole units only, and a bounded quantity: no fractional or absurd trades.
  if p_quantity is null or p_quantity <= 0 or p_quantity <> floor(p_quantity)
     or p_quantity > 1000000 then
    perform public.game_error('INVALID_QUANTITY');
  end if;

  -- Lock the price row first, so the price used is the price recorded.
  select price into v_price from public.resource_types where key = p_resource for update;
  if not found then
    perform public.game_error('UNKNOWN_RESOURCE');
  end if;

  -- Removing the goods first means an oversell fails before any cash moves.
  v_left := public.apply_inventory_delta(
    v_player, p_resource, -p_quantity, 'MARKET_SELL', 'market', null
  );

  v_gross := round(p_quantity * v_price, 2);
  v_cash := public.apply_money_delta(
    v_player, v_gross, 'RESOURCE_SALE', 'market', null,
    'Sold ' || p_quantity || ' ' || p_resource
  );

  update public.companies
  set total_revenue = total_revenue + v_gross
  where owner_id = v_player;

  return jsonb_build_object(
    'resource', p_resource,
    'quantity', p_quantity,
    'unit_price', v_price,
    'gross', v_gross,
    'cash', v_cash,
    'remaining', v_left,
    'new_price', public.nudge_price(p_resource, -p_quantity)
  );
end;
$$;

create or replace function public.buy_resource(p_resource text, p_quantity numeric)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid := auth.uid();
  v_price  numeric(12, 2);
  v_cost   numeric(20, 2);
  v_cash   numeric(20, 2);
  v_held   numeric(16, 2);
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity <> floor(p_quantity)
     or p_quantity > 1000000 then
    perform public.game_error('INVALID_QUANTITY');
  end if;

  select price into v_price from public.resource_types where key = p_resource for update;
  if not found then
    perform public.game_error('UNKNOWN_RESOURCE');
  end if;

  v_cost := round(p_quantity * v_price, 2);

  -- Charge first: an unaffordable order fails before any goods are created.
  v_cash := public.apply_money_delta(
    v_player, -v_cost, 'RESOURCE_PURCHASE', 'market', null,
    'Bought ' || p_quantity || ' ' || p_resource
  );

  v_held := public.apply_inventory_delta(
    v_player, p_resource, p_quantity, 'MARKET_BUY', 'market', null
  );

  update public.companies
  set total_expenses = total_expenses + v_cost
  where owner_id = v_player;

  return jsonb_build_object(
    'resource', p_resource,
    'quantity', p_quantity,
    'unit_price', v_price,
    'cost', v_cost,
    'cash', v_cash,
    'held', v_held,
    'new_price', public.nudge_price(p_resource, p_quantity)
  );
end;
$$;

-- ===========================================================================
-- Valuation, now that players own more than land.
-- Centralised in one place so nothing is double-counted.
-- ===========================================================================

create or replace function public.player_building_value(p_player uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(invested_value), 0)::numeric(20, 2)
  from public.buildings
  where owner_id = p_player;
$$;

create or replace function public.player_inventory_value(p_player uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(pi.quantity * rt.price), 0)::numeric(20, 2)
  from public.player_inventory pi
  join public.resource_types rt on rt.key = pi.resource_key
  where pi.owner_id = p_player;
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
    + public.player_building_value(p_player)
    + public.player_inventory_value(p_player)
  )::numeric(20, 2);
$$;

-- A company is worth its land plus what is built on it.
create or replace function public.recalculate_company_value(p_owner uuid)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_value numeric(20, 2);
begin
  v_value := public.player_land_value(p_owner) + public.player_building_value(p_owner);
  update public.companies set company_value = v_value where owner_id = p_owner;
  return v_value;
end;
$$;

revoke all on function public.player_building_value(uuid) from public, anon, authenticated;
revoke all on function public.player_inventory_value(uuid) from public, anon, authenticated;
revoke all on function public.player_net_worth(uuid) from public, anon, authenticated;
revoke all on function public.recalculate_company_value(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What a player can see without collecting: pending output per building.
-- Read-only, and scoped to the caller.
-- ---------------------------------------------------------------------------

create or replace function public.my_pending_production()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]'::jsonb)
  from (
    select
      b.id                                as building_id,
      b.business_type,
      bt.name                             as business_name,
      bt.output_resource,
      bt.sells_goods,
      least(
        extract(epoch from (now() - b.last_collected_at)) / 3600.0,
        public.offline_cap_hours(auth.uid())
      )                                   as hours,
      floor(
        bt.output_per_hour
        * least(
            extract(epoch from (now() - b.last_collected_at)) / 3600.0,
            public.offline_cap_hours(auth.uid())
          )
        * public.production_multiplier(b.level, b.workers)
      )                                   as pending
    from public.buildings b
    join public.business_types bt on bt.key = b.business_type
    where b.owner_id = auth.uid()
    order by b.created_at
  ) x;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges.
--
-- Written out one by one rather than generated in a loop: these lines are the
-- security boundary, so they should be greppable and reviewable as text.
-- Anything not listed here is not callable by a player.
-- ---------------------------------------------------------------------------

revoke all on function public.buy_plot(uuid) from public, anon;
grant execute on function public.buy_plot(uuid) to authenticated;

revoke all on function public.build_business(uuid, text) from public, anon;
grant execute on function public.build_business(uuid, text) to authenticated;

revoke all on function public.upgrade_business(uuid) from public, anon;
grant execute on function public.upgrade_business(uuid) to authenticated;

revoke all on function public.hire_worker(uuid) from public, anon;
grant execute on function public.hire_worker(uuid) to authenticated;

revoke all on function public.work_business(uuid) from public, anon;
grant execute on function public.work_business(uuid) to authenticated;

revoke all on function public.collect_all() from public, anon;
grant execute on function public.collect_all() to authenticated;

revoke all on function public.sell_resource(text, numeric) from public, anon;
grant execute on function public.sell_resource(text, numeric) to authenticated;

revoke all on function public.buy_resource(text, numeric) from public, anon;
grant execute on function public.buy_resource(text, numeric) to authenticated;

revoke all on function public.my_pending_production() from public, anon;
grant execute on function public.my_pending_production() to authenticated;

-- Internal: my_pending_production() calls this as the definer, so no player
-- needs it directly.
revoke all on function public.offline_cap_hours(uuid) from public, anon, authenticated;

-- Balance values the client displays.
insert into public.game_config (key, value, description) values
  ('work_cooldown_seconds', 60, 'Seconds before a business can be worked by hand again.'),
  ('max_building_level',     5, 'Highest level a business can be upgraded to.')
on conflict (key) do nothing;
