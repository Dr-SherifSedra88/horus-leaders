-- Horus Leaders attendance workflow: trainee self check-in + leader approval
-- Run once in Supabase SQL Editor after the existing migrations.

alter table public.attendance
  drop constraint if exists attendance_status_check;

alter table public.attendance
  add constraint attendance_status_check
  check (status in ('present','absent','excused','late','pending_checkin','pending_excuse'));

alter table public.attendance
  add column if not exists checkin_at timestamptz,
  add column if not exists arrival_at timestamptz,
  add column if not exists late_minutes integer not null default 0,
  add column if not exists excuse_reason text,
  add column if not exists excuse_emergency boolean not null default false,
  add column if not exists excuse_status text not null default 'none',
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists updated_by uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists source text not null default 'manual';

alter table public.attendance
  drop constraint if exists attendance_excuse_status_check;
alter table public.attendance
  add constraint attendance_excuse_status_check
  check (excuse_status in ('none','pending','approved','rejected'));

alter table public.attendance
  drop constraint if exists attendance_late_minutes_check;
alter table public.attendance
  add constraint attendance_late_minutes_check check (late_minutes >= 0);

-- A trainee can submit one server-timestamped arrival request after the session starts.
create or replace function public.horus_submit_checkin(_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cohort uuid;
  v_starts_at timestamptz;
  v_id uuid;
  v_now timestamptz := now();
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;

  select s.cohort_id, s.starts_at into v_cohort, v_starts_at
  from public.sessions s where s.id = _session_id;
  if not found then raise exception 'اللقاء غير موجود'; end if;
  if v_now < v_starts_at then raise exception 'تسجيل الوصول متاح من موعد بداية اللقاء'; end if;
  if not exists (select 1 from public.enrollments e where e.cohort_id = v_cohort and e.trainee_id = v_user) then
    raise exception 'هذا اللقاء غير مرتبط بحسابك';
  end if;

  insert into public.attendance
    (session_id, trainee_id, status, recorded_by, recorded_at, checkin_at, arrival_at, source, excuse_status)
  values
    (_session_id, v_user, 'pending_checkin', v_user, v_now, v_now, v_now, 'self', 'none')
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'تم تسجيل حالة لهذا اللقاء بالفعل، ولا يمكن تكرار التسجيل';
end;
$$;

-- A reason is optional. Without one, the record is an unexcused absence.
-- After the session starts, only an emergency report is accepted.
create or replace function public.horus_submit_absence(_session_id uuid, _reason text default null, _emergency boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cohort uuid;
  v_starts_at timestamptz;
  v_reason text := nullif(btrim(coalesce(_reason, '')), '');
  v_status text;
  v_excuse_status text;
  v_id uuid;
  v_now timestamptz := now();
begin
  if v_user is null then raise exception 'يجب تسجيل الدخول أولاً'; end if;

  select s.cohort_id, s.starts_at into v_cohort, v_starts_at
  from public.sessions s where s.id = _session_id;
  if not found then raise exception 'اللقاء غير موجود'; end if;
  if not exists (select 1 from public.enrollments e where e.cohort_id = v_cohort and e.trainee_id = v_user) then
    raise exception 'هذا اللقاء غير مرتبط بحسابك';
  end if;
  if v_now >= v_starts_at and not coalesce(_emergency, false) then
    raise exception 'بعد بداية اللقاء، لا يمكن تقديم بلاغ إلا في حالة طارئة';
  end if;

  if v_reason is null and not coalesce(_emergency, false) then
    v_status := 'absent';
    v_excuse_status := 'none';
  else
    -- Any emergency report after the session starts must be reviewed,
    -- even when the trainee leaves the reason field blank.
    v_status := 'pending_excuse';
    v_excuse_status := 'pending';
  end if;

  insert into public.attendance
    (session_id, trainee_id, status, note, excuse_reason, excuse_emergency, excuse_status,
     recorded_by, recorded_at, source)
  values
    (_session_id, v_user, v_status, v_reason, v_reason, coalesce(_emergency, false), v_excuse_status,
     v_user, v_now, 'self')
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'تم تسجيل حالة لهذا اللقاء بالفعل، ولا يمكن تكرار التسجيل';
end;
$$;

revoke all on function public.horus_submit_checkin(uuid) from public, anon;
revoke all on function public.horus_submit_absence(uuid, text, boolean) from public, anon;
grant execute on function public.horus_submit_checkin(uuid) to authenticated;
grant execute on function public.horus_submit_absence(uuid, text, boolean) to authenticated;

-- Trainees cannot write attendance rows directly; only the two validated RPCs above.
drop policy if exists attendance_trainee_insert_self on public.attendance;
drop policy if exists attendance_trainee_update_self on public.attendance;
revoke insert, update, delete on table public.attendance from authenticated;
grant select, insert, update, delete on table public.attendance to authenticated;
