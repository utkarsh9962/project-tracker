-- Jira tickets this ticket is linked to, e.g. a WP ticket's ZST support ticket and its RM release.
-- Filled in by the Jira import (a "Linked" column). Safe to run more than once.
alter table public.tickets add column if not exists linked_keys text[] not null default '{}';
create index if not exists tickets_linked_keys_idx on public.tickets using gin (linked_keys);
