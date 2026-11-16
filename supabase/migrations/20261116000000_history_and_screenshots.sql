-- Activity history (who changed what, and when) and screenshots on projects, tasks and tickets.
-- Safe to run more than once.

-- ---------- Activity history ----------

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  who text, -- the login's email; empty for changes made in the SQL Editor
  entity text not null check (entity in ('project', 'task', 'ticket', 'milestone')),
  entity_id bigint not null,
  label text not null,
  project_id bigint,
  ticket_id bigint,
  action text not null check (action in ('created', 'updated', 'deleted')),
  changes jsonb not null default '{}' -- { field: [before, after] }
);
create index if not exists activity_at_idx on public.activity (at desc);
create index if not exists activity_project_idx on public.activity (project_id, at desc);
create index if not exists activity_ticket_idx on public.activity (ticket_id, at desc);

-- The team can read the history. Nobody writes to it directly: the triggers below do.
alter table public.activity enable row level security;
revoke all on public.activity from anon;
revoke insert, update, delete on public.activity from authenticated;
drop policy if exists "Team can read history" on public.activity;
create policy "Team can read history" on public.activity for select to authenticated using ((select public.is_team_member()));

create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  kind text := tg_argv[0];
  before jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  after jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  r jsonb := coalesce(after, before);
  diff jsonb := '{}';
  k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(after) loop
      if k not in ('id', 'owner_id', 'created_at', 'updated_at') and (before -> k) is distinct from (after -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_array(before -> k, after -> k));
      end if;
    end loop;
    if diff = '{}' then
      return null;
    end if;
  end if;
  insert into public.activity (user_id, who, entity, entity_id, label, project_id, ticket_id, action, changes)
  values (
    auth.uid(),
    auth.jwt() ->> 'email',
    kind,
    (r ->> 'id')::bigint,
    coalesce(r ->> 'key', r ->> 'name', r ->> 'title', ''),
    case when kind = 'project' then (r ->> 'id')::bigint else (r ->> 'project_id')::bigint end,
    case when kind = 'ticket' then (r ->> 'id')::bigint end,
    case tg_op when 'INSERT' then 'created' when 'UPDATE' then 'updated' else 'deleted' end,
    diff
  );
  return null;
end $$;
revoke all on function public.log_activity() from public, anon, authenticated;

drop trigger if exists log_activity on public.projects;
create trigger log_activity after insert or update or delete on public.projects for each row execute function public.log_activity('project');
drop trigger if exists log_activity on public.tasks;
create trigger log_activity after insert or update or delete on public.tasks for each row execute function public.log_activity('task');
drop trigger if exists log_activity on public.tickets;
create trigger log_activity after insert or update or delete on public.tickets for each row execute function public.log_activity('ticket');
drop trigger if exists log_activity on public.milestones;
create trigger log_activity after insert or update or delete on public.milestones for each row execute function public.log_activity('milestone');

-- ---------- Screenshots ----------

-- One row per image. A task's screenshot also carries its project, so a project page loads them all at once.
create table if not exists public.attachments (
  id bigint generated always as identity primary key,
  owner_id uuid default auth.uid() references auth.users on delete set null,
  project_id bigint references public.projects on delete cascade,
  task_id bigint references public.tasks on delete cascade,
  ticket_id bigint references public.tickets on delete cascade,
  path text not null unique,
  name text not null,
  caption text,
  created_at timestamptz not null default now(),
  check (project_id is not null or ticket_id is not null)
);
create index if not exists attachments_project_idx on public.attachments (project_id);
create index if not exists attachments_ticket_idx on public.attachments (ticket_id);

alter table public.attachments enable row level security;
revoke all on public.attachments from anon;
drop policy if exists "Team can do everything" on public.attachments;
create policy "Team can do everything" on public.attachments for all to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));

-- The images live in a private storage bucket that only the team can read or add to. Images only, 5 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists "Team can see screenshots" on storage.objects;
create policy "Team can see screenshots" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and (select public.is_team_member()));
drop policy if exists "Team can add screenshots" on storage.objects;
create policy "Team can add screenshots" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and (select public.is_team_member()));
drop policy if exists "Team can remove screenshots" on storage.objects;
create policy "Team can remove screenshots" on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and (select public.is_team_member()));
