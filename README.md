# GTA Desk — private prototype workspace

GTA Desk is intended to be a restricted-access application backed by Supabase Auth.

## Security model

GitHub Pages is a **public static host**. It cannot password-protect the HTML or JavaScript files. This repository displays a login screen and **never renders the app view until a user is authenticated and authorized** through Supabase. Any future business data must be protected server-side with Supabase Row Level Security (RLS).

The login screen is fail-closed: without a Supabase configuration, nobody can log in.

## Configuration

1. Create or select a dedicated Supabase project. Do not reuse existing business projects without deliberate approval.
2. Run `supabase_access.sql` in the Supabase SQL Editor.
3. Supabase > Authentication > Providers > Email: disable public signups. Create allowed users manually under Authentication > Users.
4. Add each approved auth user UUID to `public.gtadesk_access` using SQL Editor, as described in the SQL file.
5. Copy the Supabase Project URL and **publishable** (or legacy anon) key into `config.js`. NEVER use a secret or service_role key in browser code.
6. In GitHub repository Settings > Pages, publish from main branch / (root); set custom domain to `gtadesk.com`.
7. At the authoritative DNS provider, configure four GitHub Pages A records for apex and a `www` CNAME to `plamensve.github.io`. Do not change unrelated MX/TXT records.
8. Enable Enforce HTTPS when available and verify DNS / access.
9. Every future table used by GTA Desk requires RLS policies. UI-based hiding is not a substitute for backend authorization.

### Important: Truly private website
To hide the HTML/JS itself from unauthenticated visitors, GitHub Pages is not sufficient; host behind an access-enforcing service such as Cloudflare Pages + Access or an authenticated server instead.
