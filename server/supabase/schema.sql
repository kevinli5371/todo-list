-- App tables for Supabase Postgres. Auth users live in auth.users (managed by Supabase Auth).
-- Run in SQL Editor after enabling Supabase Auth.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email varchar(320) not null default '',
  invite_code varchar(32) not null unique,
  partner_id uuid references public.profiles (id)
);

create index if not exists ix_profiles_email on public.profiles (email);
create index if not exists ix_profiles_invite_code on public.profiles (invite_code);

create table if not exists public.todos (
  id varchar(36) primary key,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  text text not null default '',
  x double precision not null default 0,
  y double precision not null default 0,
  completed boolean not null default false,
  due_date text,
  repeat varchar(64),
  timestamp text not null
);

create index if not exists ix_todos_owner_id on public.todos (owner_id);
