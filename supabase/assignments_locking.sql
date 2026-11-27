-- Horus Leaders: lock trainee submissions after grading and automatically at deadline.
-- Run once in Supabase SQL Editor after assignments_setup.sql.

create or replace function public.horus_can_submit(_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    join public.enrollments e on e.cohort_id = a.cohort_id
    where a.id = _assignment_id
      and a.status = 'published'::public.assignment_status
      and (a.due_at is null or a.due_at > now())
      and e.trainee_id = (select auth.uid())
      and not exists (
        select 1
        from public.submissions s
        where s.assignment_id = a.id
          and s.trainee_id = (select auth.uid())
          and s.grade is not null
      )
  );
$$;

revoke all on function public.horus_can_submit(uuid) from public, anon;
grant execute on function public.horus_can_submit(uuid) to authenticated;

-- Enforce the lock on both INSERT and UPDATE (including upsert) at database level.
drop policy if exists submissions_trainee_insert on public.submissions;
create policy submissions_trainee_insert on public.submissions
for insert to authenticated
with check (
  trainee_id = (select auth.uid())
  and (select public.horus_can_submit(assignment_id))
);

drop policy if exists submissions_trainee_update on public.submissions;
create policy submissions_trainee_update on public.submissions
for update to authenticated
using (
  trainee_id = (select auth.uid())
  and (select public.horus_can_submit(assignment_id))
)
with check (
  trainee_id = (select auth.uid())
  and (select public.horus_can_submit(assignment_id))
);

-- Storage upload/delete policies already call horus_can_submit, so the same
-- deadline and grading lock also prevents uploading replacement files or deleting old ones.
