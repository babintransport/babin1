-- Migrare 002: documente vehicule (RCA, ITP, Fahrzeugschein etc.) cu date de expirare și fișiere
-- Aditivă: nu modifică și nu șterge nimic existent. Poate fi rulată de mai multe ori.

create table if not exists public.vehicle_documents (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid not null references public.vehicles(id) on delete cascade,
  doc_type    text not null,
  title       text,
  expiry_date date,
  file_path   text,                      -- cale în bucket-ul "vehicle-docs"
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists vehicle_documents_vehicle_idx on public.vehicle_documents (vehicle_id, expiry_date);

alter table public.vehicle_documents enable row level security;

drop policy if exists vehicle_documents_admin on public.vehicle_documents;
create policy vehicle_documents_admin on public.vehicle_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.vehicle_documents to authenticated;

-- Bucket privat pentru fișiere, accesibil doar adminilor
insert into storage.buckets (id, name, public) values ('vehicle-docs', 'vehicle-docs', false)
on conflict (id) do nothing;

drop policy if exists "vehicle_docs_admin" on storage.objects;
create policy "vehicle_docs_admin" on storage.objects for all to authenticated
  using (bucket_id = 'vehicle-docs' and public.is_admin())
  with check (bucket_id = 'vehicle-docs' and public.is_admin());
