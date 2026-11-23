-- ===========================================================================
-- AgroAI event-driven security camera — Supabase deployment bundle
-- ===========================================================================
-- Run this once in a Supabase project (SQL editor or `supabase db push`).
--
-- The running app stores camera state in its own Postgres database (Neon +
-- Drizzle). This bundle is the Supabase-ready equivalent for deployments that
-- keep camera data in Supabase, and it matches the requested contract:
--
--   camera_devices    one row per phone camera
--   intrusion_events  one row per confirmed animal event (evidence photo)
--   camera_live_peeks short-lived SDP offer/answer rows for Live Peek
--
-- Bucket: intrusion-captures (private; one folder per auth user).
--
-- The phone authenticates with `pairing_token`, not a browser session, so the
-- table policies below allow the owner to read/write their own rows and let
-- the service-role key used by the phone API bypass RLS.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Devices
-- ---------------------------------------------------------------------------
create table if not exists public.camera_devices (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users (id) on delete cascade,
  name                text not null,
  pairing_token       text not null unique
                        default encode(gen_random_bytes(18), 'hex'),
  pairing_expires_at  timestamptz not null default now() + interval '30 days',
  status              text not null default 'offline'
                        check (status in ('offline', 'armed', 'live_peek')),
  device_label        text,
  battery_level       integer check (battery_level between 0 and 100),
  last_heartbeat_at   timestamptz,
  last_event_at       timestamptz,
  live_peek_until     timestamptz,
  latitude            double precision,
  longitude           double precision,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists camera_devices_owner_idx
  on public.camera_devices (owner_id, created_at desc);
create index if not exists camera_devices_heartbeat_idx
  on public.camera_devices (last_heartbeat_at desc);
create index if not exists camera_devices_token_idx
  on public.camera_devices (pairing_token);

-- ---------------------------------------------------------------------------
-- 2. Intrusion events
-- ---------------------------------------------------------------------------
create table if not exists public.intrusion_events (
  id            uuid primary key default gen_random_uuid(),
  device_id     uuid not null references public.camera_devices (id) on delete cascade,
  owner_id      uuid not null references auth.users (id) on delete cascade,
  species       text not null,
  label         text not null,
  confidence    numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
  image_path    text,
  image_url     text,
  captured_at   timestamptz not null default now(),
  latitude      double precision,
  longitude     double precision,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists intrusion_events_owner_idx
  on public.intrusion_events (owner_id, created_at desc);
create index if not exists intrusion_events_device_idx
  on public.intrusion_events (device_id, created_at desc);
create index if not exists intrusion_events_unresolved_idx
  on public.intrusion_events (owner_id, created_at desc)
  where resolved_at is null;

-- ---------------------------------------------------------------------------
-- 3. Live Peek signalling (SDP text only; video is peer-to-peer)
-- ---------------------------------------------------------------------------
create table if not exists public.camera_live_peeks (
  id          uuid primary key default gen_random_uuid(),
  device_id   uuid not null references public.camera_devices (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  offer       text not null,
  answer      text,
  status      text not null default 'requested'
                check (status in ('requested', 'answered', 'ended')),
  expires_at  timestamptz not null default now() + interval '60 seconds',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists camera_live_peeks_device_idx
  on public.camera_live_peeks (device_id, expires_at desc);

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.camera_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists camera_devices_touch on public.camera_devices;
create trigger camera_devices_touch
  before update on public.camera_devices
  for each row execute function public.camera_touch_updated_at();

drop trigger if exists camera_live_peeks_touch on public.camera_live_peeks;
create trigger camera_live_peeks_touch
  before update on public.camera_live_peeks
  for each row execute function public.camera_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.camera_devices enable row level security;
alter table public.intrusion_events enable row level security;
alter table public.camera_live_peeks enable row level security;

drop policy if exists camera_devices_owner on public.camera_devices;
create policy camera_devices_owner on public.camera_devices
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists intrusion_events_owner on public.intrusion_events;
create policy intrusion_events_owner on public.intrusion_events
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists camera_live_peeks_owner on public.camera_live_peeks;
create policy camera_live_peeks_owner on public.camera_live_peeks
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Storage bucket + policies
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('intrusion-captures', 'intrusion-captures', false)
on conflict (id) do nothing;

-- Object path convention: <owner_id>/<device_id>/<captured_at>.jpg
drop policy if exists "intrusion captures owner read" on storage.objects;
create policy "intrusion captures owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'intrusion-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "intrusion captures owner insert" on storage.objects;
create policy "intrusion captures owner insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'intrusion-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "intrusion captures owner update" on storage.objects;
create policy "intrusion captures owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'intrusion-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'intrusion-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "intrusion captures owner delete" on storage.objects;
create policy "intrusion captures owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'intrusion-captures'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 7. Realtime (dashboard badge + intrusion feed)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'camera_devices'
    ) then
      alter publication supabase_realtime add table public.camera_devices;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'intrusion_events'
    ) then
      alter publication supabase_realtime add table public.intrusion_events;
    end if;
  end if;
end;
$$;
