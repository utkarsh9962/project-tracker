-- Milestones on projects, and a shared team: every member sees and edits all data.

create table if not exists public.milestones (
  id bigint generated always as identity primary key,
  owner_id uuid default auth.uid() references auth.users on delete set null,
  project_id bigint not null references public.projects on delete cascade,
  title text not null,
  due_date date,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists milestones_project_id_idx on public.milestones (project_id);

-- Only logins listed here can read or change anything.
create table if not exists public.team_members (
  user_id uuid primary key references auth.users on delete cascade,
  added_at timestamptz not null default now()
);

create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members where user_id = auth.uid())
$$;

alter table public.team_members enable row level security;
revoke all on public.team_members from anon;
drop policy if exists "Members can see the team" on public.team_members;
create policy "Members can see the team" on public.team_members for select to authenticated using ((select public.is_team_member()));

do $$
declare t text;
begin
  foreach t in array array['people', 'projects', 'project_people', 'tasks', 'tickets', 'resources', 'milestones'] loop
    -- Rows stay when the person who created them is removed.
    execute format('alter table public.%I alter column owner_id drop not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_owner_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (owner_id) references auth.users on delete set null', t, t || '_owner_id_fkey');

    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Owner can do everything" on public.%I', t);
    execute format('drop policy if exists "Team can do everything" on public.%I', t);
    execute format(
      'create policy "Team can do everything" on public.%I for all to authenticated
         using ((select public.is_team_member())) with check ((select public.is_team_member()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Everyone who already has a login joins the team. Run this line again after adding a new user.
insert into public.team_members (user_id) select id from auth.users on conflict do nothing;
