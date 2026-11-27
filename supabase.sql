-- babyknitter：在 Supabase 的 SQL Editor 里整段运行一次（和 itinera、deadline 清单用同一个项目）

-- 1. 作品和进度
create table if not exists public.babyknitter_boards (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.babyknitter_history (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.babyknitter_boards enable row level security;
alter table public.babyknitter_history enable row level security;

grant select, insert, update on public.babyknitter_boards to authenticated;
grant select, insert on public.babyknitter_history to authenticated;

drop policy if exists "own bk select" on public.babyknitter_boards;
drop policy if exists "own bk insert" on public.babyknitter_boards;
drop policy if exists "own bk update" on public.babyknitter_boards;
drop policy if exists "own bk history select" on public.babyknitter_history;
drop policy if exists "own bk history insert" on public.babyknitter_history;

create policy "own bk select" on public.babyknitter_boards for select to authenticated using (auth.uid() = user_id);
create policy "own bk insert" on public.babyknitter_boards for insert to authenticated with check (auth.uid() = user_id);
create policy "own bk update" on public.babyknitter_boards for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own bk history select" on public.babyknitter_history for select to authenticated using (auth.uid() = user_id);
create policy "own bk history insert" on public.babyknitter_history for insert to authenticated with check (auth.uid() = user_id);

-- 自动存历史版本：每 10 分钟最多一份，每人保留最近 100 份（万一同步出错能找回）
create or replace function public.snapshot_babyknitter() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from babyknitter_history
    where user_id = old.user_id and created_at > now() - interval '10 minutes'
  ) then
    insert into babyknitter_history (user_id, data) values (old.user_id, old.data);
    delete from babyknitter_history
    where user_id = old.user_id
      and id not in (select id from babyknitter_history where user_id = old.user_id order by id desc limit 100);
  end if;
  return new;
end $$;

drop trigger if exists babyknitter_snapshot on public.babyknitter_boards;
create trigger babyknitter_snapshot before update on public.babyknitter_boards
for each row execute function public.snapshot_babyknitter();

-- 2. 图解截图：私有存储桶，每个人只能读写自己文件夹（文件夹名 = 用户 id）
insert into storage.buckets (id, name, public)
values ('babyknitter', 'babyknitter', false)
on conflict (id) do nothing;

drop policy if exists "bk img select" on storage.objects;
drop policy if exists "bk img insert" on storage.objects;
drop policy if exists "bk img update" on storage.objects;
drop policy if exists "bk img delete" on storage.objects;

create policy "bk img select" on storage.objects for select to authenticated
  using (bucket_id = 'babyknitter' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bk img insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'babyknitter' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bk img update" on storage.objects for update to authenticated
  using (bucket_id = 'babyknitter' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "bk img delete" on storage.objects for delete to authenticated
  using (bucket_id = 'babyknitter' and (storage.foldername(name))[1] = auth.uid()::text);
