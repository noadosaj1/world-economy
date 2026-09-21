-- ===========================================================================
-- World Economy - economy retune
--
-- The first pass was far too slow: a starter farm earned about $440 in ten
-- minutes of solid clicking, which is not a game, it is a wait. This retunes
-- the early game so ten minutes of active play earns roughly $10,000.
--
-- Targets this is balanced against:
--   * 10 minutes of active work on a starter business  -> about $10,000
--   * passive income at level 1                        -> about $650/hour
--   * every business earns about the same per shift, so choosing one is a
--     matter of style and district, not power
--
-- Two magic numbers move into game_config so they can be retuned again
-- without a migration: the work tip share, and how hard a trade moves a price.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Pace and tunables
-- ---------------------------------------------------------------------------

update public.game_config
set value = 15, updated_at = now()
where key = 'work_cooldown_seconds';

insert into public.game_config (key, value, description) values
  ('work_tip_share', 0.25,
   'Share of the value of a worked shift paid as an immediate cash tip.'),
  ('price_impact_divisor', 50000,
   'How hard a trade moves a price. Higher means a steadier market; a trade of this many units moves a price by 100%.')
on conflict (key) do update
  set value = excluded.value, description = excluded.description, updated_at = now();

-- ---------------------------------------------------------------------------
-- Production and work rates
--
-- Per shift, at level 1 and current prices:
--   Farm     50 wheat  = $200 goods + $50 tip  = $250
--   Mine     30 ore    = $210 goods + $52 tip  = $262
--   Mill     15 food   = $210 goods + $52 tip  = $262   (eats 30 wheat)
--   Foundry  10 steel  = $220 goods + $55 tip  = $275   (eats 20 ore)
--
-- At a 15 second cooldown that is 40 shifts in ten minutes: about $10,000.
-- ---------------------------------------------------------------------------

update public.business_types set output_per_hour = 160, work_yield = 50 where key = 'farm';
update public.business_types set output_per_hour = 100, work_yield = 30 where key = 'mine';
update public.business_types set output_per_hour =  50, work_yield = 15 where key = 'mill';
update public.business_types set output_per_hour =  32, work_yield = 10 where key = 'foundry';

-- A store earns without any clicking at all, which is its whole appeal.
update public.business_types set output_per_hour = 120 where key = 'store';

update public.business_types
set description = 'Grows wheat fast. The cheapest way to start earning, and the only thing rural land is good for.'
where key = 'farm';

update public.business_types
set description = 'Digs ore. Worth more per unit than wheat, and steel foundries will buy everything you produce.'
where key = 'mine';

-- ---------------------------------------------------------------------------
-- nudge_price: read the impact from config rather than a hardcoded divisor.
--
-- The old value meant one player selling a few thousand units could move the
-- market 20%, which is wrong when there are not many players yet.
-- ---------------------------------------------------------------------------

create or replace function public.nudge_price(p_resource text, p_signed_volume numeric)
returns numeric
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.resource_types;
  v_divisor numeric;
  v_next    numeric(12, 2);
begin
  select * into v_row from public.resource_types where key = p_resource for update;

  v_divisor := coalesce(
    (select value from public.game_config where key = 'price_impact_divisor'),
    50000
  );

  v_next := round(v_row.price * (1 + (p_signed_volume / v_divisor)), 2);

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

-- ---------------------------------------------------------------------------
-- work_business: the tip share comes from config now.
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
  v_tip_share numeric;
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
    (select value from public.game_config where key = 'work_cooldown_seconds'), 15
  );

  if v_building.last_worked_at is not null then
    v_elapsed := extract(epoch from (now() - v_building.last_worked_at));
    if v_elapsed < v_cooldown then
      perform public.game_error('ON_COOLDOWN', ceil(v_cooldown - v_elapsed)::text);
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

  -- An immediate cash tip on top, so a shift always pays something now rather
  -- than only once the goods are sold.
  v_tip_share := coalesce(
    (select value from public.game_config where key = 'work_tip_share'), 0.25
  );
  select price into v_price from public.resource_types where key = v_type.output_resource;
  v_tip := round(v_yield * v_price * v_tip_share, 2);

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

revoke all on function public.work_business(uuid) from public, anon;
grant execute on function public.work_business(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- sell_all_resources: one click to turn everything into cash.
--
-- Selling goods one resource at a time was the main friction in the loop -
-- you would work four times, then make four separate trades.
-- ---------------------------------------------------------------------------

create or replace function public.sell_all_resources()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player uuid := auth.uid();
  v_row    record;
  v_total  numeric(20, 2) := 0;
  v_units  numeric(16, 2) := 0;
  v_sold   jsonb := '{}'::jsonb;
begin
  if v_player is null then
    perform public.game_error('NOT_AUTHENTICATED');
  end if;

  -- Most valuable first, so a price nudge on a cheap good cannot eat into
  -- what an expensive one fetches.
  for v_row in
    select pi.resource_key, floor(pi.quantity) as quantity
    from public.player_inventory pi
    join public.resource_types rt on rt.key = pi.resource_key
    where pi.owner_id = v_player and pi.quantity >= 1
    order by rt.price desc
  loop
    declare
      v_result jsonb;
    begin
      v_result := public.sell_resource(v_row.resource_key, v_row.quantity);
      v_total := v_total + (v_result ->> 'gross')::numeric;
      v_units := v_units + v_row.quantity;
      v_sold := jsonb_set(v_sold, array[v_row.resource_key], to_jsonb(v_row.quantity));
    end;
  end loop;

  return jsonb_build_object('gross', v_total, 'units', v_units, 'sold', v_sold);
end;
$$;

revoke all on function public.sell_all_resources() from public, anon;
grant execute on function public.sell_all_resources() to authenticated;
