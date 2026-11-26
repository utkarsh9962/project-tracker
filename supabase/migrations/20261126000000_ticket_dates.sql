-- How old a piece of work is. Safe to run more than once.
-- assigned_on: the day this person was given the ticket in Jira (the last time the assignee changed to them).
-- started_on: the day the ticket last moved into its current Jira status category, e.g. into In Progress.
alter table public.ticket_people add column if not exists assigned_on date;
alter table public.tickets add column if not exists started_on date;
