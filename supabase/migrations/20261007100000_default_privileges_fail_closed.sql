-- Fail closed: objects created from now on in `public` by the migration role get NO automatic grants to the API roles.
-- Supabase's default ACLs hand every new table/sequence/function to anon and authenticated; a migration that forgot
-- its explicit revoke/grant would leave a table open to the API. Existing objects keep their ACLs untouched; new
-- ones must be granted explicitly (as every migration here already does). service_role keeps its defaults.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, public;
