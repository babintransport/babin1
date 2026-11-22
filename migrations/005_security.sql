-- Migrare 005: roluri extinse, audit log, istoric autentificări, 2FA (Authenticator) impus pe server
-- IMPORTANT: rulează-o ÎNTR-O SINGURĂ FEREASTRĂ nouă din SQL Editor, apoi urmează pașii de la finalul fișierului.
-- Nu șterge date. Rolul existent 'admin' continuă să funcționeze. Poate fi rulată de mai multe ori.

-- ============ 1. Roluri ============
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('super_admin', 'admin', 'manager', 'accountant', 'mechanic', 'employee'));

-- ============ 2. Funcții de permisiuni ============
-- Dacă un utilizator și-a activat Authenticator (2FA), serverul cere sesiune verificată în doi pași (aal2).
-- Utilizatorii fără 2FA activat nu sunt afectați.
create or replace function public.mfa_ok()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;

create or replace function public.has_role(roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.mfa_ok() and exists (select 1 from public.users u where u.id = auth.uid() and u.role = any(roles));
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role(array['admin', 'super_admin']);
$$;

-- Reguli pentru schimbarea rolurilor (din aplicație): nu îți poți schimba propriul rol;
-- doar Super Administratorul acordă sau retrage rolurile de administrator.
-- Din SQL Editor (fără utilizator autentificat) regulile nu se aplică.
create or replace function public.users_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    if old.id = auth.uid() then
      raise exception 'Nu îți poți schimba propriul rol.';
    end if;
    if (new.role in ('admin', 'super_admin') or old.role in ('admin', 'super_admin'))
       and not public.has_role(array['super_admin']) then
      raise exception 'Doar Super Administratorul poate acorda sau retrage rolul de administrator.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_role_guard_trg on public.users;
create trigger users_role_guard_trg before update on public.users
  for each row execute function public.users_role_guard();

-- ============ 3. Permisiuni pe roluri (politici ADIȚIONALE, cele existente rămân) ============
-- Manager: operațiuni complete
do $$ declare t text; begin
  foreach t in array array['vehicles','driver_history','tasks','fuel_logs','defects','trips','vehicle_documents','service_jobs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists rbac_manager_all on public.%I', t);
      execute format('create policy rbac_manager_all on public.%I for all to authenticated using (public.has_role(array[''manager''])) with check (public.has_role(array[''manager'']))', t);
    end if;
  end loop;
end $$;

-- Contabil, Mecanic și citirea cheltuielilor de către Manager
do $$ declare r text[]; begin
  foreach r slice 1 in array array[
    array['expenses',          'manager',    'select'],
    array['expenses',          'accountant', 'all'],
    array['fuel_logs',         'accountant', 'select'],
    array['service_jobs',      'accountant', 'select'],
    array['service_jobs',      'mechanic',   'all'],
    array['vehicle_documents', 'accountant', 'select'],
    array['vehicle_documents', 'mechanic',   'select'],
    array['defects',           'mechanic',   'select'],
    array['defects',           'mechanic',   'update']
  ] loop
    if to_regclass('public.' || r[1]) is not null then
      execute format('drop policy if exists %I on public.%I', 'rbac_' || r[2] || '_' || r[3], r[1]);
      execute format('create policy %I on public.%I for %s to authenticated using (public.has_role(array[%L])) %s',
        'rbac_' || r[2] || '_' || r[3], r[1], r[3], r[2],
        case when r[3] in ('all', 'update') then format('with check (public.has_role(array[%L]))', r[2]) else '' end);
    end if;
  end loop;
end $$;

-- Fișiere (bonuri, poze, documente, facturi)
drop policy if exists "rbac_storage_read" on storage.objects;
create policy "rbac_storage_read" on storage.objects for select to authenticated using (
     (bucket_id = 'receipts'      and public.has_role(array['manager', 'accountant']))
  or (bucket_id = 'defect-photos' and public.has_role(array['manager', 'mechanic']))
  or (bucket_id in ('vehicle-docs', 'expense-docs') and public.has_role(array['manager', 'accountant', 'mechanic']))
);

drop policy if exists "rbac_storage_write_expense" on storage.objects;
create policy "rbac_storage_write_expense" on storage.objects for all to authenticated
  using (bucket_id = 'expense-docs' and public.has_role(array['manager', 'accountant', 'mechanic']))
  with check (bucket_id = 'expense-docs' and public.has_role(array['manager', 'accountant', 'mechanic']));

drop policy if exists "rbac_storage_write_vehicle" on storage.objects;
create policy "rbac_storage_write_vehicle" on storage.objects for all to authenticated
  using (bucket_id = 'vehicle-docs' and public.has_role(array['manager']))
  with check (bucket_id = 'vehicle-docs' and public.has_role(array['manager']));

-- ============ 4. Audit log ============
create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid,
  user_email  text,
  action      text not null,
  table_name  text not null,
  record_id   text,
  old_data    jsonb,
  new_data    jsonb
);
create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_table_idx on public.audit_log (table_name, at desc);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated using (public.is_admin());
grant select on public.audit_log to authenticated;     -- fără drept de scriere: doar triggerele scriu

create or replace function public.audit_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then o := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then n := to_jsonb(new); end if;
  insert into public.audit_log (user_id, user_email, action, table_name, record_id, old_data, new_data)
  values (auth.uid(), (select email from public.users where id = auth.uid()), tg_op, tg_table_name,
          coalesce(n, o) ->> 'id', o, n);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

do $$ declare t text; begin
  foreach t in array array['vehicles','trips','tasks','fuel_logs','defects','driver_history','vehicle_documents','service_jobs','expenses','users'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists audit_%s on public.%I', t, t);
      execute format('create trigger audit_%s after insert or update or delete on public.%I for each row execute function public.audit_trigger()', t, t);
    end if;
  end loop;
end $$;

-- ============ 5. Istoric autentificări ============
create table if not exists public.login_events (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  user_id     uuid not null default auth.uid(),
  user_agent  text
);
create index if not exists login_events_at_idx on public.login_events (at desc);

alter table public.login_events enable row level security;
drop policy if exists login_events_insert on public.login_events;
create policy login_events_insert on public.login_events for insert to authenticated with check (user_id = auth.uid());
drop policy if exists login_events_select on public.login_events;
create policy login_events_select on public.login_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
grant select, insert on public.login_events to authenticated;

-- ============ PAȘI DUPĂ RULARE ============
-- 1) Fă-ți contul de Super Administrator (înlocuiește e-mailul):
--    update public.users set role = 'super_admin' where email = 'emailul-tau@gmail.com';
-- 2) Activează Authenticator din aplicație (Securitate). Din acel moment serverul cere codul la fiecare autentificare.
-- 3) Recuperare dacă pierzi telefonul (rulează în SQL Editor, cu e-mailul tău):
--    delete from auth.mfa_factors where user_id = (select id from auth.users where email = 'emailul-tau@gmail.com');
