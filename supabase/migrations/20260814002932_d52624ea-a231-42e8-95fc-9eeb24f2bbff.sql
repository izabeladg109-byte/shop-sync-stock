CREATE OR REPLACE FUNCTION public.check_stock_allocation_floor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_allocated integer;
begin
  select coalesce(sum(sa.qty), 0)
    into v_allocated
  from public.stock_allocations sa
  where sa.user_id = new.user_id
    and sa.color_id = new.color_id
    and sa.size_id = new.size_id;

  if new.qty < v_allocated then
    raise exception 'Estoque total nao pode ficar abaixo do saldo exclusivo das plataformas (%)', v_allocated;
  end if;
  return new;
end;
$$;

DROP TRIGGER IF EXISTS t_stock_units_allocation_floor ON public.stock_units;
CREATE TRIGGER t_stock_units_allocation_floor
  BEFORE INSERT OR UPDATE OF qty ON public.stock_units
  FOR EACH ROW EXECUTE FUNCTION public.check_stock_allocation_floor();

CREATE OR REPLACE FUNCTION public.apply_movement(
  p_sku_id uuid, p_kind mov_kind, p_direction mov_direction, p_ref_id uuid, p_size_id uuid,
  p_qty integer, p_affect_units boolean, p_affect_formed boolean,
  p_note text DEFAULT NULL, p_source text DEFAULT 'manual', p_order_ref text DEFAULT NULL,
  p_platform_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_sign int := case when p_direction = 'in' then 1 else -1 end;
  v_lines jsonb := '[]'::jsonb;
  v_mov uuid;
  v_total_before int;
  v_total_after int;
  v_scope_before int;
  v_scope_after int;
  v_allocated int;
  v_user text;
  r record;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantidade invalida'; end if;
  if not exists (select 1 from skus where id = p_sku_id and user_id = v_uid) then
    raise exception 'SKU nao encontrado';
  end if;
  if p_platform_id is not null and not exists (
    select 1 from platforms where id = p_platform_id and user_id = v_uid and deleted_at is null and active
  ) then
    raise exception 'Plataforma nao encontrada ou inativa';
  end if;

  select coalesce(nullif(full_name,''), email) into v_user from profiles where id = v_uid;

  if p_kind = 'unit' then
    if not exists (select 1 from colors where id = p_ref_id and sku_id = p_sku_id and user_id = v_uid) then
      raise exception 'Cor nao pertence ao SKU';
    end if;
    if not exists (select 1 from sizes where id = p_size_id and sku_id = p_sku_id and user_id = v_uid) then
      raise exception 'Tamanho nao pertence ao SKU';
    end if;

    select coalesce(qty,0) into v_total_before from stock_units
      where color_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
    v_total_before := coalesce(v_total_before, 0);

    if p_platform_id is null then
      select coalesce(sum(qty),0) into v_allocated from stock_allocations
        where color_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
      v_scope_before := greatest(0, v_total_before - coalesce(v_allocated,0));
    else
      select coalesce(qty,0) into v_scope_before from stock_allocations
        where platform_id = p_platform_id and color_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
      v_scope_before := coalesce(v_scope_before,0);
    end if;

    if p_affect_units then
      v_scope_after := v_scope_before + v_sign * p_qty;
      if v_scope_after < 0 then
        raise exception 'Estoque insuficiente neste escopo: disponivel %', v_scope_before;
      end if;
      v_total_after := v_total_before + v_sign * p_qty;
      if v_total_after < 0 then raise exception 'Estoque fisico insuficiente: disponivel %', v_total_before; end if;

      insert into stock_units (user_id, sku_id, color_id, size_id, qty)
      values (v_uid, p_sku_id, p_ref_id, p_size_id, v_total_after)
      on conflict (color_id, size_id) do update set qty = excluded.qty;

      if p_platform_id is not null then
        insert into stock_allocations (user_id, platform_id, sku_id, color_id, size_id, qty)
        values (v_uid, p_platform_id, p_sku_id, p_ref_id, p_size_id, v_scope_after)
        on conflict (platform_id, color_id, size_id) do update set qty = excluded.qty;
      end if;

      v_lines := v_lines || jsonb_build_object(
        'type','unit','color_id',p_ref_id,'size_id',p_size_id,
        'delta',v_sign * p_qty,'before',v_scope_before,'after',v_scope_after,
        'total_before',v_total_before,'total_after',v_total_after,'platform_id',p_platform_id
      );
    else
      v_scope_after := v_scope_before;
      v_total_after := v_total_before;
    end if;
  else
    if not exists (select 1 from kits where id = p_ref_id and sku_id = p_sku_id and user_id = v_uid) then
      raise exception 'Kit nao pertence ao SKU';
    end if;
    if not exists (select 1 from sizes where id = p_size_id and sku_id = p_sku_id and user_id = v_uid) then
      raise exception 'Tamanho nao pertence ao SKU';
    end if;
    if not exists (select 1 from kit_colors where kit_id = p_ref_id and user_id = v_uid) then
      raise exception 'Kit sem composicao cadastrada';
    end if;

    if p_affect_units then
      for r in select kc.color_id from kit_colors kc where kc.kit_id = p_ref_id and kc.user_id = v_uid order by kc.position loop
        select coalesce(qty,0) into v_total_before from stock_units
          where color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
        v_total_before := coalesce(v_total_before,0);
        if p_platform_id is null then
          select coalesce(sum(qty),0) into v_allocated from stock_allocations
            where color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
          v_scope_before := greatest(0, v_total_before - coalesce(v_allocated,0));
        else
          select coalesce(qty,0) into v_scope_before from stock_allocations
            where platform_id = p_platform_id and color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
          v_scope_before := coalesce(v_scope_before,0);
        end if;
        if v_scope_before + v_sign * p_qty < 0 then
          raise exception 'Estoque insuficiente neste escopo para uma das cores do kit: disponivel %', v_scope_before;
        end if;
      end loop;

      for r in select kc.color_id from kit_colors kc where kc.kit_id = p_ref_id and kc.user_id = v_uid order by kc.position loop
        select coalesce(qty,0) into v_total_before from stock_units
          where color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
        v_total_before := coalesce(v_total_before,0);
        if p_platform_id is null then
          select coalesce(sum(qty),0) into v_allocated from stock_allocations
            where color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
          v_scope_before := greatest(0, v_total_before - coalesce(v_allocated,0));
        else
          select coalesce(qty,0) into v_scope_before from stock_allocations
            where platform_id = p_platform_id and color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
          v_scope_before := coalesce(v_scope_before,0);
        end if;
        v_scope_after := v_scope_before + v_sign * p_qty;
        v_total_after := v_total_before + v_sign * p_qty;

        insert into stock_units (user_id, sku_id, color_id, size_id, qty)
        values (v_uid, p_sku_id, r.color_id, p_size_id, v_total_after)
        on conflict (color_id, size_id) do update set qty = excluded.qty;

        if p_platform_id is not null then
          insert into stock_allocations (user_id, platform_id, sku_id, color_id, size_id, qty)
          values (v_uid, p_platform_id, p_sku_id, r.color_id, p_size_id, v_scope_after)
          on conflict (platform_id, color_id, size_id) do update set qty = excluded.qty;
        end if;

        v_lines := v_lines || jsonb_build_object(
          'type','unit','color_id',r.color_id,'size_id',p_size_id,
          'delta',v_sign * p_qty,'before',v_scope_before,'after',v_scope_after,
          'total_before',v_total_before,'total_after',v_total_after,'platform_id',p_platform_id
        );
      end loop;
    end if;

    if p_affect_formed then
      select coalesce(formed_qty,0) into v_scope_before from kit_stock
        where kit_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
      v_scope_before := coalesce(v_scope_before,0);
      v_scope_after := v_scope_before + v_sign * p_qty;
      if v_scope_after < 0 then raise exception 'Kits formados insuficientes: disponivel %', v_scope_before; end if;
      insert into kit_stock (user_id, kit_id, size_id, formed_qty)
      values (v_uid, p_ref_id, p_size_id, v_scope_after)
      on conflict (kit_id, size_id) do update set formed_qty = excluded.formed_qty;
      v_lines := v_lines || jsonb_build_object('type','formed','kit_id',p_ref_id,'size_id',p_size_id,
        'delta',v_sign * p_qty,'before',v_scope_before,'after',v_scope_after);
    elsif p_affect_units then
      select min((line->>'before')::int), min((line->>'after')::int)
        into v_scope_before, v_scope_after
      from jsonb_array_elements(v_lines) line
      where line->>'type' = 'unit';
    else
      v_scope_before := 0;
      v_scope_after := 0;
    end if;
  end if;

  insert into movements (user_id, sku_id, kind, direction, color_id, kit_id, size_id, qty,
    affect_units, affect_formed, lines, note, source, order_ref, stock_before, stock_after, user_name, platform_id)
  values (v_uid, p_sku_id, p_kind, p_direction,
    case when p_kind = 'unit' then p_ref_id else null end,
    case when p_kind = 'kit' then p_ref_id else null end,
    p_size_id, p_qty, p_affect_units, p_affect_formed, v_lines, p_note, p_source, p_order_ref,
    v_scope_before, v_scope_after, v_user, p_platform_id)
  returning id into v_mov;

  insert into audit_logs (user_id, action, entity, entity_id, new_values)
  values (v_uid, 'movimentacao', 'movements', v_mov, v_lines);
  return v_mov;
end;
$$;

CREATE OR REPLACE FUNCTION public.purge_filtered_history(
  p_table text,
  p_from timestamptz,
  p_to timestamptz,
  p_sku_id uuid DEFAULT NULL,
  p_direction text DEFAULT NULL,
  p_order text DEFAULT NULL,
  p_confirm text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_found integer := 0;
  v_deleted integer := 0;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if p_confirm is distinct from 'EXCLUIR' then raise exception 'Confirmacao invalida'; end if;
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'Periodo invalido'; end if;
  if p_table not in ('movements','packing_reads','stock_edits','audit_logs') then
    raise exception 'Tipo de historico invalido';
  end if;
  if p_direction is not null and p_direction not in ('in','out') then
    raise exception 'Direcao invalida';
  end if;
  if p_table not in ('movements','stock_edits') and p_sku_id is not null then
    raise exception 'Filtro de SKU nao permitido para este historico';
  end if;
  if p_table <> 'movements' and p_direction is not null then
    raise exception 'Filtro de direcao nao permitido para este historico';
  end if;
  if p_table not in ('movements','packing_reads') and nullif(btrim(p_order),'') is not null then
    raise exception 'Filtro de pedido nao permitido para este historico';
  end if;

  if p_table = 'movements' then
    select count(*) into v_found from movements
      where user_id=v_uid and created_at>=p_from and created_at<=p_to
        and (p_sku_id is null or sku_id=p_sku_id)
        and (p_direction is null or direction::text=p_direction)
        and (nullif(btrim(p_order),'') is null or order_ref ilike '%'||btrim(p_order)||'%');
    delete from movements
      where user_id=v_uid and created_at>=p_from and created_at<=p_to
        and (p_sku_id is null or sku_id=p_sku_id)
        and (p_direction is null or direction::text=p_direction)
        and (nullif(btrim(p_order),'') is null or order_ref ilike '%'||btrim(p_order)||'%');
  elsif p_table = 'packing_reads' then
    select count(*) into v_found from packing_reads
      where user_id=v_uid and created_at>=p_from and created_at<=p_to
        and (nullif(btrim(p_order),'') is null or order_ref ilike '%'||btrim(p_order)||'%');
    delete from packing_reads
      where user_id=v_uid and created_at>=p_from and created_at<=p_to
        and (nullif(btrim(p_order),'') is null or order_ref ilike '%'||btrim(p_order)||'%');
  elsif p_table = 'stock_edits' then
    select count(*) into v_found from stock_edits
      where user_id=v_uid and created_at>=p_from and created_at<=p_to
        and (p_sku_id is null or sku_id=p_sku_id);
    delete from stock_edits
      where user_id=v_uid and created_at>=p_from and created_at<=p_to
        and (p_sku_id is null or sku_id=p_sku_id);
  else
    select count(*) into v_found from audit_logs
      where user_id=v_uid and created_at>=p_from and created_at<=p_to;
    delete from audit_logs
      where user_id=v_uid and created_at>=p_from and created_at<=p_to;
  end if;
  get diagnostics v_deleted = row_count;

  insert into audit_logs (user_id, action, entity, new_values)
  values (v_uid, 'limpeza_historico', p_table,
    jsonb_build_object('from',p_from,'to',p_to,'found',v_found,'deleted',v_deleted,
      'sku_id',p_sku_id,'direction',p_direction,'order',nullif(btrim(p_order),'')));

  return jsonb_build_object('found',v_found,'deleted',v_deleted);
end;
$$;

REVOKE ALL ON FUNCTION public.apply_movement(uuid, mov_kind, mov_direction, uuid, uuid, integer, boolean, boolean, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_movement(uuid, mov_kind, mov_direction, uuid, uuid, integer, boolean, boolean, text, text, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.purge_filtered_history(text, timestamptz, timestamptz, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_filtered_history(text, timestamptz, timestamptz, uuid, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_stock_allocation_floor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_stock_allocation_floor() TO authenticated, service_role;