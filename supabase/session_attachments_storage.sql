-- Horus Leaders: private storage for session attachments
-- Run in Supabase SQL Editor AFTER schema.sql and policies.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-attachments',
  'session-attachments',
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
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- File path convention: <cohort_uuid>/<session_uuid>/<unique-filename>
drop policy if exists "session_attachments_read_accessible" on storage.objects;
create policy "session_attachments_read_accessible"
on storage.objects for select
to authenticated
using (
  bucket_id = 'session-attachments'
  and (
    (select public.horus_is_staff())
    or (
      case
        when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (select public.horus_is_enrolled(((storage.foldername(name))[1])::uuid))
        else false
      end
    )
  )
);

drop policy if exists "session_attachments_staff_upload" on storage.objects;
create policy "session_attachments_staff_upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'session-attachments'
  and (select public.horus_is_staff())
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (storage.foldername(name))[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
);

drop policy if exists "session_attachments_staff_update" on storage.objects;
create policy "session_attachments_staff_update"
on storage.objects for update
to authenticated
using (bucket_id = 'session-attachments' and (select public.horus_is_staff()))
with check (bucket_id = 'session-attachments' and (select public.horus_is_staff()));

drop policy if exists "session_attachments_staff_delete" on storage.objects;
create policy "session_attachments_staff_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'session-attachments' and (select public.horus_is_staff()));
