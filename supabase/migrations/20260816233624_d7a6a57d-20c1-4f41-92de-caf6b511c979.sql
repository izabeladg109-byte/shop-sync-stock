CREATE OR REPLACE FUNCTION public.preview_filtered_history(
  p_table text,
  p_from timestamptz,
  p_to timestamptz,
  p_sku_id uuid DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_order text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_color_id uuid DEFAULT NULL,
  p_size_id uuid DEFAULT NULL,
  p_kit_id uuid DEFAULT NULL,
  p_platform_id uuid DEFAULT NULL,
  p_movement_id uuid DEFAULT NULL,
  p_kind text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Periodo invalido'; end if;
  if p_table not in ('movements','packing_reads','stock_edits','audit_logs') then raise exception 'Tipo de historico invalido'; end if;

  if p_table = 'movements' then
    select count(*) into v_count from movements m left join skus s on s.id=m.sku_id
    where m.user_id=v_uid and m.created_at>=p_from and m.created_at<=p_to
      and (p_movement_id is null or m.id=p_movement_id) and (p_sku_id is null or m.sku_id=p_sku_id)
      and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or m.color_id=p_color_id or exists (select 1 from jsonb_array_elements(m.lines) l where nullif(l->>'color_id','')::uuid=p_color_id))
      and (p_size_id is null or m.size_id=p_size_id) and (p_kit_id is null or m.kit_id=p_kit_id)
      and (p_platform_id is null or m.platform_id=p_platform_id)
      and (p_direction is null or m.direction::text=p_direction) and (p_kind is null or m.kind::text=p_kind)
      and (nullif(btrim(p_order),'') is null or m.order_ref ilike '%'||btrim(p_order)||'%');
  elsif p_table = 'stock_edits' then
    select count(*) into v_count from stock_edits e left join skus s on s.id=e.sku_id
    where e.user_id=v_uid and e.created_at>=p_from and e.created_at<=p_to
      and (p_sku_id is null or e.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or e.color_id=p_color_id) and (p_size_id is null or e.size_id=p_size_id)
      and (p_platform_id is null or e.platform_id=p_platform_id);
  elsif p_table = 'packing_reads' then
    select count(*) into v_count from packing_reads r left join movements m on m.id=r.movement_id left join skus s on s.id=m.sku_id
    where r.user_id=v_uid and r.created_at>=p_from and r.created_at<=p_to
      and (p_movement_id is null or r.movement_id=p_movement_id)
      and (p_sku_id is null or m.sku_id=p_sku_id) and (p_category_id is null or s.category_id=p_category_id)
      and (p_color_id is null or m.color_id=p_color_id) and (p_size_id is null or m.size_id=p_size_id)
      and (p_kit_id is null or m.kit_id=p_kit_id) and (p_platform_id is null or m.platform_id=p_platform_id)
      and (p_direction is null or m.direction::text=p_direction) and (p_kind is null or m.kind::text=p_kind)
      and (nullif(btrim(p_order),'') is null or r.order_ref ilike '%'||btrim(p_order)||'%');
  else
    select count(*) into v_count from audit_logs a
    where a.user_id=v_uid and a.created_at>=p_from and a.created_at<=p_to
      and (p_movement_id is null or a.entity_id=p_movement_id);
  end if;
  return v_count;
end;
$$;

REVOKE ALL ON FUNCTION public.preview_filtered_history(text, timestamptz, timestamptz, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_filtered_history(text, timestamptz, timestamptz, uuid, text, text, uuid, uuid, uuid, uuid, uuid, uuid, text) TO authenticated, service_role;