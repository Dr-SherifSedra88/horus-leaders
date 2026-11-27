-- Horus Leaders: metadata records for files attached to sessions
-- Run after session_attachments_storage.sql.

create table if not exists public.session_attachments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  file_path text not null unique,
  file_name text not null,
  mime_type text,
  file_size bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists session_attachments_session_id_idx
  on public.session_attachments(session_id);

alter table public.session_attachments enable row level security;

grant select, insert, delete on public.session_attachments to authenticated;

drop policy if exists "session_attachment_metadata_read" on public.session_attachments;
create policy "session_attachment_metadata_read"
on public.session_attachments for select
to authenticated
using (
  (select public.horus_is_staff())
  or exists (
    select 1
    from public.sessions s
    join public.enrollments e on e.cohort_id = s.cohort_id
    where s.id = session_attachments.session_id
      and e.trainee_id = (select auth.uid())
  )
);

drop policy if exists "session_attachment_metadata_staff_insert" on public.session_attachments;
create policy "session_attachment_metadata_staff_insert"
on public.session_attachments for insert
to authenticated
with check (
  (select public.horus_is_staff())
  and uploaded_by = (select auth.uid())
  and exists (
    select 1 from public.sessions s
    where s.id = session_attachments.session_id
  )
);

drop policy if exists "session_attachment_metadata_staff_delete" on public.session_attachments;
create policy "session_attachment_metadata_staff_delete"
on public.session_attachments for delete
to authenticated
using ((select public.horus_is_staff()));
