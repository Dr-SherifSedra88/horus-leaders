-- Horus Leaders: least-privilege Row Level Security policies
-- Run AFTER schema.sql in Supabase SQL Editor.
-- New accounts remain trainees; role changes are performed only by a trusted owner in SQL Editor.

create or replace function public.horus_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('admin'::public.app_role, 'instructor'::public.app_role)
  );
$$;

create or replace function public.horus_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.app_role
  );
$$;

create or replace function public.horus_is_enrolled(_cohort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    where e.cohort_id = _cohort_id
      and e.trainee_id = (select auth.uid())
  );
$$;

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
      and e.trainee_id = (select auth.uid())
  );
$$;

revoke all on function public.horus_is_staff() from public, anon;
revoke all on function public.horus_is_admin() from public, anon;
revoke all on function public.horus_is_enrolled(uuid) from public, anon;
revoke all on function public.horus_can_submit(uuid) from public, anon;
grant execute on function public.horus_is_staff() to authenticated;
grant execute on function public.horus_is_admin() to authenticated;
grant execute on function public.horus_is_enrolled(uuid) to authenticated;
grant execute on function public.horus_can_submit(uuid) to authenticated;

-- Explicit API grants. RLS policies below decide which rows can actually be accessed.
revoke all on table public.cohorts, public.enrollments, public.library_items,
  public.assignments, public.submissions, public.sessions, public.attendance
  from anon;
grant select, insert, update, delete on table public.cohorts, public.enrollments,
  public.library_items, public.assignments, public.submissions, public.sessions,
  public.attendance to authenticated;
grant select on table public.profiles to authenticated;

-- Profiles: users see their own profile; staff can view profiles for administration.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_self_or_staff on public.profiles;
create policy profiles_select_self_or_staff on public.profiles
for select to authenticated
using (id = (select auth.uid()) or (select public.horus_is_staff()));

-- Preserve the schema.sql column-limited UPDATE grant: role cannot be changed through the API.

-- Cohorts: staff manage cohorts; trainees see only cohorts they are enrolled in.
drop policy if exists cohorts_select_accessible on public.cohorts;
drop policy if exists cohorts_staff_insert on public.cohorts;
drop policy if exists cohorts_staff_update on public.cohorts;
drop policy if exists cohorts_staff_delete on public.cohorts;
create policy cohorts_select_accessible on public.cohorts
for select to authenticated
using ((select public.horus_is_staff()) or (select public.horus_is_enrolled(id)));
create policy cohorts_staff_insert on public.cohorts
for insert to authenticated with check ((select public.horus_is_staff()));
create policy cohorts_staff_update on public.cohorts
for update to authenticated using ((select public.horus_is_staff()))
with check ((select public.horus_is_staff()));
create policy cohorts_staff_delete on public.cohorts
for delete to authenticated using ((select public.horus_is_staff()));

-- Enrollments: trainees can see their own enrollment; only staff can manage enrollments.
drop policy if exists enrollments_select_accessible on public.enrollments;
drop policy if exists enrollments_staff_insert on public.enrollments;
drop policy if exists enrollments_staff_update on public.enrollments;
drop policy if exists enrollments_staff_delete on public.enrollments;
create policy enrollments_select_accessible on public.enrollments
for select to authenticated
using (trainee_id = (select auth.uid()) or (select public.horus_is_staff()));
create policy enrollments_staff_insert on public.enrollments
for insert to authenticated with check ((select public.horus_is_staff()));
create policy enrollments_staff_update on public.enrollments
for update to authenticated using ((select public.horus_is_staff()))
with check ((select public.horus_is_staff()));
create policy enrollments_staff_delete on public.enrollments
for delete to authenticated using ((select public.horus_is_staff()));

-- Library: published core materials are shared; cohort materials require enrollment.
drop policy if exists library_items_select_accessible on public.library_items;
drop policy if exists library_items_staff_insert on public.library_items;
drop policy if exists library_items_staff_update on public.library_items;
drop policy if exists library_items_staff_delete on public.library_items;
create policy library_items_select_accessible on public.library_items
for select to authenticated
using (
  (select public.horus_is_staff())
  or (
    published = true
    and (
      is_core = true
      or (cohort_id is not null and (select public.horus_is_enrolled(cohort_id)))
    )
  )
);
create policy library_items_staff_insert on public.library_items
for insert to authenticated with check ((select public.horus_is_staff()));
create policy library_items_staff_update on public.library_items
for update to authenticated using ((select public.horus_is_staff()))
with check ((select public.horus_is_staff()));
create policy library_items_staff_delete on public.library_items
for delete to authenticated using ((select public.horus_is_staff()));

-- Assignments: trainees see published assignments for their enrolled cohort.
drop policy if exists assignments_select_accessible on public.assignments;
drop policy if exists assignments_staff_insert on public.assignments;
drop policy if exists assignments_staff_update on public.assignments;
drop policy if exists assignments_staff_delete on public.assignments;
create policy assignments_select_accessible on public.assignments
for select to authenticated
using (
  (select public.horus_is_staff())
  or (
    status = 'published'::public.assignment_status
    and (select public.horus_is_enrolled(cohort_id))
  )
);
create policy assignments_staff_insert on public.assignments
for insert to authenticated with check ((select public.horus_is_staff()));
create policy assignments_staff_update on public.assignments
for update to authenticated using ((select public.horus_is_staff()))
with check ((select public.horus_is_staff()));
create policy assignments_staff_delete on public.assignments
for delete to authenticated using ((select public.horus_is_staff()));

-- Submissions: trainees can create/read/update only their own work.
-- A trigger below prevents trainees from changing grades or feedback.
drop policy if exists submissions_select_accessible on public.submissions;
drop policy if exists submissions_trainee_insert on public.submissions;
drop policy if exists submissions_trainee_update on public.submissions;
drop policy if exists submissions_staff_update on public.submissions;
drop policy if exists submissions_staff_delete on public.submissions;
create policy submissions_select_accessible on public.submissions
for select to authenticated
using (trainee_id = (select auth.uid()) or (select public.horus_is_staff()));
create policy submissions_trainee_insert on public.submissions
for insert to authenticated
with check (
  trainee_id = (select auth.uid())
  and (select public.horus_can_submit(assignment_id))
);
create policy submissions_trainee_update on public.submissions
for update to authenticated
using (trainee_id = (select auth.uid()))
with check (trainee_id = (select auth.uid()));
create policy submissions_staff_update on public.submissions
for update to authenticated
using ((select public.horus_is_staff()))
with check ((select public.horus_is_staff()));
create policy submissions_staff_delete on public.submissions
for delete to authenticated using ((select public.horus_is_staff()));

create or replace function public.horus_protect_submission_grading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.horus_is_staff()) then
    if tg_op = 'INSERT' then
      if new.grade is not null or new.feedback is not null or new.graded_by is not null then
        raise exception 'Trainees cannot set grades or feedback';
      end if;
      if new.trainee_id <> (select auth.uid()) then
        raise exception 'Trainees can submit only their own work';
      end if;
    else
      if new.assignment_id is distinct from old.assignment_id
        or new.trainee_id is distinct from old.trainee_id
        or new.grade is distinct from old.grade
        or new.feedback is distinct from old.feedback
        or new.graded_by is distinct from old.graded_by then
        raise exception 'Trainees cannot change submission ownership, grades, or feedback';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_submission_grading on public.submissions;
create trigger protect_submission_grading
before insert or update on public.submissions
for each row execute procedure public.horus_protect_submission_grading();

-- Sessions: trainees see sessions in cohorts where they are enrolled.
drop policy if exists sessions_select_accessible on public.sessions;
drop policy if exists sessions_staff_insert on public.sessions;
drop policy if exists sessions_staff_update on public.sessions;
drop policy if exists sessions_staff_delete on public.sessions;
create policy sessions_select_accessible on public.sessions
for select to authenticated
using ((select public.horus_is_staff()) or (select public.horus_is_enrolled(cohort_id)));
create policy sessions_staff_insert on public.sessions
for insert to authenticated with check ((select public.horus_is_staff()));
create policy sessions_staff_update on public.sessions
for update to authenticated using ((select public.horus_is_staff()))
with check ((select public.horus_is_staff()));
create policy sessions_staff_delete on public.sessions
for delete to authenticated using ((select public.horus_is_staff()));

-- Attendance: trainees see only their own attendance; staff can record and manage it.
drop policy if exists attendance_select_accessible on public.attendance;
drop policy if exists attendance_staff_insert on public.attendance;
drop policy if exists attendance_staff_update on public.attendance;
drop policy if exists attendance_staff_delete on public.attendance;
create policy attendance_select_accessible on public.attendance
for select to authenticated
using (trainee_id = (select auth.uid()) or (select public.horus_is_staff()));
create policy attendance_staff_insert on public.attendance
for insert to authenticated with check ((select public.horus_is_staff()));
create policy attendance_staff_update on public.attendance
for update to authenticated using ((select public.horus_is_staff()))
with check ((select public.horus_is_staff()));
create policy attendance_staff_delete on public.attendance
for delete to authenticated using ((select public.horus_is_staff()));

-- Do not expose helper functions to anonymous visitors.
revoke all on function public.horus_protect_submission_grading() from public, anon;
