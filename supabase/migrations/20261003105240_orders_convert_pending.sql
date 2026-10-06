-- M18 orders_convert_pending (docs/features/05-orders.md §3.1.2, AC43-AC46)
--
-- DATA ONLY. Every pending sale becomes one CONFIRMED order (same client, same lines, prices and totals copied byte
-- for byte), then the pending sale is removed. Runs as the migration owner (RLS does not apply) and uses nothing
-- from M20. One file = one transaction, so the conversion is all-or-nothing for every farm and therefore for each
-- farm. It must run BEFORE M19 drops sales.status and sales_delete_guard (this file deletes pending rows).
--
-- Order numbers continue each farm's order counter, in the order of the old sale numbers (AC45). sale_counters is
-- NOT touched: the counter only moves forward, so the retired sale numbers are never issued again. Each order keeps
-- the old number in converted_from_sale_number ("Formerly sale #N").
--
-- Idempotent: a second run finds no pending sale, converts nothing, moves no counter and asserts nothing false.
-- The partial unique index orders_tenant_converted_key is the belt to that brace. A farm with no pending sales is
-- untouched (AC46). on_hand_json is identical before and after because it never counted pending sales (AC44).

drop table if exists pg_temp._conv;
drop table if exists pg_temp._conv_expect;
drop table if exists pg_temp._conv_before;

create temp table _conv as
select s.tenant_id,
       s.id as sale_id,
       gen_random_uuid() as order_id,
       s.sale_number,
       s.client_id,
       s.sale_date,
       s.created_at,
       oc.next_number + row_number() over (partition by s.tenant_id order by s.sale_number) - 1 as order_number
from public.sales s
join public.order_counters oc on oc.tenant_id = s.tenant_id
where s.status = 'pending';

-- What each farm should have after: line count, eggs and money of its pending sales; and what must not change.
create temp table _conv_expect as
select c.tenant_id, count(sl.*) as n_lines, coalesce(sum(sl.eggs), 0) as eggs, coalesce(sum(sl.line_total), 0) as total,
       count(distinct c.sale_id) as n_orders
from _conv c
join public.sale_lines sl on sl.tenant_id = c.tenant_id and sl.sale_id = c.sale_id
group by c.tenant_id;

create temp table _conv_before as
select t.id as tenant_id,
       (select oc.next_number from public.order_counters oc where oc.tenant_id = t.id) as next_order,
       (select sc.next_number from public.sale_counters sc where sc.tenant_id = t.id) as next_sale,
       (select count(*) from public.sales s where s.tenant_id = t.id and s.status = 'complete') as n_complete,
       (select count(*) from public.sales s where s.tenant_id = t.id and s.status = 'pending') as n_pending
from public.tenants t;

insert into public.orders (id, tenant_id, order_number, client_id, order_date, wanted_by, status, converted_from_sale_number, created_at)
select c.order_id, c.tenant_id, c.order_number, c.client_id, c.sale_date, null, 'confirmed', c.sale_number, c.created_at
from _conv c
on conflict (tenant_id, converted_from_sale_number) where converted_from_sale_number is not null do nothing;

-- Lines copied exactly (no recompute: AC43, AC51). No active-client / active-size check applies: an inactive client
-- and an archived size convert as they are (AC43).
insert into public.order_lines (tenant_id, order_id, size_id, eggs, price_per_tray, line_total, dropped_eggs)
select c.tenant_id, c.order_id, sl.size_id, sl.eggs, sl.price_per_tray, sl.line_total, 0
from _conv c
join public.sale_lines sl on sl.tenant_id = c.tenant_id and sl.sale_id = c.sale_id
where exists (select 1 from public.orders o where o.tenant_id = c.tenant_id and o.id = c.order_id);

update public.order_counters oc
set next_number = oc.next_number + c.n
from (select tenant_id, count(*) as n from _conv group by tenant_id) c
where oc.tenant_id = c.tenant_id;

-- Post-conditions: any mismatch raises, which rolls the whole migration back.
do $$
declare
  v_bad record;
begin
  for v_bad in
    select e.tenant_id
    from _conv_expect e
    left join (
      select o.tenant_id, count(l.*) as n_lines, coalesce(sum(l.eggs), 0) as eggs, coalesce(sum(l.line_total), 0) as total,
             count(distinct o.id) as n_orders
      from public.orders o
      join public.order_lines l on l.tenant_id = o.tenant_id and l.order_id = o.id
      join _conv c on c.tenant_id = o.tenant_id and c.order_id = o.id
      group by o.tenant_id
    ) a on a.tenant_id = e.tenant_id
    where a.tenant_id is null or (a.n_lines, a.eggs, a.total, a.n_orders) is distinct from (e.n_lines, e.eggs, e.total, e.n_orders)
  loop
    raise exception 'orders conversion mismatch for a farm' using errcode = 'TM054';
  end loop;

  for v_bad in
    select b.tenant_id
    from _conv_before b
    join public.order_counters oc on oc.tenant_id = b.tenant_id
    left join (select tenant_id, count(*) as n from _conv group by tenant_id) c on c.tenant_id = b.tenant_id
    where oc.next_number <> b.next_order + coalesce(c.n, 0)
  loop
    raise exception 'order counter mismatch for a farm' using errcode = 'TM054';
  end loop;

  for v_bad in
    select b.tenant_id
    from _conv_before b
    join public.sale_counters sc on sc.tenant_id = b.tenant_id
    where sc.next_number <> b.next_sale
       or (select count(*) from public.sales s where s.tenant_id = b.tenant_id and s.status = 'complete') <> b.n_complete
  loop
    raise exception 'sale counter or complete sales changed for a farm' using errcode = 'TM054';
  end loop;
end
$$;

-- Remove the pending sales (their lines and sale_submissions cascade). sales_delete_guard still exists and allows
-- it because every one of these rows is pending.
delete from public.sales s
using _conv c
where s.tenant_id = c.tenant_id and s.id = c.sale_id;

do $$
begin
  if exists (select 1 from public.sales s where s.status = 'pending') then
    raise exception 'a pending sale remains after the conversion' using errcode = 'TM054';
  end if;
end
$$;

drop table _conv;
drop table _conv_expect;
drop table _conv_before;
