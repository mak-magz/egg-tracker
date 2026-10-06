-- Feature 06 (Inventory screen), M21. Read-only: two functions + one public wrapper. No table, column, index or policy.
-- docs/features/06-inventory.md §3.1.

-- Eggs still owed on OPEN orders, per size. Same "remaining" rule as app.order_json (ordered minus non-voided delivered,
-- floored at 0; cancelled, fulfilled and closed-short orders owe nothing), set-based for all orders at once.
-- A pgTAP parity test (100_inventory) keeps it in step with order_json.
create or replace function app.owed_by_size(p_tenant_id uuid)
  returns table (size_id uuid, eggs bigint)
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with open_lines as (
    select l.order_id, l.size_id, l.eggs
    from public.orders o
    join public.order_lines l on l.tenant_id = o.tenant_id and l.order_id = o.id
    where o.tenant_id = p_tenant_id
      and o.status in ('requested', 'confirmed', 'ready', 'partially_fulfilled')
      and o.closed_short_at is null and o.cancelled_at is null
  ), delivered as (
    select s.order_id, sl.size_id, sum(sl.eggs) as eggs
    from public.sales s
    join public.sale_lines sl on sl.tenant_id = s.tenant_id and sl.sale_id = s.id
    where s.tenant_id = p_tenant_id and s.order_id is not null and s.voided_at is null
    group by s.order_id, sl.size_id
  )
  select ol.size_id, sum(greatest(ol.eggs - coalesce(d.eggs, 0), 0))::bigint
  from open_lines ol
  left join delivered d on d.order_id = ol.order_id and d.size_id = ol.size_id
  group by ol.size_id
$$;

comment on function app.owed_by_size(uuid) is
  'Feature 06: eggs still owed on open orders, per size (ordered minus non-voided delivered). Information only; never subtracted from on hand.';

-- The whole Inventory payload: { hasAny, sizes: [{ id, name, sortOrder, colorSlot, active, onHandEggs, owedEggs }] }.
-- On hand comes from app.on_hand_json (the one calculation) and may be negative. Archived sizes appear only while
-- they still have eggs on hand or owed.
create or replace function app.inventory_json(p_tenant_id uuid)
  returns jsonb
  language sql
  stable
  security invoker
  set search_path = ''
as $$
  with on_hand as (
    select (e ->> 'sizeId')::uuid as size_id, (e ->> 'eggs')::bigint as eggs
    from jsonb_array_elements(app.on_hand_json(p_tenant_id, null) -> 'onHand') e
  ), owed as (
    select * from app.owed_by_size(p_tenant_id)
  ), rows as (
    select z.id, z.name, z.sort_order, z.color_slot, z.archived_at,
           coalesce(h.eggs, 0) as on_hand, coalesce(w.eggs, 0) as owed
    from public.sizes z
    left join on_hand h on h.size_id = z.id
    left join owed w on w.size_id = z.id
    where z.tenant_id = p_tenant_id
  )
  select jsonb_build_object(
    'hasAny', exists (select 1 from public.production p where p.tenant_id = p_tenant_id and p.quality = 'good')
           or exists (select 1 from public.sale_lines sl join public.sales s
                        on s.tenant_id = sl.tenant_id and s.id = sl.sale_id
                      where sl.tenant_id = p_tenant_id and s.voided_at is null),
    'sizes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'name', r.name, 'sortOrder', r.sort_order, 'colorSlot', r.color_slot,
               'active', r.archived_at is null, 'onHandEggs', r.on_hand, 'owedEggs', r.owed)
             order by (r.archived_at is not null), r.sort_order, r.name, r.id)
      from rows r
      where r.archived_at is null or r.on_hand <> 0 or r.owed > 0
    ), '[]'::jsonb)
  )
$$;

comment on function app.inventory_json(uuid) is
  'Feature 06: the Inventory screen payload. Calls app.on_hand_json (never a second copy of the formula) and app.owed_by_size.';

create or replace function public.get_inventory(p_tenant_id uuid)
  returns jsonb
  language plpgsql
  stable
  security invoker
  set search_path = ''
as $$
begin
  perform app.assert_tenant(p_tenant_id);
  return app.inventory_json(p_tenant_id);
end
$$;

comment on function public.get_inventory(uuid) is
  'Feature 06: GET /api/inventory. Raises TM006 on a tenant mismatch (assert_tenant); nothing else.';

revoke all on function app.owed_by_size(uuid) from public;
revoke all on function app.inventory_json(uuid) from public;
grant execute on function app.owed_by_size(uuid) to authenticated;
grant execute on function app.inventory_json(uuid) to authenticated;
revoke execute on function public.get_inventory(uuid) from public, anon;
grant execute on function public.get_inventory(uuid) to authenticated;
