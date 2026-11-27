# Horus Leaders — MVP starter

Mobile-first Arabic RTL PWA for **مجموعة حورس البحرية – قطاع إعداد قادة**.

## Current state
- Responsive Arabic RTL shell and navigation.
- Temporary navy/gold identity; replaceable when the official logo/motto arrive.
- PWA manifest and installable app configuration.
- Login screen UI and Supabase email/password client placeholder.
- Initial Supabase schema for profiles, annual cohorts, enrollments, shared library, assignments/submissions, sessions and attendance.

## Run locally
1. Install Node.js 20+.
2. `npm install`
3. `npm run dev`

## Connect Supabase
1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Run `supabase/schema.sql` in the Supabase SQL Editor.
4. In Supabase Auth, enable Email + Password. Keep email confirmation settings appropriate for the pilot.

## Important before real users
This is a starter, not a production-ready LMS yet. Before inviting trainees, implement complete Row Level Security policies for every table, role assignment restricted to admins, secure storage bucket policies, password reset, profile onboarding, and test with dummy accounts. Do not expose the Supabase service-role key in the frontend. Do not add real minors' personal data until privacy/guardian-consent procedures are agreed.

## Free-tier note
Supabase and Vercel have free tiers with quotas and changing limits. The project is designed to start at $0, but storage, bandwidth, email delivery and usage beyond free quotas may require a paid plan. Prefer video links rather than uploading large video files.
