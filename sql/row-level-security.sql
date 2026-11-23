-- ===========================================================================
-- AgroAI — Row Level Security
-- ===========================================================================
-- Every tenant table only exposes rows that belong to the current request's
-- scope. The application opens one transaction per request and sets the scope
-- with `set_config('app.farmer_id', ..., true)` (see src/db/index.ts). The
-- setting is transaction-local, so pooled connections can never leak one
-- farmer's scope into another request.
--
-- Scope helpers:
--   app_farmer_id()  -> the signed-in farmer id, or NULL
--   app_claim_ids()  -> farm ids this browser may read/claim while unowned
--   app_is_service() -> true for trusted server tasks (weekly cron)
--
-- This file is idempotent: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Scope helper functions
-- ---------------------------------------------------------------------------
create or replace function public.app_farmer_id() returns integer
  language sql stable
  as $$ select nullif(current_setting('app.farmer_id', true), '')::integer $$;

create or replace function public.app_claim_ids() returns integer[]
  language sql stable
  as $$
    select case
      when coalesce(current_setting('app.claim_ids', true), '') = '' then array[]::integer[]
      else string_to_array(current_setting('app.claim_ids', true), ',')::integer[]
    end
  $$;

create or replace function public.app_is_service() returns boolean
  language sql stable
  as $$ select coalesce(current_setting('app.service', true), '') = 'on' $$;

-- ---------------------------------------------------------------------------
-- Auth lookups (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- Login and sign-up need to read a farmer row before a scope exists, and the
-- "claim an unowned / legacy farm" check must see the owner's pin hash. These
-- run as the table owner, which bypasses RLS by design.

create or replace function public.auth_find_farmer(p_name text)
returns setof public.farmers
  language sql stable security definer set search_path = public
  as $$ select * from public.farmers where lower(name) = lower(btrim(p_name)) limit 1 $$;

create or replace function public.auth_find_farmer_by_id(p_id integer)
returns setof public.farmers
  language sql stable security definer set search_path = public
  as $$ select * from public.farmers where id = p_id limit 1 $$;

create or replace function public.auth_farm_claimable(p_farm_id integer)
returns boolean
  language sql stable security definer set search_path = public
  as $$
    select exists (
      select 1
      from public.farmlands fl
      left join public.farmers f on f.id = fl.farmer_id
      where fl.id = p_farm_id
        and (fl.farmer_id is null or coalesce(f.pin_hash, '') = '')
    )
  $$;

-- Resolves a phone camera pairing token to its owner without a login session.
create or replace function public.auth_camera_farmer(p_token text)
returns integer
  language sql stable security definer set search_path = public
  as $$ select farmer_id from public.camera_sessions where token = p_token limit 1 $$;

revoke all on function public.auth_find_farmer(text) from public;
revoke all on function public.auth_find_farmer_by_id(integer) from public;
revoke all on function public.auth_farm_claimable(integer) from public;
revoke all on function public.auth_camera_farmer(text) from public;

-- ---------------------------------------------------------------------------
-- farmers
-- ---------------------------------------------------------------------------
alter table public.farmers enable row level security;
drop policy if exists farmers_scope on public.farmers;
create policy farmers_scope on public.farmers
  using (public.app_is_service() or id = public.app_farmer_id())
  with check (public.app_is_service() or id = public.app_farmer_id());

-- ---------------------------------------------------------------------------
-- farmlands
-- ---------------------------------------------------------------------------
alter table public.farmlands enable row level security;
drop policy if exists farmlands_scope on public.farmlands;
create policy farmlands_scope on public.farmlands
  using (
    public.app_is_service()
    or farmer_id = public.app_farmer_id()
    or (farmer_id is null and id = any (public.app_claim_ids()))
  )
  with check (
    public.app_is_service()
    or farmer_id = public.app_farmer_id()
    or farmer_id is null
  );

-- ---------------------------------------------------------------------------
-- crops (owned through their farmland)
-- ---------------------------------------------------------------------------
alter table public.crops enable row level security;
drop policy if exists crops_scope on public.crops;
create policy crops_scope on public.crops
  using (
    public.app_is_service()
    or exists (
      select 1 from public.farmlands fl
      where fl.id = crops.farmland_id
        and fl.farmer_id = public.app_farmer_id()
    )
  )
  with check (
    public.app_is_service()
    or exists (
      select 1 from public.farmlands fl
      where fl.id = crops.farmland_id
        and fl.farmer_id = public.app_farmer_id()
    )
  );

-- ---------------------------------------------------------------------------
-- weekly_reports (owned through crop -> farmland)
-- ---------------------------------------------------------------------------
alter table public.weekly_reports enable row level security;
drop policy if exists weekly_reports_scope on public.weekly_reports;
create policy weekly_reports_scope on public.weekly_reports
  using (
    public.app_is_service()
    or exists (
      select 1 from public.crops c
      join public.farmlands fl on fl.id = c.farmland_id
      where c.id = weekly_reports.crop_id
        and fl.farmer_id = public.app_farmer_id()
    )
  )
  with check (
    public.app_is_service()
    or exists (
      select 1 from public.crops c
      join public.farmlands fl on fl.id = c.farmland_id
      where c.id = weekly_reports.crop_id
        and fl.farmer_id = public.app_farmer_id()
    )
  );

-- ---------------------------------------------------------------------------
-- disease_scans
-- ---------------------------------------------------------------------------
alter table public.disease_scans enable row level security;
drop policy if exists disease_scans_scope on public.disease_scans;
create policy disease_scans_scope on public.disease_scans
  using (public.app_is_service() or farmer_id = public.app_farmer_id())
  with check (public.app_is_service() or farmer_id = public.app_farmer_id());

-- ---------------------------------------------------------------------------
-- camera_sessions / camera_detections / camera_alerts
-- ---------------------------------------------------------------------------
alter table public.camera_sessions enable row level security;
drop policy if exists camera_sessions_scope on public.camera_sessions;
create policy camera_sessions_scope on public.camera_sessions
  using (public.app_is_service() or farmer_id = public.app_farmer_id())
  with check (public.app_is_service() or farmer_id = public.app_farmer_id());

alter table public.camera_detections enable row level security;
drop policy if exists camera_detections_scope on public.camera_detections;
create policy camera_detections_scope on public.camera_detections
  using (public.app_is_service() or farmer_id = public.app_farmer_id())
  with check (public.app_is_service() or farmer_id = public.app_farmer_id());

alter table public.camera_alerts enable row level security;
drop policy if exists camera_alerts_scope on public.camera_alerts;
create policy camera_alerts_scope on public.camera_alerts
  using (public.app_is_service() or farmer_id = public.app_farmer_id())
  with check (public.app_is_service() or farmer_id = public.app_farmer_id());

-- Short-lived WebRTC signalling rows for the 60-second Live Peek.
alter table public.camera_peek_sessions enable row level security;
drop policy if exists camera_peek_sessions_scope on public.camera_peek_sessions;
create policy camera_peek_sessions_scope on public.camera_peek_sessions
  using (public.app_is_service() or farmer_id = public.app_farmer_id())
  with check (public.app_is_service() or farmer_id = public.app_farmer_id());
