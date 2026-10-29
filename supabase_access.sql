-- Execute in the selected Supabase project after creating it.
-- No self-registration is exposed in the GTA Desk web application.
-- IMPORTANT: Disable public sign-ups in Supabase Auth settings as well.
create table if not exists public.gtadesk_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.gtadesk_access enable row level security;
revoke all on public.gtadesk_access from anon;
grant select on public.gtadesk_access to authenticated;
drop policy if exists "Users can read their own GTA Desk access" on public.gtadesk_access;
create policy "Users can read their own GTA Desk access"
on public.gtadesk_access for select to authenticated
using ((select auth.uid()) = user_id);

-- After an admin has CREATED an invited user in Authentication > Users,
-- approve only that user's UUID using the SQL editor (replace placeholder):
-- insert into public.gtadesk_access (user_id)
-- values ('REPLACE_WITH_APPROVED_AUTH_USER_UUID')
-- on conflict (user_id) do nothing;
-- No INSERT/UPDATE/DELETE privileges are granted to browser users.
