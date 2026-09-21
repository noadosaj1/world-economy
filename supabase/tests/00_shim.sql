-- ===========================================================================
-- Local test shim: the parts of a Supabase project that our migrations rely
-- on. Applied before the migrations when running `npm run test:db` against a
-- throwaway Postgres. It is NOT part of the deployed schema.
-- ===========================================================================

create extension if not exists pgcrypto;

-- Supabase's PostgREST roles. Roles are cluster-wide, so creating them is
-- made idempotent: the test database is dropped between runs but the roles
-- survive.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase grants table privileges to these roles by default and relies on RLS
-- to gate access. Replicating that here is what makes the explicit REVOKEs in
-- 0001 a meaningful test.
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- Minimal auth schema.
create schema auth;
grant usage on schema auth to authenticated, service_role;

create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Test helpers. Granted to the PostgREST roles so tests can call them while
-- impersonating a logged-in player.
create schema test;
grant usage on schema test to anon, authenticated, service_role;

-- Runs p_sql and asserts it fails. Matches either a SQLSTATE or a message
-- (our game error codes travel in the message).
create or replace function test.expect_error(p_sql text, p_expect text)
returns void
language plpgsql
as $$
declare
  v_state text;
  v_msg   text;
begin
  execute p_sql;
  raise exception 'EXPECTED FAILURE (%) but statement succeeded: %', p_expect, p_sql;
exception
  when others then
    v_state := sqlstate;
    v_msg   := sqlerrm;
    if v_msg like 'EXPECTED FAILURE%' then
      raise;
    end if;
    if v_state = p_expect or v_msg like '%' || p_expect || '%' then
      raise notice '  ok  expected failure %: %', p_expect, left(v_msg, 60);
      return;
    end if;
    raise exception 'WRONG FAILURE: expected % got %/% for %', p_expect, v_state, v_msg, p_sql;
end;
$$;

create or replace function test.assert(p_condition boolean, p_label text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_label;
  end if;
  raise notice '  ok  %', p_label;
end;
$$;

-- Impersonates a logged-in player for RLS / auth.uid() purposes.
create or replace function test.login(p_user uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, false);
end;
$$;
