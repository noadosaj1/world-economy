-- ===========================================================================
-- Phases 3-5 database tests: land, businesses, work, production, market.
--
-- Includes the exploit scenarios for the new mechanics:
--   * claim a plot twice, or someone else's plot          -> no
--   * build without paying, or in the wrong zone          -> no
--   * spam the work button for unlimited rewards          -> no
--   * refine goods you do not have                        -> no
--   * sell goods you do not own, or a fractional amount    -> no
--   * collect the same production window twice            -> no
--   * buy resources you cannot afford                     -> no
-- ===========================================================================

\set u1 '''aaaaaaaa-1111-1111-1111-111111111111'''
\set u2 '''bbbbbbbb-2222-2222-2222-222222222222'''

insert into auth.users (id, email) values
  (:u1, 'farmer@example.test'),
  (:u2, 'miner@example.test');

set role authenticated;
select test.login(:u1);
select public.complete_onboarding('farmer', 'Green Acres', 'GRN', 'agriculture');
select test.login(:u2);
select public.complete_onboarding('miner', 'Deep Rock', 'DRK', 'mining');
reset role;

-- Give both players a predictable, affordable starting position.
select public.apply_money_delta(:u1, 200000, 'ADMIN_GRANT', 'test', null, 'test funds');
select public.apply_money_delta(:u2, 200000, 'ADMIN_GRANT', 'test', null, 'test funds');

\echo '== buying land =='

set role authenticated;
select test.login(:u1);

-- A cheap rural plot nobody owns.
create temporary table t_plot as
  select id, purchase_price, zone from public.plots
  where owner_id is null and is_purchasable and zone = 'rural'
  order by grid_x, grid_z limit 1;

select test.assert(
  (public.buy_plot((select id from t_plot)) ->> 'plot_id') = (select id::text from t_plot),
  'a player can buy an unowned plot');
select test.assert(
  (select owner_id from public.plots where id = (select id from t_plot)) = :u1,
  'the plot is now owned by the buyer');

\echo '== EXPLOIT: buying the same plot twice, or another player''s =='

select test.expect_error(
  $$select public.buy_plot((select id from t_plot))$$, 'PLOT_ALREADY_OWNED');

select test.login(:u2);
select test.expect_error(
  $$select public.buy_plot((select id from t_plot))$$, 'PLOT_ALREADY_OWNED');

select test.expect_error(
  $$select public.buy_plot((select id from public.plots where not is_purchasable limit 1))$$,
  'PLOT_NOT_FOR_SALE');

\echo '== building a business =='

select test.login(:u1);

select test.assert(
  (public.build_business((select id from t_plot), 'farm') ->> 'building_id') is not null,
  'a farm can be built on rural land you own');

create temporary table t_farm as
  select id from public.buildings where owner_id = :u1 limit 1;

select test.assert(
  (select count(*) from public.buildings where owner_id = :u1) = 1,
  'the building exists');
select test.assert(
  (select invested_value from public.buildings where id = (select id from t_farm)) = 5000,
  'the build cost is recorded as invested value');

\echo '== EXPLOIT: building on land you do not own, twice, or in the wrong zone =='

select test.expect_error(
  $$select public.build_business((select id from t_plot), 'farm')$$, 'PLOT_OCCUPIED');

select test.login(:u2);
select test.expect_error(
  $$select public.build_business((select id from t_plot), 'farm')$$, 'NOT_OWNER');

select test.login(:u1);
-- Buy a downtown plot, then try to farm it.
create temporary table t_downtown as
  select id from public.plots
  where owner_id is null and is_purchasable and zone = 'downtown' limit 1;
select public.buy_plot((select id from t_downtown));
select test.expect_error(
  $$select public.build_business((select id from t_downtown), 'farm')$$, 'WRONG_ZONE');
select test.expect_error(
  $$select public.build_business((select id from t_downtown), 'not_a_business')$$,
  'UNKNOWN_BUSINESS_TYPE');

\echo '== active work pays out =='

select test.assert(
  (public.work_business((select id from t_farm)) ->> 'quantity')::numeric = 10,
  'working a level 1 farm yields 10 wheat');
select test.assert(
  (select quantity from public.player_inventory
   where owner_id = :u1 and resource_key = 'wheat') = 10,
  'the wheat is in the inventory');
select test.assert(
  (select count(*) from public.inventory_transactions
   where player_id = :u1 and type = 'WORK_REWARD') = 1,
  'the work reward is recorded in the goods ledger');

\echo '== EXPLOIT: spamming the work button =='

select test.expect_error(
  $$select public.work_business((select id from t_farm))$$, 'ON_COOLDOWN');
select test.assert(
  (select quantity from public.player_inventory
   where owner_id = :u1 and resource_key = 'wheat') = 10,
  'a second immediate click produced nothing');

-- Ten more attempts in a row must all be refused.
do $$
declare
  v_ok integer := 0;
  v_i  integer;
  v_id uuid := (select id from t_farm);
begin
  for v_i in 1..10 loop
    begin
      perform public.work_business(v_id);
      v_ok := v_ok + 1;
    exception when others then
      null;
    end;
  end loop;
  if v_ok > 0 then
    raise exception 'ASSERTION FAILED: % of 10 spammed work calls paid out', v_ok;
  end if;
  raise notice '  ok  10 rapid work calls all refused';
end;
$$;

\echo '== EXPLOIT: working someone else''s business =='

select test.login(:u2);
select test.expect_error(
  $$select public.work_business((select id from t_farm))$$, 'NOT_OWNER');
select test.login(:u1);

\echo '== timestamp-based offline production =='

reset role;
-- Pretend the farm has been running unattended for three hours.
update public.buildings
set last_collected_at = now() - interval '3 hours'
where id = (select id from t_farm);

set role authenticated;
select test.login(:u1);

-- 14/hr at level 1, three hours -> 42 wheat, on top of the 10 from working.
select test.assert(
  (public.collect_all() -> 'goods' ->> 'wheat')::numeric = 42,
  'three offline hours produced 42 wheat');
select test.assert(
  (select quantity from public.player_inventory
   where owner_id = :u1 and resource_key = 'wheat') = 52,
  'offline output was added to the inventory');

\echo '== EXPLOIT: collecting the same window twice =='

select test.assert(
  (public.collect_all() -> 'goods') = '{}'::jsonb,
  'collecting again immediately produces nothing');
select test.assert(
  (select quantity from public.player_inventory
   where owner_id = :u1 and resource_key = 'wheat') = 52,
  'the inventory did not grow on the second collect');

\echo '== offline production is capped =='

reset role;
-- A year of neglect must credit the cap, not a year.
update public.buildings
set last_collected_at = now() - interval '365 days'
where id = (select id from t_farm);

set role authenticated;
select test.login(:u1);
select test.assert(
  (public.collect_all() -> 'goods' ->> 'wheat')::numeric = 14 * 24,
  'a year offline credits only the 24 hour cap');

\echo '== the market =='

select test.assert(
  (public.sell_resource('wheat', 100) ->> 'gross')::numeric = 400,
  'selling 100 wheat at $4 pays $400');
select test.assert(
  (select price from public.resource_types where key = 'wheat') < 4,
  'selling pushed the wheat price down');

select test.expect_error(
  $$select public.sell_resource('wheat', 999999)$$, 'NOT_ENOUGH_GOODS');
select test.expect_error(
  $$select public.sell_resource('wheat', 1.5)$$, 'INVALID_QUANTITY');
select test.expect_error(
  $$select public.sell_resource('wheat', -50)$$, 'INVALID_QUANTITY');
select test.expect_error(
  $$select public.sell_resource('unobtainium', 10)$$, 'UNKNOWN_RESOURCE');

select test.assert(
  (public.buy_resource('ore', 10) ->> 'cost')::numeric > 0,
  'a player can buy resources');
select test.assert(
  (select price from public.resource_types where key = 'ore') > 7,
  'buying pushed the ore price up');

\echo '== EXPLOIT: buying more than you can afford =='

select test.expect_error(
  $$select public.buy_resource('steel', 1000000)$$, 'INSUFFICIENT_FUNDS');
select test.assert(
  coalesce((select quantity from public.player_inventory
            where owner_id = :u1 and resource_key = 'steel'), 0) = 0,
  'the failed purchase created no goods');

\echo '== refining needs real input =='

select test.login(:u2);
create temporary table t_ind as
  select id from public.plots
  where owner_id is null and is_purchasable and zone = 'industrial' limit 1;
select public.buy_plot((select id from t_ind));
select public.build_business((select id from t_ind), 'foundry');

create temporary table t_foundry as
  select id from public.buildings where owner_id = :u2 limit 1;

-- No ore yet, so working the foundry must refuse rather than mint steel.
select test.expect_error(
  $$select public.work_business((select id from t_foundry))$$, 'MISSING_INPUT');
select test.assert(
  coalesce((select quantity from public.player_inventory
            where owner_id = :u2 and resource_key = 'steel'), 0) = 0,
  'no steel was created out of nothing');

-- With ore on hand it works, and consumes 2 ore per steel.
select public.buy_resource('ore', 100);
select test.assert(
  (public.work_business((select id from t_foundry)) ->> 'quantity')::numeric = 4,
  'working a foundry with ore yields 4 steel');
select test.assert(
  (select quantity from public.player_inventory
   where owner_id = :u2 and resource_key = 'ore') = 92,
  '8 ore was consumed for 4 steel');

\echo '== upgrades and workers =='

select test.login(:u1);
select test.assert(
  (public.upgrade_business((select id from t_farm)) ->> 'level')::integer = 2,
  'a farm can be upgraded');
select test.assert(
  (public.hire_worker((select id from t_farm)) ->> 'workers')::integer = 1,
  'a worker can be hired');

-- A level 2 building has 4 worker slots. Fill them, then the next hire must
-- be refused.
select public.hire_worker((select id from t_farm));
select public.hire_worker((select id from t_farm));
select public.hire_worker((select id from t_farm));
select test.assert(
  (select workers from public.buildings where id = (select id from t_farm)) = 4,
  'all four worker slots at level 2 are filled');
select test.expect_error(
  $$select public.hire_worker((select id from t_farm))$$, 'NO_WORKER_SLOTS');

reset role;
select test.assert(
  public.production_multiplier(2, 1) = 1.5 * 1.12,
  'level 2 with one worker is 1.68x output');
select test.assert(
  public.max_workers(1) = 2 and public.max_workers(5) = 10,
  'worker slots scale with level');

\echo '== EXPLOIT: upgrading or hiring at someone else''s business =='

set role authenticated;
select test.login(:u2);
select test.expect_error(
  $$select public.upgrade_business((select id from t_farm))$$, 'NOT_OWNER');
select test.expect_error(
  $$select public.hire_worker((select id from t_farm))$$, 'NOT_OWNER');

\echo '== EXPLOIT: direct writes to the new tables =='

select test.login(:u1);
select test.expect_error(
  $$update public.player_inventory set quantity = 999999 where owner_id = auth.uid()$$, '42501');
select test.expect_error(
  $$insert into public.player_inventory (owner_id, resource_key, quantity)
    values (auth.uid(), 'steel', 500)$$, '42501');
select test.expect_error(
  $$update public.buildings set level = 5 where owner_id = auth.uid()$$, '42501');
select test.expect_error(
  $$update public.buildings set last_worked_at = null where owner_id = auth.uid()$$, '42501');
select test.expect_error(
  $$update public.resource_types set price = 100000 where key = 'wheat'$$, '42501');
select test.expect_error(
  $$update public.business_types set build_cost = 1 where key = 'farm'$$, '42501');
select test.expect_error(
  $$insert into public.inventory_transactions
      (player_id, resource_key, type, quantity, balance_after)
    values (auth.uid(), 'steel', 'ADMIN_GRANT', 9999, 9999)$$, '42501');

\echo '== EXPLOIT: calling internal helpers directly =='

select test.expect_error(
  $$select public.apply_inventory_delta(auth.uid(), 'steel', 9999, 'ADMIN_GRANT')$$, '42501');
select test.expect_error(
  $$select public.collect_building((select id from t_farm), auth.uid())$$, '42501');
select test.expect_error(
  $$select public.nudge_price('wheat', -1000000)$$, '42501');

\echo '== RLS: inventory is private, buildings are public =='

select test.assert(
  (select count(*) from public.player_inventory where owner_id <> auth.uid()) = 0,
  'another player''s inventory is invisible');
select test.assert(
  (select count(*) from public.buildings) = 2,
  'every building is visible on the map');

\echo '== net worth counts everything once =='

reset role;
select test.assert(
  public.player_net_worth(:u1) = (
    (select cash from public.profiles where id = :u1)
    + public.player_land_value(:u1)
    + public.player_building_value(:u1)
    + public.player_inventory_value(:u1)
  ),
  'net worth is cash + land + buildings + inventory');

select test.assert(
  (select company_value from public.companies where owner_id = :u1)
    = public.player_land_value(:u1) + public.player_building_value(:u1),
  'company value is land plus buildings');

\echo '== warehouses extend the offline cap =='

select test.assert(
  public.offline_cap_hours(:u1) = 24,
  'no warehouse means the base 24 hour cap');

set role authenticated;
select test.login(:u1);
create temporary table t_wh as
  select id from public.plots
  where owner_id is null and is_purchasable and zone = 'industrial' limit 1;
select public.buy_plot((select id from t_wh));
select public.build_business((select id from t_wh), 'warehouse');
reset role;

select test.assert(
  public.offline_cap_hours(:u1) = 32,
  'a warehouse adds 8 hours to the cap');

\echo '== every money movement is auditable =='

select test.assert(
  (select count(*) from public.player_transactions where player_id = :u1) > 5,
  'the cash ledger recorded every action');
select test.assert(
  (select count(*) from public.player_transactions
   where player_id = :u1 and balance_after < 0) = 0,
  'no ledger entry ever left a negative balance');
select test.assert(
  (select bool_and(balance_after = balance_before + amount)
   from public.player_transactions where player_id = :u1),
  'every ledger row is internally consistent');

\echo '== PHASES 3-5 DATABASE TESTS PASSED =='
