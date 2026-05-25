# Old Testament Tracker

A small local web app for tracking an Old Testament reading plan from May 25, 2026 through December 31, 2026.

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

The app runs without cloud sync and saves progress in the browser. To enable cross-device sync:

1. Create a Supabase project.
2. Run [supabase/schema.sql](supabase/schema.sql) in the Supabase SQL editor.
3. Add the GitHub Pages URL to Supabase Auth redirect URLs.
4. Put the project URL and anon key in [src/supabase-config.js](src/supabase-config.js).

Only the anon key belongs in the browser. Do not put a service-role key in this project.
