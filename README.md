# Old Testament Tracker

A small web app for tracking an Old Testament reading plan from May 25, 2026 through December 31, 2026.

## Run

```bash
npm run serve
```

Open the printed local URL in a browser.

## Test

```bash
npm test
```

## Cloud Sync

The app requires sign-in and stores reading progress in Supabase project `zufsnuxulmontwosvzog`.

The database schema and row-level security policies live in [supabase/schema.sql](supabase/schema.sql). To recreate the database table in another project:

```bash
supabase db query --linked --file supabase/schema.sql
```

The hosted app URL is already configured as an allowed Auth redirect URL:

```text
https://brendan-dewberry.github.io/old-testament-tracker/
```

Only the anon key belongs in the browser. Do not put a service-role key in this project.

Progress is stored per authenticated user and plan. The `completed_chapter_ids` JSONB column stores chapter IDs such as `Genesis 26`, and `completed_day_ids` is kept as a derived list for fully completed assigned days.
