-- Link to the person's saved Jira filter, shown on their People card and page.
alter table public.people add column if not exists jira_filter text;
