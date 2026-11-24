-- Migrare 006: Portal șofer – verificarea vehiculului (checklist) și documente (CMR, dovezi de livrare, fotografii)
-- Cere migrările 003 (curse) și 005 (securitate) rulate înainte.
-- Aditivă: nu modifică și nu șterge nimic existent. Poate fi rulată de mai multe ori.

create table if not exists public.vehicle_checks (
  id           uuid primary key default gen_random_uuid(),
  vehicle_id   uuid not null references public.vehicles(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.users(id),
  km           integer check (km is null or km >= 0),
  items        jsonb not null default '{}'::jsonb,      -- ex. {"tires":"ok","brakes":"problem"}
  has_problem  boolean not null default false,
  notes        text,
  photos       text[] not null default '{}',            -- căi în bucket-ul "driver-docs"
  created_at   timestamptz not null default now()
);

create table if not exists public.driver_documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.users(id),
  trip_id     uuid references public.trips(id) on delete set null,
  vehicle_id  uuid references public.vehicles(id) on delete set null,
  doc_type    text not null,                             -- CMR, Dovadă livrare, Fotografie, Altele
  title       text,
  file_path   text not null,                             -- cale în bucket-ul "driver-docs"
  created_at  timestamptz not null default now()
);

create index if not exists vehicle_checks_vehicle_idx on public.vehicle_checks (vehicle_id, created_at desc);
create index if not exists driver_documents_user_idx on public.driver_documents (user_id, created_at desc);

alter table public.vehicle_checks enable row level security;
alter table public.driver_documents enable row level security;

-- Verificări: șoferul adaugă și vede ale lui; administratorii, managerii și mecanicii le văd pe toate
drop policy if exists vehicle_checks_select on public.vehicle_checks;
create policy vehicle_checks_select on public.vehicle_checks for select to authenticated
  using (user_id = auth.uid() or public.has_role(array['admin', 'super_admin', 'manager', 'mechanic']));
drop policy if exists vehicle_checks_insert on public.vehicle_checks;
create policy vehicle_checks_insert on public.vehicle_checks for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists vehicle_checks_admin on public.vehicle_checks;
create policy vehicle_checks_admin on public.vehicle_checks for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Documente: șoferul adaugă și vede ale lui; administratorii, managerii și contabilii le văd pe toate
drop policy if exists driver_documents_select on public.driver_documents;
create policy driver_documents_select on public.driver_documents for select to authenticated
  using (user_id = auth.uid() or public.has_role(array['admin', 'super_admin', 'manager', 'accountant']));
drop policy if exists driver_documents_insert on public.driver_documents;
create policy driver_documents_insert on public.driver_documents for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists driver_documents_admin on public.driver_documents;
create policy driver_documents_admin on public.driver_documents for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.vehicle_checks to authenticated;
grant select, insert, update, delete on public.driver_documents to authenticated;

-- Fișiere private: fiecare șofer încarcă în folderul lui (<id_utilizator>/...)
insert into storage.buckets (id, name, public) values ('driver-docs', 'driver-docs', false)
on conflict (id) do nothing;

drop policy if exists "driver_docs_upload" on storage.objects;
create policy "driver_docs_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'driver-docs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "driver_docs_read" on storage.objects;
create policy "driver_docs_read" on storage.objects for select to authenticated
  using (bucket_id = 'driver-docs' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_role(array['admin', 'super_admin', 'manager', 'accountant', 'mechanic'])
  ));

-- Audit pentru noile tabele
do $$ declare t text; begin
  foreach t in array array['vehicle_checks', 'driver_documents'] loop
    execute format('drop trigger if exists audit_%s on public.%I', t, t);
    execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
  end loop;
end $$;
