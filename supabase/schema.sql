create table if not exists public.old_testament_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null default 'old-testament-2026',
  completed_day_ids jsonb not null default '[]'::jsonb,
  translation text not null default 'ESV',
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_id),
  constraint old_testament_progress_completed_day_ids_array
    check (jsonb_typeof(completed_day_ids) = 'array')
);

alter table public.old_testament_progress enable row level security;

drop policy if exists "Users can read their own Old Testament progress."
  on public.old_testament_progress;

create policy "Users can read their own Old Testament progress."
  on public.old_testament_progress
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Old Testament progress."
  on public.old_testament_progress;

create policy "Users can create their own Old Testament progress."
  on public.old_testament_progress
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Old Testament progress."
  on public.old_testament_progress;

create policy "Users can update their own Old Testament progress."
  on public.old_testament_progress
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own Old Testament progress."
  on public.old_testament_progress;

create policy "Users can delete their own Old Testament progress."
  on public.old_testament_progress
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);
