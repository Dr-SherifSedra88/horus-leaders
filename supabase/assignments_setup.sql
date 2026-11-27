-- Horus Leaders: assignments and trainee submissions
-- Run once in Supabase SQL Editor. Keeps submissions private to the trainee and staff.

alter table public.assignments
  add column if not exists max_grade numeric(6,2) not null default 100;

alter table public.submissions
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists mime_type text;

-- Enforce the deadline at the database policy level as well as in the interface.
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
      and (a.due_at is null or a.due_at >= now())
      and e.trainee_id = (select auth.uid())
  );
$$;
revoke all on function public.horus_can_submit(uuid) from public, anon;
grant execute on function public.horus_can_submit(uuid) to authenticated;

-- Trainees retain read access to published and closed assignments in their enrolled cohorts.
drop policy if exists assignments_select_accessible on public.assignments;
create policy assignments_select_accessible on public.assignments
for select to authenticated
using (
  (select public.horus_is_staff())
  or (
    status in ('published'::public.assignment_status, 'closed'::public.assignment_status)
    and (select public.horus_is_enrolled(cohort_id))
  )
);

-- Allow instructors to see names of trainees in cohorts where they created assignments.
drop policy if exists profiles_instructor_assignment_roster on public.profiles;
create policy profiles_instructor_assignment_roster
on public.profiles for select
to authenticated
using (
  (select public.horus_is_admin())
  or exists (
    select 1
    from public.enrollments e
    join public.assignments a on a.cohort_id = e.cohort_id
    where e.trainee_id = profiles.id
      and a.created_by = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'assignment-submissions',
  'assignment-submissions',
  false,
  20971520,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- File path: <assignment_uuid>/<trainee_uuid>/<unique-filename>
drop policy if exists assignment_submission_read on storage.objects;
create policy assignment_submission_read
on storage.objects for select to authenticated
using (
  bucket_id = 'assignment-submissions'
  and (
    (select public.horus_is_staff())
    or exists (
      select 1 from public.submissions s
      where s.file_path = name
        and s.trainee_id = (select auth.uid())
    )
  )
);

drop policy if exists assignment_submission_upload on storage.objects;
create policy assignment_submission_upload
on storage.objects for insert to authenticated
with check (
  bucket_id = 'assignment-submissions'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (select public.horus_can_submit(((storage.foldername(name))[1])::uuid))
    else false
  end
);

drop policy if exists assignment_submission_delete on storage.objects;
create policy assignment_submission_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'assignment-submissions'
  and (
    (select public.horus_is_staff())
    or (
      (storage.foldername(name))[2] = (select auth.uid())::text
      and case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (select public.horus_can_submit(((storage.foldername(name))[1])::uuid))
        else false
      end
    )
  )
);
