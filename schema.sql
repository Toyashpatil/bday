-- Birthday Surprise — production answer storage
-- Run this in Supabase SQL Editor.

create table if not exists public.birthday_answers (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  chapter_day smallint not null check (chapter_day between 1 and 18),
  answer text not null check (char_length(answer) between 1 and 5000),
  answered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (visitor_id, chapter_day)
);

alter table public.birthday_answers enable row level security;

-- Admin accounts are explicitly allow-listed here.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- No direct public reads/writes to answers. Answers are submitted through
-- the security-definer RPC below; only allow-listed admins can read them.
revoke all on public.birthday_answers from anon, authenticated;
revoke all on public.admin_users from anon, authenticated;

drop policy if exists "admins can read answers" on public.birthday_answers;
create policy "admins can read answers"
on public.birthday_answers
for select
to authenticated
using (
  exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  )
);

-- This function is the only public submission path.
create or replace function public.submit_birthday_answer(
  p_chapter_day smallint,
  p_answer text,
  p_visitor_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_chapter_day < 1 or p_chapter_day > 18 then
    raise exception 'Invalid chapter';
  end if;

  -- Day 18 = Oct 2, Day 1 = Oct 19. Enforce the same 10 PM
  -- Asia/Kolkata unlock rule on the server, independent of browser time.
  -- When admin-controlled Test Mode is ON, the simulated browser clock
  -- is allowed so the complete answer flow can be tested before 10 PM.
  if not coalesce(
    (select test_mode_enabled from public.site_settings where id = true),
    false
  ) then
    if now() < make_timestamptz(
      2026, 10, 2 + (18 - p_chapter_day),
      22, 0, 0, 'Asia/Kolkata'
    ) then
      raise exception 'This chapter is still sealed';
    end if;
  end if;

  if p_answer is null or char_length(trim(p_answer)) = 0 then
    raise exception 'Answer cannot be empty';
  end if;

  if char_length(p_answer) > 5000 then
    raise exception 'Answer is too long';
  end if;

  insert into public.birthday_answers (
    visitor_id, chapter_day, answer, answered_at, updated_at
  )
  values (
    p_visitor_id, p_chapter_day, trim(p_answer), now(), now()
  )
  on conflict (visitor_id, chapter_day)
  do update set
    answer = excluded.answer,
    updated_at = now();
end;
$$;

revoke all on function public.submit_birthday_answer(smallint, text, uuid) from public;
grant execute on function public.submit_birthday_answer(smallint, text, uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- AFTER you create your admin user in Supabase Authentication,
-- replace the email below and run this once:
-- ------------------------------------------------------------
-- insert into public.admin_users (user_id)
-- select id from auth.users where email = 'YOUR_EMAIL@example.com'
-- on conflict (user_id) do nothing;

-- ------------------------------------------------------------
-- Private admin-controlled test mode
-- The public site can read the boolean through get_test_mode(),
-- but only an allow-listed admin can change it.
-- ------------------------------------------------------------
create table if not exists public.site_settings (
  id boolean primary key default true,
  test_mode_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, test_mode_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;
revoke all on public.site_settings from anon, authenticated;

create or replace function public.get_test_mode()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select test_mode_enabled from public.site_settings where id = true), false);
$$;

create or replace function public.set_test_mode(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  update public.site_settings
  set test_mode_enabled = p_enabled,
      updated_at = now()
  where id = true;

  return p_enabled;
end;
$$;

revoke all on function public.get_test_mode() from public;
grant execute on function public.get_test_mode() to anon, authenticated;
revoke all on function public.set_test_mode(boolean) from public;
grant execute on function public.set_test_mode(boolean) to authenticated;
