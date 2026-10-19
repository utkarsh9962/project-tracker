-- Jira ZSTs use a "Blocker" priority above Critical.
alter table public.projects drop constraint projects_priority_check;
alter table public.projects add constraint projects_priority_check check (priority in ('low', 'medium', 'high', 'critical', 'blocker'));
alter table public.tickets drop constraint tickets_priority_check;
alter table public.tickets add constraint tickets_priority_check check (priority in ('low', 'medium', 'high', 'critical', 'blocker'));
