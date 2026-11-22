-- Migrare 004: Finanțe (cheltuieli) și Service (lucrări programate / efectuate)
-- Aditivă: nu modifică și nu șterge nimic existent. Poate fi rulată de mai multe ori.
-- Combustibilul rămâne în tabelul fuel_logs și este adunat automat în rapoartele financiare.

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles(id) on delete cascade,
  category      text not null,                 -- asigurare, taxa, anvelope, reparatie, altele
  amount        numeric(10,2) not null check (amount >= 0),
  expense_date  date not null,
  supplier      text,
  description   text,
  file_path     text,                          -- cale în bucket-ul "expense-docs"
  created_at    timestamptz not null default now()
);

create table if not exists public.service_jobs (
  id              uuid primary key default gen_random_uuid(),
  vehicle_id      uuid not null references public.vehicles(id) on delete cascade,
  kind            text not null,               -- Revizie, Schimb ulei, Filtre, Frâne, Anvelope, Reparație, Altele
  status          text not null default 'planned' check (status in ('planned', 'done')),
  scheduled_date  date,
  done_date       date,
  km              integer check (km is null or km >= 0),
  cost            numeric(10,2) check (cost is null or cost >= 0),
  workshop        text,
  notes           text,
  file_path       text,
  created_at      timestamptz not null default now()
);

create index if not exists expenses_vehicle_idx on public.expenses (vehicle_id, expense_date);
create index if not exists service_jobs_vehicle_idx on public.service_jobs (vehicle_id, status, scheduled_date);

alter table public.expenses enable row level security;
alter table public.service_jobs enable row level security;

drop policy if exists expenses_admin on public.expenses;
create policy expenses_admin on public.expenses for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists service_jobs_admin on public.service_jobs;
create policy service_jobs_admin on public.service_jobs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.service_jobs to authenticated;

-- Bucket privat pentru facturi și documente, accesibil doar adminilor
insert into storage.buckets (id, name, public) values ('expense-docs', 'expense-docs', false)
on conflict (id) do nothing;

drop policy if exists "expense_docs_admin" on storage.objects;
create policy "expense_docs_admin" on storage.objects for all to authenticated
  using (bucket_id = 'expense-docs' and public.is_admin())
  with check (bucket_id = 'expense-docs' and public.is_admin());
