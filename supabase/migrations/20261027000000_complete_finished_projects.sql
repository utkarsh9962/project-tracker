-- Projects at 100% are completed. The app now keeps status in step as progress changes;
-- this catches up projects that already reached 100% before that.
-- A project with tasks is at 100% when every task is done; one without tasks uses its typed-in progress.
update public.projects p
set status = 'done'
where p.status <> 'done'
  and case
    when exists (select 1 from public.tasks t where t.project_id = p.id)
      then not exists (select 1 from public.tasks t where t.project_id = p.id and t.status <> 'done')
    else p.progress >= 100
  end;
