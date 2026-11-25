-- One person can be in several teams. Membership moves from people.team_id to this table.
-- Safe to run more than once. people.team_id is kept (no longer used) so nothing is lost.
create table if not exists public.team_people (
  team_id bigint not null references public.teams on delete cascade,
  person_id bigint not null references public.people on delete cascade,
  owner_id uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (team_id, person_id)
);
create index if not exists team_people_person_id_idx on public.team_people (person_id);

alter table public.team_people enable row level security;
revoke all on public.team_people from anon;
drop policy if exists "Team can do everything" on public.team_people;
create policy "Team can do everything" on public.team_people for all to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));

-- Keep everyone in the team they were already put in.
insert into public.team_people (team_id, person_id)
select team_id, id from public.people where team_id is not null
on conflict do nothing;
