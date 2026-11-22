-- Migrare 003: curse (repartizare șofer + vehicul, confirmare, start, finalizare)
-- Aditivă: nu modifică și nu șterge nimic existent. Poate fi rulată de mai multe ori.

create table if not exists public.trips (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  driver_id     uuid references public.users(id) on delete set null,
  vehicle_id    uuid references public.vehicles(id) on delete set null,
  origin        text,
  destination   text,
  scheduled_at  timestamptz not null,
  instructions  text,
  status        text not null default 'planned'
                check (status in ('planned', 'accepted', 'in_progress', 'done', 'cancelled')),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists trips_driver_idx on public.trips (driver_id, scheduled_at);
create index if not exists trips_status_idx on public.trips (status, scheduled_at);

alter table public.trips enable row level security;

drop policy if exists trips_admin on public.trips;
create policy trips_admin on public.trips for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists trips_driver_select on public.trips;
create policy trips_driver_select on public.trips for select to authenticated
  using (driver_id = auth.uid());

drop policy if exists trips_driver_update on public.trips;
create policy trips_driver_update on public.trips for update to authenticated
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());

grant select, insert, update, delete on public.trips to authenticated;

-- Șoferul poate modifica doar starea cursei (acceptă / începe / finalizează) și orele reale
create or replace function public.trips_driver_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  new.title := old.title;
  new.driver_id := old.driver_id;
  new.vehicle_id := old.vehicle_id;
  new.origin := old.origin;
  new.destination := old.destination;
  new.scheduled_at := old.scheduled_at;
  new.instructions := old.instructions;
  new.created_at := old.created_at;
  if new.status not in ('accepted', 'in_progress', 'done') then new.status := old.status; end if;
  return new;
end;
$$;

drop trigger if exists trips_guard on public.trips;
create trigger trips_guard before update on public.trips
  for each row execute function public.trips_driver_guard();

-- Când începe o cursă, vehiculul este preluat în Istoric șoferi; la final, preluarea se încheie
create or replace function public.trips_sync_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.vehicle_id is not null and new.driver_id is not null and new.status is distinct from old.status then
    if new.status = 'in_progress' then
      insert into public.driver_history (vehicle_id, user_id, start_time, notes)
      select new.vehicle_id, new.driver_id, now(), 'Cursă: ' || new.title
      where not exists (select 1 from public.driver_history h where h.vehicle_id = new.vehicle_id and h.end_time is null);
    elsif new.status = 'done' and old.status = 'in_progress' then
      update public.driver_history set end_time = now()
      where vehicle_id = new.vehicle_id and user_id = new.driver_id and end_time is null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trips_history_sync on public.trips;
create trigger trips_history_sync after update on public.trips
  for each row execute function public.trips_sync_history();
