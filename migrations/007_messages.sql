-- Migrare 007: mesaje private (șofer ↔ personal), anunțuri generale, atașamente
-- Cere migrarea 005 (securitate) rulată înainte.
-- Aditivă: nu modifică și nu șterge nimic existent. Poate fi rulată de mai multe ori.
-- Confidențialitate: conversațiile private sunt vizibile DOAR celor doi participanți (nici administratorii nu le citesc).

create or replace function public.user_is_staff(u uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = u and role <> 'employee');
$$;

create table if not exists public.direct_messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null default auth.uid() references public.users(id) on delete cascade,
  recipient_id  uuid not null references public.users(id) on delete cascade,
  message       text not null default '' check (char_length(message) <= 2000),
  file_path     text,                                   -- cale în bucket-ul "chat-files"
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  check (sender_id <> recipient_id),
  check (char_length(message) > 0 or file_path is not null)
);
create index if not exists dm_recipient_idx on public.direct_messages (recipient_id, read_at);
create index if not exists dm_pair_idx on public.direct_messages (sender_id, recipient_id, created_at desc);

alter table public.direct_messages enable row level security;

drop policy if exists dm_select on public.direct_messages;
create policy dm_select on public.direct_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

-- Șoferii pot scrie doar personalului; personalul poate scrie oricui
drop policy if exists dm_insert on public.direct_messages;
create policy dm_insert on public.direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and (public.user_is_staff(sender_id) or public.user_is_staff(recipient_id)));

-- Destinatarul poate doar marca mesajul ca citit (drept pe coloana read_at)
drop policy if exists dm_update on public.direct_messages;
create policy dm_update on public.direct_messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

revoke all on public.direct_messages from authenticated;
grant select, insert on public.direct_messages to authenticated;
grant update (read_at) on public.direct_messages to authenticated;

-- Anunțuri generale: toți citesc; administratorii și managerii publică și șterg
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null default auth.uid() references public.users(id) on delete cascade,
  title       text not null,
  body        text,
  created_at  timestamptz not null default now()
);
create index if not exists announcements_at_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;
drop policy if exists announcements_select on public.announcements;
create policy announcements_select on public.announcements for select to authenticated using (true);
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
  with check (author_id = auth.uid() and public.has_role(array['admin', 'super_admin', 'manager']));
drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete to authenticated
  using (public.has_role(array['admin', 'super_admin', 'manager']));
grant select, insert, delete on public.announcements to authenticated;

-- Atașamente: cale <expeditor>/<destinatar>/fișier; pot citi doar cei doi participanți
insert into storage.buckets (id, name, public) values ('chat-files', 'chat-files', false)
on conflict (id) do nothing;

drop policy if exists "chat_files_upload" on storage.objects;
create policy "chat_files_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "chat_files_read" on storage.objects;
create policy "chat_files_read" on storage.objects for select to authenticated
  using (bucket_id = 'chat-files' and (
    (storage.foldername(name))[1] = auth.uid()::text or (storage.foldername(name))[2] = auth.uid()::text
  ));

-- Mesaje în timp real
do $$ declare t text; begin
  foreach t in array array['direct_messages', 'announcements'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
