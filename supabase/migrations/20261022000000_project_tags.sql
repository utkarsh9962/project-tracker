-- Platform tags on projects (.NET, Mobile, WEB, CMS or any custom tag) for filtering by team or component.
alter table public.projects add column if not exists tags text[] not null default '{}';
