-- ===========================================================================
-- Balance simulation.
--
-- Plays the opening ten minutes for real against the database - build a farm,
-- work it on cooldown, sell the goods - and checks what a new player actually
-- ends up with. Arithmetic on the rates is not enough: price drift from
-- selling only shows up when the trades really happen.
--
-- Target: about $10,000 earned in the first ten minutes of active play.
-- ===========================================================================

\set sim '''5151515a-0000-0000-0000-00000000f00d'''

insert into auth.users (id, email) values (:sim, 'sim@example.test');

set role authenticated;
select test.login(:sim);
select public.complete_onboarding('simplayer', 'Sim Farms', 'SIM', 'agriculture');
reset role;

\echo '== a new player starts with the configured cash and one plot =='

select test.assert(
  (select cash from public.profiles where id = :sim) = 10000,
  'the player starts with $10,000');
select test.assert(
  (select count(*) from public.plots where owner_id = :sim) = 1,
  'the player starts with one plot');

-- Put them on rural land so the run is the farm opening, which is the one
-- most new players will take.
do $$
declare
  v_plot uuid;
begin
  update public.plots set owner_id = null, acquired_at = null
  where owner_id = '5151515a-0000-0000-0000-00000000f00d';

  select id into v_plot from public.plots
  where owner_id is null and is_purchasable and zone = 'rural'
  limit 1;

  update public.plots
  set owner_id = '5151515a-0000-0000-0000-00000000f00d', acquired_at = now()
  where id = v_plot;
end;
$$;

\echo '== ten minutes of play: build a farm, work it, sell the wheat =='

do $$
declare
  v_player   uuid := '5151515a-0000-0000-0000-00000000f00d';
  v_plot     uuid;
  v_building uuid;
  v_cooldown numeric;
  v_shifts   integer;
  v_i        integer;
  v_start    numeric(20, 2);
  v_after    numeric(20, 2);
  v_earned   numeric(20, 2);
  v_wheat    numeric(16, 2);
  v_price    numeric(12, 2);
begin
  perform set_config('request.jwt.claim.sub', v_player::text, false);

  select cash into v_start from public.profiles where id = v_player;
  select id into v_plot from public.plots where owner_id = v_player limit 1;

  v_building := (public.build_business(v_plot, 'farm') ->> 'building_id')::uuid;

  v_cooldown := (select value from public.game_config where key = 'work_cooldown_seconds');
  v_shifts := floor(600 / v_cooldown);

  -- Work it as fast as the cooldown allows for ten minutes. Rewinding the
  -- timestamp is how the simulation makes time pass; the cooldown itself is
  -- still being enforced on every call.
  for v_i in 1..v_shifts loop
    perform public.work_business(v_building);
    update public.buildings
    set last_worked_at = now() - (v_cooldown || ' seconds')::interval
    where id = v_building;
  end loop;

  -- Bank what grew in the background, then cash everything in.
  perform public.collect_all();
  perform public.sell_all_resources();

  select cash into v_after from public.profiles where id = v_player;
  select coalesce(quantity, 0) into v_wheat from public.player_inventory
  where owner_id = v_player and resource_key = 'wheat';
  select price into v_price from public.resource_types where key = 'wheat';

  -- The farm cost $5,000, so add that back to measure what was *earned*.
  v_earned := v_after - v_start + 5000;

  raise notice '  --------------------------------------------------';
  raise notice '  Ten minutes as a new farmer';
  raise notice '    shifts worked      %', v_shifts;
  raise notice '    started with       $%', v_start;
  raise notice '    ended with         $%', v_after;
  raise notice '    earned (net build) $%', v_earned;
  raise notice '    wheat price now    $% (from $4.00)', v_price;
  raise notice '  --------------------------------------------------';

  if v_earned < 8000 then
    raise exception 'ASSERTION FAILED: ten minutes earned only $%, target is about $10,000', v_earned;
  end if;
  if v_earned > 14000 then
    raise exception 'ASSERTION FAILED: ten minutes earned $%, which overshoots the $10,000 target', v_earned;
  end if;

  raise notice '  ok  ten minutes of play earns about $10,000 (actual: $%)', v_earned;
end;
$$;

\echo '== the market survives one player cashing out =='

select test.assert(
  (select price from public.resource_types where key = 'wheat') >= 3.50,
  'selling a full session of wheat did not crater the price');

\echo '== passive income is worth having, not just a rounding error =='

do $$
declare
  v_player uuid := '5151515a-0000-0000-0000-00000000f00d';
  v_before numeric(20, 2);
  v_after  numeric(20, 2);
begin
  perform set_config('request.jwt.claim.sub', v_player::text, false);

  -- Walk away for an hour.
  update public.buildings
  set last_collected_at = now() - interval '1 hour'
  where owner_id = v_player;

  select cash into v_before from public.profiles where id = v_player;
  perform public.collect_all();
  perform public.sell_all_resources();
  select cash into v_after from public.profiles where id = v_player;

  raise notice '  one idle hour paid $%', v_after - v_before;

  if v_after - v_before < 400 then
    raise exception 'ASSERTION FAILED: an idle hour paid only $%', v_after - v_before;
  end if;
  raise notice '  ok  an idle hour is worth having';
end;
$$;

\echo '== EXPLOIT: sell everything cannot sell what is not there =='

set role authenticated;
select test.login(:sim);

select test.assert(
  (public.sell_all_resources() ->> 'units')::numeric = 0,
  'selling everything twice sells nothing the second time');
select test.assert(
  (select coalesce(sum(quantity), 0) from public.player_inventory where owner_id = :sim) < 1,
  'no goods were conjured by the second sell');

reset role;

\echo '== BALANCE SIMULATION PASSED =='
