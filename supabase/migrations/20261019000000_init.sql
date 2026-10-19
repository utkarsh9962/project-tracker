-- Project Tracker schema. Every row belongs to the signed-in user (owner_id),
-- and row-level security makes sure each user only ever sees their own rows.

create table public.people (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  role text,
  email text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  client text,
  description text,
  status text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  progress integer not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_people (
  project_id bigint not null references public.projects on delete cascade,
  person_id bigint not null references public.people on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  role text,
  primary key (project_id, person_id)
);

create table public.tasks (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id bigint not null references public.projects on delete cascade,
  title text not null,
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done')),
  due_date date,
  assignee_id bigint references public.people on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tickets (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  key text not null,
  title text not null,
  client text,
  project_id bigint references public.projects on delete set null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  url text,
  due_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.resources (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  project_id bigint references public.projects on delete cascade,
  ticket_id bigint references public.tickets on delete cascade,
  title text not null,
  kind text not null default 'link' check (kind in ('link', 'doc', 'sheet', 'pdf', 'slack', 'email', 'jira', 'note', 'other')),
  url text check (url is null or url ~* '^(https?|mailto|slack):'),
  notes text,
  created_at timestamptz not null default now()
);

alter table public.tickets add constraint tickets_url_scheme check (url is null or url ~* '^(https?|mailto|slack):');

create index on public.tasks (project_id);
create index on public.tickets (project_id);
create index on public.resources (project_id);
create index on public.resources (ticket_id);
create index on public.project_people (person_id);

-- Keep updated_at current.
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger touch before update on public.people for each row execute function public.touch_updated_at();
create trigger touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger touch before update on public.tickets for each row execute function public.touch_updated_at();

-- Row-level security: owner-only access on every table.
do $$
declare t text;
begin
  foreach t in array array['people', 'projects', 'project_people', 'tasks', 'tickets', 'resources'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "Owner can do everything" on public.%I for all to authenticated
         using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
