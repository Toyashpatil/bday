-- Emergency manual unlock patch
-- Run this ONCE in Supabase SQL Editor after the existing birthday schema.
-- Safe to run more than once.

alter table public.site_settings
  add column if not exists manual_unlocks jsonb not null default '{}'::jsonb;

update public.site_settings
set manual_unlocks = coalesce(manual_unlocks, '{}'::jsonb)
where id = true;

create or replace function public.get_manual_unlocks()
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select manual_unlocks from public.site_settings where id = true),
    '{}'::jsonb
  );
$$;

create or replace function public.set_manual_unlock(
  p_chapter_day smallint,
  p_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_unlocks jsonb;
  result jsonb;
  key text;
begin
  if not exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  ) then
    raise exception 'Not authorized';
  end if;

  -- 1..18 = normal chapters. 0 = October 20 finale.
  if p_chapter_day < 0 or p_chapter_day > 18 then
    raise exception 'Invalid chapter';
  end if;

  key := case when p_chapter_day = 0 then 'finale' else p_chapter_day::text end;

  select coalesce(manual_unlocks, '{}'::jsonb)
    into current_unlocks
    from public.site_settings
   where id = true;

  if p_enabled then
    result := jsonb_set(current_unlocks, array[key], 'true'::jsonb, true);
  else
    result := current_unlocks - key;
  end if;

  update public.site_settings
     set manual_unlocks = result,
         updated_at = now()
   where id = true;

  return result;
end;
$$;

revoke all on function public.get_manual_unlocks() from public;
grant execute on function public.get_manual_unlocks() to anon, authenticated;
revoke all on function public.set_manual_unlock(smallint, boolean) from public;
grant execute on function public.set_manual_unlock(smallint, boolean) to authenticated;

-- Update answer submission so a manually unlocked chapter can accept answers
-- before its normal 10:00 PM unlock time.
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

  if not (
    coalesce(
      (select test_mode_enabled from public.site_settings where id = true),
      false
    )
    or coalesce(
      ((select manual_unlocks from public.site_settings where id = true) ->> p_chapter_day::text)::boolean,
      false
    )
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
