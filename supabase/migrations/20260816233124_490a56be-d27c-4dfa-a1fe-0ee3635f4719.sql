CREATE OR REPLACE FUNCTION public.db_storage_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_tables jsonb;
  v_total bigint;
  v_reusable bigint;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;

  select pg_database_size(current_database()) into v_total;
  select coalesce(sum(pg_total_relation_size(s.relid) *
    case when (s.n_live_tup + s.n_dead_tup) > 0
      then s.n_dead_tup::numeric / (s.n_live_tup + s.n_dead_tup)
      else 0 end), 0)::bigint
  into v_reusable
  from pg_stat_user_tables s
  where s.schemaname = 'public';

  select coalesce(jsonb_agg(t order by (t->>'bytes')::bigint desc), '[]'::jsonb) into v_tables
  from (
    select jsonb_build_object(
      'name', c.relname,
      'bytes', pg_total_relation_size(c.oid),
      'rows', coalesce(s.n_live_tup, 0),
      'dead_rows', coalesce(s.n_dead_tup, 0),
      'reusable_bytes', (pg_total_relation_size(c.oid) *
        case when (coalesce(s.n_live_tup,0) + coalesce(s.n_dead_tup,0)) > 0
          then coalesce(s.n_dead_tup,0)::numeric / (coalesce(s.n_live_tup,0) + coalesce(s.n_dead_tup,0))
          else 0 end)::bigint
    ) as t
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where n.nspname = 'public' and c.relkind = 'r'
  ) q;

  return jsonb_build_object(
    'database_bytes', v_total,
    'reusable_bytes', v_reusable,
    'storage_files', 0,
    'storage_bytes', 0,
    'tables', v_tables
  );
end;
$$;

CREATE OR REPLACE FUNCTION public.purge_filtered_history(
  p_table text,
  p_from timestamptz,
  p_to timestamptz,
  p_sku_id uuid DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_order text DEFAULT NULL,
  p_confirm text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_color_id uuid DEFAULT NULL,
  p_size_id uuid DEFAULT NULL,
  p_kit_id uuid DEFAULT NULL,
  p_platform_id uuid DEFAULT NULL,
  p_movement_id uuid DEFAULT NULL,
  p_kind text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_found integer := 0;
  v_deleted integer := 0;
  v_remaining integer := 0;
  v_before_bytes bigint := 0;
  v_after_bytes bigint := 0;
  v_table_oid regclass;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if p_confirm is distinct from 'EXCLUIR' then raise exception 'Confirmacao invalida'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Periodo invalido'; end if;
  if p_table not in ('movements','packing_reads','stock_edits','audit_logs') then raise exception 'Tipo de historico invalido'; end if;
  if p_direction is not null and p_direction not in ('in','out') then raise exception 'Direcao invalida'; end if;
  if p_kind is not null and p_kind not in ('unit','kit') then raise exception 'Tipo invalido'; end if;

  v_table_oid := to_regclass('public.' || p_table);
  v_before_bytes := pg_total_relation_size(v_table_oid);

  if p_table = 'movements' then
    select count(*) into v_found
    from movements m left join skus s on s.id=m.sku_id
    where m.user_id=v_uid and m.created_at>=p_from and m.created_at<=p_to
      and (p_movement_id is null or m.id=p_movement_id)
      and (p_sku_id is null or m.sku_id=p_sku_id)
      and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or m.color_id=p_color_id or exists (select 1 from jsonb_array_elements(m.lines) l where nullif(l->>'color_id','')::uuid=p_color_id))
      and (p_size_id is null or m.size_id=p_size_id)
      and (p_kit_id is null or m.kit_id=p_kit_id)
      and (p_platform_id is null or m.platform_id=p_platform_id)
      and (p_direction is null or m.direction::text=p_direction)
      and (p_kind is null or m.kind::text=p_kind)
      and (nullif(btrim(p_order),'') is null or m.order_ref ilike '%'||btrim(p_order)||'%');

    delete from movements m using skus s
    where s.id=m.sku_id and m.user_id=v_uid and m.created_at>=p_from and m.created_at<=p_to
      and (p_movement_id is null or m.id=p_movement_id)
      and (p_sku_id is null or m.sku_id=p_sku_id)
      and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or m.color_id=p_color_id or exists (select 1 from jsonb_array_elements(m.lines) l where nullif(l->>'color_id','')::uuid=p_color_id))
      and (p_size_id is null or m.size_id=p_size_id)
      and (p_kit_id is null or m.kit_id=p_kit_id)
      and (p_platform_id is null or m.platform_id=p_platform_id)
      and (p_direction is null or m.direction::text=p_direction)
      and (p_kind is null or m.kind::text=p_kind)
      and (nullif(btrim(p_order),'') is null or m.order_ref ilike '%'||btrim(p_order)||'%');

    select count(*) into v_remaining
    from movements m left join skus s on s.id=m.sku_id
    where m.user_id=v_uid and m.created_at>=p_from and m.created_at<=p_to
      and (p_movement_id is null or m.id=p_movement_id) and (p_sku_id is null or m.sku_id=p_sku_id)
      and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or m.color_id=p_color_id or exists (select 1 from jsonb_array_elements(m.lines) l where nullif(l->>'color_id','')::uuid=p_color_id))
      and (p_size_id is null or m.size_id=p_size_id) and (p_kit_id is null or m.kit_id=p_kit_id)
      and (p_platform_id is null or m.platform_id=p_platform_id)
      and (p_direction is null or m.direction::text=p_direction) and (p_kind is null or m.kind::text=p_kind)
      and (nullif(btrim(p_order),'') is null or m.order_ref ilike '%'||btrim(p_order)||'%');
  elsif p_table = 'stock_edits' then
    select count(*) into v_found from stock_edits e left join skus s on s.id=e.sku_id
    where e.user_id=v_uid and e.created_at>=p_from and e.created_at<=p_to
      and (p_sku_id is null or e.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or e.color_id=p_color_id) and (p_size_id is null or e.size_id=p_size_id)
      and (p_platform_id is null or e.platform_id=p_platform_id);
    delete from stock_edits e using skus s
    where s.id=e.sku_id and e.user_id=v_uid and e.created_at>=p_from and e.created_at<=p_to
      and (p_sku_id is null or e.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or e.color_id=p_color_id) and (p_size_id is null or e.size_id=p_size_id)
      and (p_platform_id is null or e.platform_id=p_platform_id);
    select count(*) into v_remaining from stock_edits e left join skus s on s.id=e.sku_id
    where e.user_id=v_uid and e.created_at>=p_from and e.created_at<=p_to
      and (p_sku_id is null or e.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or e.color_id=p_color_id) and (p_size_id is null or e.size_id=p_size_id)
      and (p_platform_id is null or e.platform_id=p_platform_id);
  elsif p_table = 'packing_reads' then
    select count(*) into v_found from packing_reads r left join movements m on m.id=r.movement_id left join skus s on s.id=m.sku_id
    where r.user_id=v_uid and r.created_at>=p_from and r.created_at<=p_to
      and (p_movement_id is null or r.movement_id=p_movement_id)
      and (p_sku_id is null or m.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or m.color_id=p_color_id) and (p_size_id is null or m.size_id=p_size_id)
      and (p_kit_id is null or m.kit_id=p_kit_id) and (p_platform_id is null or m.platform_id=p_platform_id)
      and (p_direction is null or m.direction::text=p_direction) and (p_kind is null or m.kind::text=p_kind)
      and (nullif(btrim(p_order),'') is null or r.order_ref ilike '%'||btrim(p_order)||'%');
    delete from packing_reads r where r.id in (
      select x.id from packing_reads x left join movements m on m.id=x.movement_id left join skus s on s.id=m.sku_id
      where x.user_id=v_uid and x.created_at>=p_from and x.created_at<=p_to
        and (p_movement_id is null or x.movement_id=p_movement_id)
        and (p_sku_id is null or m.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
        and (p_color_id is null or m.color_id=p_color_id) and (p_size_id is null or m.size_id=p_size_id)
        and (p_kit_id is null or m.kit_id=p_kit_id) and (p_platform_id is null or m.platform_id=p_platform_id)
        and (p_direction is null or m.direction::text=p_direction) and (p_kind is null or m.kind::text=p_kind)
        and (nullif(btrim(p_order),'') is null or x.order_ref ilike '%'||btrim(p_order)||'%'));
    select count(*) into v_remaining from packing_reads r left join movements m on m.id=r.movement_id left join skus s on s.id=m.sku_id
    where r.user_id=v_uid and r.created_at>=p_from and r.created_at<=p_to
      and (p_movement_id is null or r.movement_id=p_movement_id)
      and (p_sku_id is null or m.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or m.color_id=p_color_id) and (p_size_id is null or m.size_id=p_size_id)
      and (p_kit_id is null or m.kit_id=p_kit_id) and (p_platform_id is null or m.platform_id=p_platform_id)
      and (p_direction is null or m.direction::text=p_direction) and (p_kind is null or m.kind::text=p_kind)
      and (nullif(btrim(p_order),'') is null or r.order_ref ilike '%'||btrim(p_order)||'%');
  else
    select count(*) into v_found from audit_logs a
    where a.user_id=v_uid and a.created_at>=p_from and a.created_at<=p_to
      and (p_movement_id is null or a.entity_id=p_movement_id);
    delete from audit_logs a where a.user_id=v_uid and a.created_at>=p_from and a.created_at<=p_to
      and (p_movement_id is null or a.entity_id=p_movement_id);
    select count(*) into v_remaining from audit_logs a
    where a.user_id=v_uid and a.created_at>=p_from and a.created_at<=p_to
      and (p_movement_id is null or a.entity_id=p_movement_id);
  end if;

  v_deleted := v_found - v_remaining;
  if v_remaining <> 0 or v_deleted <> v_found then
    raise exception 'Exclusao nao confirmada: encontrados %, excluidos %, restantes %', v_found, v_deleted, v_remaining;
  end if;

  v_after_bytes := pg_total_relation_size(v_table_oid);

  return jsonb_build_object(
    'found', v_found,
    'deleted', v_deleted,
    'remaining', v_remaining,
    'files_deleted', 0,
    'files_failed', 0,
    'errors', '[]'::jsonb,
    'physical_bytes_before', v_before_bytes,
    'physical_bytes_after', v_after_bytes,
    'physical_bytes_freed', greatest(0, v_before_bytes-v_after_bytes),
    'reusable_bytes_created', greatest(0, v_before_bytes-v_after_bytes)
  );
end;
$$;

REVOKE ALL ON FUNCTION public.db_storage_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.db_storage_info() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.purge_filtered_history(text, timestamptz, timestamptz, uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_filtered_history(text, timestamptz, timestamptz, uuid, text, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;