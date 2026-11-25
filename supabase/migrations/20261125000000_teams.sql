-- Teams that people belong to (.NET, OneApp, CMS…). Each person is in at most one team; People and Workload group by it.
-- Safe to run more than once.
create table if not exists public.teams (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  position int not null default 0,
  owner_id uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists teams_name_key on public.teams (lower(name));

alter table public.teams enable row level security;
revoke all on public.teams from anon;
drop policy if exists "Team can do everything" on public.teams;
create policy "Team can do everything" on public.teams for all to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));

-- Deleting a team leaves its people in place, just without a team.
alter table public.people add column if not exists team_id bigint references public.teams on delete set null;
create index if not exists people_team_id_idx on public.people (team_id);

insert into public.teams (name, position) values
  ('.NET', 1), ('OneApp', 2), ('CMS', 3), ('Mobile', 4), ('QA', 5), ('Support', 6), ('Data Team', 7)
on conflict do nothing;
