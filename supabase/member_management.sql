-- Horus Leaders: trainee directory and admin-only enrollment
-- Run this once in Supabase SQL Editor after schema.sql and policies.sql.

alter table public.profiles
  add column if not exists email text;

-- Backfill email addresses for accounts that already exist.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is distinct from u.email;

-- Keep the profile email in sync whenever a new account is registered.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email
  );
  return new;
end;
$$;

-- Only the account owner and admins can read profile records.
-- Instructors do not need access to the full account directory.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_select_self_or_staff on public.profiles;
drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select public.horus_is_admin())
);

-- Cohort membership is an administrative task, not an instructor task.
drop policy if exists enrollments_staff_insert on public.enrollments;
drop policy if exists enrollments_staff_update on public.enrollments;
drop policy if exists enrollments_staff_delete on public.enrollments;

create policy enrollments_admin_insert on public.enrollments
for insert to authenticated
with check ((select public.horus_is_admin()));

create policy enrollments_admin_update on public.enrollments
for update to authenticated
using ((select public.horus_is_admin()))
with check ((select public.horus_is_admin()));

create policy enrollments_admin_delete on public.enrollments
for delete to authenticated
using ((select public.horus_is_admin()));

create index if not exists profiles_email_lower_idx
on public.profiles (lower(email));
