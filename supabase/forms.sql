create extension if not exists pgcrypto;

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.form_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  key text not null,
  type text not null check (type in ('short_text', 'long_text', 'email', 'phone', 'date', 'checkboxes', 'radio', 'select', 'course_choice')),
  label text not null,
  help_text text,
  required boolean not null default false,
  sort_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (form_id, key)
);

create table if not exists public.form_options (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  field_id uuid not null references public.form_fields(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  day_time text,
  location text,
  level text,
  capacity integer,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (field_id, key)
);

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.forms(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  respondent_name text,
  respondent_email text,
  respondent_phone text,
  answers jsonb not null default '{}'::jsonb,
  selected_option_keys text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists forms_status_idx on public.forms(status);
create index if not exists form_fields_form_id_idx on public.form_fields(form_id, sort_order);
create index if not exists form_options_form_id_idx on public.form_options(form_id, sort_order);
create index if not exists form_options_field_id_idx on public.form_options(field_id, sort_order);
create index if not exists form_submissions_form_id_idx on public.form_submissions(form_id, submitted_at desc);
create index if not exists form_submissions_selected_options_idx on public.form_submissions using gin(selected_option_keys);

grant usage on schema public to anon, authenticated;

grant select on public.forms to anon;
grant select on public.form_fields to anon;
grant select on public.form_options to anon;
grant insert on public.form_submissions to anon;

grant select, insert, update, delete on public.forms to authenticated;
grant select, insert, update, delete on public.form_fields to authenticated;
grant select, insert, update, delete on public.form_options to authenticated;
grant select, insert on public.form_submissions to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_forms_updated_at on public.forms;
create trigger set_forms_updated_at
before update on public.forms
for each row execute function public.set_updated_at();

alter table public.forms enable row level security;
alter table public.form_fields enable row level security;
alter table public.form_options enable row level security;
alter table public.form_submissions enable row level security;

drop policy if exists "Authenticated users can manage forms" on public.forms;
create policy "Authenticated users can manage forms"
on public.forms
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Published forms are public" on public.forms;
create policy "Published forms are public"
on public.forms
for select
to anon
using (status = 'published');

drop policy if exists "Authenticated users can manage form fields" on public.form_fields;
create policy "Authenticated users can manage form fields"
on public.form_fields
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Published form fields are public" on public.form_fields;
create policy "Published form fields are public"
on public.form_fields
for select
to anon
using (
  exists (
    select 1
    from public.forms
    where forms.id = form_fields.form_id
      and forms.status = 'published'
  )
);

drop policy if exists "Authenticated users can manage form options" on public.form_options;
create policy "Authenticated users can manage form options"
on public.form_options
for all
to authenticated
using (true)
with check (true);

drop policy if exists "Published form options are public" on public.form_options;
create policy "Published form options are public"
on public.form_options
for select
to anon
using (
  active = true
  and exists (
    select 1
    from public.forms
    where forms.id = form_options.form_id
      and forms.status = 'published'
  )
);

drop policy if exists "Authenticated users can read submissions" on public.form_submissions;
create policy "Authenticated users can read submissions"
on public.form_submissions
for select
to authenticated
using (true);

drop policy if exists "Anyone can submit published forms" on public.form_submissions;
create policy "Anyone can submit published forms"
on public.form_submissions
for insert
to anon, authenticated
with check (
  exists (
    select 1
    from public.forms
    where forms.id = form_submissions.form_id
      and forms.status = 'published'
  )
);
