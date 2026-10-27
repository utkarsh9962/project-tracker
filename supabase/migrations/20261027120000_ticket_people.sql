-- People working on a ticket. A ticket can have several people, and a person several tickets.
create table if not exists public.ticket_people (
  ticket_id bigint not null references public.tickets on delete cascade,
  person_id bigint not null references public.people on delete cascade,
  owner_id uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (ticket_id, person_id)
);
create index if not exists ticket_people_person_id_idx on public.ticket_people (person_id);

alter table public.ticket_people enable row level security;
revoke all on public.ticket_people from anon;
drop policy if exists "Team can do everything" on public.ticket_people;
create policy "Team can do everything" on public.ticket_people for all to authenticated
  using ((select public.is_team_member())) with check ((select public.is_team_member()));
