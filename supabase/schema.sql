-- Horus Leaders: initial database schema (run in Supabase SQL Editor)
-- Auth is email/password. Public signup should be enabled in Supabase Auth.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin','instructor','trainee');
create type public.cohort_status as enum ('planned','active','archived');
create type public.assignment_status as enum ('draft','published','closed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'trainee',
  phone text,
  created_at timestamptz not null default now()
);

create table public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year integer not null,
  status public.cohort_status not null default 'planned',
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  trainee_id uuid not null references public.profiles(id) on delete restrict,
  enrolled_at timestamptz not null default now(),
  unique(cohort_id, trainee_id)
);

create table public.library_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  item_type text not null default 'file',
  file_path text,
  external_url text,
  is_core boolean not null default true,
  cohort_id uuid references public.cohorts(id) on delete set null,
  sort_order integer not null default 0,
  published boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  title text not null,
  instructions text,
  due_at timestamptz,
  status public.assignment_status not null default 'draft',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete restrict,
  file_path text,
  answer_text text,
  submitted_at timestamptz not null default now(),
  grade numeric(6,2),
  feedback text,
  graded_by uuid references public.profiles(id) on delete set null,
  unique(assignment_id, trainee_id)
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts(id) on delete restrict,
  title text not null,
  starts_at timestamptz not null,
  location_or_link text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  trainee_id uuid not null references public.profiles(id) on delete restrict,
  status text not null check (status in ('present','absent','excused','late')),
  note text,
  recorded_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now(),
  unique(session_id, trainee_id)
);

-- Create a profile automatically after email signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- RLS is enabled now; detailed role policies will be added before production launch.
alter table public.profiles enable row level security;
alter table public.cohorts enable row level security;
alter table public.enrollments enable row level security;
alter table public.library_items enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.sessions enable row level security;
alter table public.attendance enable row level security;

-- Safe starter policies: users can read/update their own profile only.
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
