-- ===========================================================================
-- World Economy - Phase 1: the world grid
--
-- The world is a fixed 25x25 grid of cells. Every cell is either a PLOT row
-- in this table or a gap - and the 3D renderer draws a road in every gap.
-- Keeping roads as "the cells without plots" means the layout has exactly one
-- source of truth: this table.
--
-- Layout (north = -z, south = +z), matching the conceptual map:
--
--                       MINING DISTRICT
--        RURAL   ----   INDUSTRIAL   ----   COMMERCIAL
--        RURAL   ----   DOWNTOWN     ----   COMMERCIAL
--        WATERFRONT --  RESIDENTIAL  ----   COMMERCIAL
--              ENTERTAINMENT   ----   GAMBLING DISTRICT
-- ===========================================================================

insert into public.game_config (key, value, description) values
  ('world_grid_min',  -12, 'Lowest grid index on both the X and Z axes.'),
  ('world_grid_max',   12, 'Highest grid index on both the X and Z axes.'),
  ('world_cell_size',  20, 'World units per grid cell, used by the 3D renderer.');

-- Every 5th row and column is left empty to become a road corridor.
with cells as (
  select gx, gz
  from generate_series(-12, 12) as gx,
       generate_series(-12, 12) as gz
  where mod(gx, 5) <> 0
    and mod(gz, 5) <> 0
),
zoned as (
  select
    gx,
    gz,
    case
      when gz <= -8               then 'mining'
      when gz >= 8 and gx >= 4    then 'gambling'
      when gz >= 8                then 'entertainment'
      when gx <= -8               then 'rural'
      when gx >= 8                then 'commercial'
      when gz <= -4               then 'industrial'
      when gz >= 4 and gx <= -4   then 'waterfront'
      when gz >= 4                then 'residential'
      when abs(gx) <= 3           then 'downtown'
      when gx >= 4                then 'commercial'
      else                             'residential'
    end::public.plot_zone as zone
  from cells
)
insert into public.plots (
  grid_x, grid_z, zone, size, purchase_price,
  building_capacity, is_purchasable, is_starter_eligible
)
select
  gx,
  gz,
  zone,
  1,
  case zone
    when 'downtown'      then 120000
    when 'gambling'      then  90000
    when 'entertainment' then  60000
    when 'commercial'    then  45000
    when 'waterfront'    then  30000
    when 'residential'   then  25000
    when 'mining'        then  22000
    when 'industrial'    then  18000
    when 'rural'         then   8000
  end::numeric(20, 2),
  case zone
    when 'downtown'   then 3
    when 'commercial' then 2
    else                   1
  end,
  -- Landmarks are permanently off the market: the casino complex in the
  -- gambling district and the central plaza downtown.
  not (
    (zone = 'gambling' and gx between 7 and 10 and gz between 9 and 11)
    or (zone = 'downtown' and gx between 1 and 3 and gz between 1 and 3)
  ),
  -- Free starter land comes from the affordable, immediately useful zones.
  zone in ('rural', 'residential', 'industrial')
from zoned;

-- Sanity guard: the grid must have produced land, and starter land must exist,
-- otherwise onboarding would fail for the very first player.
do $$
declare
  v_total   integer;
  v_starter integer;
begin
  select count(*) into v_total from public.plots;
  select count(*) into v_starter from public.plots
    where is_starter_eligible and is_purchasable;

  if v_total = 0 then
    raise exception 'World seed produced no plots';
  end if;
  if v_starter = 0 then
    raise exception 'World seed produced no starter-eligible plots';
  end if;

  raise notice 'Seeded % plots (% starter-eligible).', v_total, v_starter;
end;
$$;
