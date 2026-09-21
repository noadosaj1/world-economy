-- ===========================================================================
-- Phase 1 database tests.
--
-- These assert the guarantees the game depends on, including the exploit
-- scenarios from the design brief:
--   * can a player write their own balance?            -> no
--   * can a player onboard twice and collect $10k x2?  -> no
--   * can a player forge a ledger row?                 -> no
--   * can a player take land by UPDATE?                -> no
--   * can a player read someone else's cash?           -> no
--   * does a failed onboarding leave money behind?     -> no
-- ===========================================================================

\set u1 '''11111111-1111-1111-1111-111111111111'''
\set u2 '''22222222-2222-2222-2222-222222222222'''
\set u3 '''33333333-3333-3333-3333-333333333333'''

\echo '== signup trigger =='

insert into auth.users (id, email) values
  (:u1, 'one@example.test'),
  (:u2, 'two@example.test'),
  (:u3, 'three@example.test');

select test.assert(
  (select count(*) from public.profiles) = 3,
  'a profile row is created for each new auth user');
select test.assert(
  (select count(*) from public.profiles where cash = 0 and onboarded_at is null) = 3,
  'new profiles start with no cash and are not onboarded');

\echo '== onboarding grants cash + land atomically =='

set role authenticated;
select test.login(:u1);

select test.assert(
  (public.complete_onboarding('noa', 'Noa Industries', 'noa', 'manufacturing')
    ->> 'ticker') = 'NOA',
  'onboarding returns the normalised ticker');

select test.assert(
  (select cash from public.profiles where id = :u1) = 10000.00,
  'player received the configured starting cash');
select test.assert(
  (select count(*) from public.plots where owner_id = :u1) = 1,
  'player received exactly one starter plot');
select test.assert(
  (select count(*) from public.companies where owner_id = :u1) = 1,
  'player has exactly one company');

\echo '== the starting balance is auditable =='

select test.assert(
  (select count(*) from public.player_transactions where player_id = :u1) = 1,
  'exactly one ledger row was written');
select test.assert(
  (select balance_before = 0 and balance_after = 10000 and amount = 10000
   from public.player_transactions where player_id = :u1) ,
  'ledger row records the before/after balance');

\echo '== net worth = cash + land, counted once =='

select test.assert(
  (select public.my_net_worth())
    = 10000.00 + (select purchase_price from public.plots where owner_id = :u1),
  'net worth is cash plus land value');

\echo '== EXPLOIT: onboarding twice to collect the grant twice =='

select test.expect_error(
  $$select public.complete_onboarding('noa2', 'Noa Holdings', 'NOAH', 'retail')$$,
  'ALREADY_ONBOARDED');
select test.assert(
  (select cash from public.profiles where id = :u1) = 10000.00,
  'a second onboarding attempt did not add cash');

\echo '== server-side validation rejects bad input =='

select test.login(:u2);

select test.expect_error(
  $$select public.complete_onboarding('two', 'Rival Corp', 'NOA', 'retail')$$,
  'TICKER_TAKEN');
select test.expect_error(
  $$select public.complete_onboarding('two', 'noa industries', 'RIV', 'retail')$$,
  'COMPANY_NAME_TAKEN');
select test.expect_error(
  $$select public.complete_onboarding('noa', 'Rival Corp', 'RIV', 'retail')$$,
  'USERNAME_TAKEN');
select test.expect_error(
  $$select public.complete_onboarding('two', 'Rival Corp', 'toolongticker', 'retail')$$,
  'INVALID_TICKER');
select test.expect_error(
  $$select public.complete_onboarding('a', 'Rival Corp', 'RIV', 'retail')$$,
  'INVALID_USERNAME');
select test.expect_error(
  $$select public.complete_onboarding('two', 'ab', 'RIV', 'retail')$$,
  'INVALID_COMPANY_NAME');
select test.expect_error(
  $$select public.complete_onboarding('two', '<script>x</script>', 'RIV', 'retail')$$,
  'INVALID_COMPANY_NAME');
select test.expect_error(
  $$select public.complete_onboarding(
      'two', 'Rival' || chr(9) || 'Corp', 'RIV', 'retail')$$,
  'INVALID_COMPANY_NAME');

select test.assert(
  (select count(*) from public.companies) = 1,
  'no company was created by any rejected attempt');

\echo '== EXPLOIT: writing my own balance / ledger / land directly =='

select test.login(:u1);

select test.expect_error(
  $$update public.profiles set cash = 999999999 where id = auth.uid()$$, '42501');
select test.expect_error(
  $$insert into public.player_transactions
      (player_id, type, amount, balance_before, balance_after)
    values (auth.uid(), 'ADMIN_GRANT', 1000000, 0, 1000000)$$, '42501');
select test.expect_error(
  $$update public.plots set owner_id = auth.uid() where owner_id is null$$, '42501');
select test.expect_error(
  $$delete from public.plots where owner_id is not null$$, '42501');
select test.expect_error(
  $$update public.companies set company_value = 999999999 where owner_id = auth.uid()$$, '42501');
select test.expect_error(
  $$update public.companies set stock_price = 500 where owner_id = auth.uid()$$, '42501');
select test.expect_error(
  $$update public.game_config set value = 100000000 where key = 'starting_cash'$$, '42501');
select test.expect_error(
  $$insert into public.companies (owner_id, name, ticker, industry)
    values (auth.uid(), 'Shell Co', 'SHL', 'retail')$$, '42501');

select test.assert(
  (select cash from public.profiles where id = :u1) = 10000.00,
  'balance survived every direct-write attempt');

\echo '== EXPLOIT: calling internal money functions directly =='

select test.expect_error(
  $$select public.apply_money_delta(auth.uid(), 1000000, 'ADMIN_GRANT')$$, '42501');
select test.expect_error(
  $$select public.recalculate_company_value(auth.uid())$$, '42501');
select test.expect_error(
  $$select public.player_net_worth(auth.uid())$$, '42501');

\echo '== RLS: one player cannot read another player''s wallet =='

select test.assert(
  (select count(*) from public.profiles) = 1,
  'a player sees only their own profile row');
select test.assert(
  (select count(*) from public.profiles where id = :u2) = 0,
  'another player''s profile is invisible');
select test.assert(
  (select count(*) from public.player_transactions where player_id <> auth.uid()) = 0,
  'another player''s ledger is invisible');

\echo '== RLS: the world and companies are public =='

select test.assert(
  (select count(*) from public.plots) = 400,
  'every plot in the world is readable');
select test.assert(
  (select count(*) from public.companies) = 1,
  'companies are public entities');

\echo '== money guards (server side) =='

reset role;

select test.expect_error(
  $$select public.apply_money_delta(
      '11111111-1111-1111-1111-111111111111', -999999, 'LAND_PURCHASE')$$,
  'INSUFFICIENT_FUNDS');
select test.expect_error(
  $$select public.apply_money_delta(
      '11111111-1111-1111-1111-111111111111', 0, 'ADMIN_GRANT')$$,
  'INVALID_AMOUNT');
select test.assert(
  (select cash from public.profiles where id = :u1) = 10000.00,
  'a rejected debit left the balance untouched');

select test.assert(
  public.apply_money_delta(:u1, -2500, 'LAND_PURCHASE', 'test', null, 'buy land') = 7500.00,
  'a valid debit returns the new balance');
select test.assert(
  (select balance_before = 10000 and balance_after = 7500
   from public.player_transactions
   where player_id = :u1 order by id desc limit 1),
  'the debit was recorded in the ledger');

\echo '== EXPLOIT: a failed onboarding must not leave cash or a company behind =='

-- Demand more starter plots than the world can supply, so onboarding fails
-- after the company insert and the land claim have already started.
update public.game_config set value = 100000 where key = 'starter_plot_count';

set role authenticated;
select test.login(:u3);
select test.expect_error(
  $$select public.complete_onboarding('three', 'Ghost Corp', 'GHO', 'services')$$,
  'NO_STARTER_LAND_AVAILABLE');
reset role;

select test.assert(
  (select cash from public.profiles where id = :u3) = 0,
  'the failed player has no cash');
select test.assert(
  (select onboarded_at is null from public.profiles where id = :u3),
  'the failed player is not marked onboarded');
select test.assert(
  (select count(*) from public.companies where owner_id = :u3) = 0,
  'the failed player has no company');
select test.assert(
  (select count(*) from public.plots where owner_id = :u3) = 0,
  'the failed player holds no land');
select test.assert(
  (select count(*) from public.player_transactions where player_id = :u3) = 0,
  'the failed player has no ledger rows');

update public.game_config set value = 1 where key = 'starter_plot_count';

\echo '== world seed sanity =='

select test.assert(
  (select count(*) from public.plots where not is_purchasable) > 0,
  'landmark plots exist and are off the market');
select test.assert(
  (select count(*) from public.plots
   where is_starter_eligible and zone in ('downtown', 'gambling', 'entertainment')) = 0,
  'premium zones are never given away as starter land');
select test.assert(
  (select count(distinct zone) from public.plots) = 9,
  'all nine zones are present in the world');
select test.assert(
  (select min(purchase_price) from public.plots where zone = 'rural')
    < (select min(purchase_price) from public.plots where zone = 'downtown'),
  'downtown land costs more than rural land');

\echo '== PHASE 1 DATABASE TESTS PASSED =='
