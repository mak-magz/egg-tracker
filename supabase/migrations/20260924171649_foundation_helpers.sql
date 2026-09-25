-- M1 foundation_helpers (docs/features/00-project-scaffold.md §3.2)
-- Private `app` schema for helpers. It is NOT listed in [api].schemas, so PostgREST never exposes it.

create schema if not exists app;

revoke all on schema app from public;
grant usage on schema app to authenticated;

-- Shared `updated_at` trigger. Every table gets:
--   create trigger set_updated_at before update on public.<t>
--     for each row execute function app.set_updated_at();
create function app.set_updated_at()
  returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

comment on function app.set_updated_at() is 'Trigger: stamps updated_at on every UPDATE. Attach to every table.';
