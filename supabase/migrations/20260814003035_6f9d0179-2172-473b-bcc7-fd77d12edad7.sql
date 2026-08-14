DROP TRIGGER IF EXISTS t_stock_units_allocation_floor ON public.stock_units;
CREATE CONSTRAINT TRIGGER t_stock_units_allocation_floor
  AFTER INSERT OR UPDATE OF qty ON public.stock_units
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_stock_allocation_floor();

CREATE OR REPLACE FUNCTION public.undo_movement(p_movement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  m record;
  l jsonb;
  v_delta integer;
  v_platform uuid;
  v_scope integer;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  select * into m from movements where id = p_movement_id and user_id = v_uid for update;
  if m is null then raise exception 'Movimentacao nao encontrada'; end if;
  if m.undone_at is not null then raise exception 'Movimentacao ja desfeita'; end if;

  for l in select * from jsonb_array_elements(m.lines) loop
    v_delta := (l->>'delta')::int;
    if l->>'type' = 'unit' then
      v_platform := nullif(l->>'platform_id','')::uuid;
      if v_platform is not null then
        select coalesce(qty,0) into v_scope from stock_allocations
          where platform_id=v_platform
            and color_id=(l->>'color_id')::uuid
            and size_id=(l->>'size_id')::uuid
            and user_id=v_uid;
        if coalesce(v_scope,0) - v_delta < 0 then
          raise exception 'Nao e possivel desfazer: saldo atual da plataforma e insuficiente';
        end if;
        insert into stock_allocations (user_id, platform_id, sku_id, color_id, size_id, qty)
        values (v_uid, v_platform, m.sku_id, (l->>'color_id')::uuid, (l->>'size_id')::uuid, coalesce(v_scope,0)-v_delta)
        on conflict (platform_id,color_id,size_id) do update set qty=excluded.qty;
      end if;
      update stock_units set qty = qty - v_delta
        where color_id=(l->>'color_id')::uuid and size_id=(l->>'size_id')::uuid and user_id=v_uid;
      if not found then raise exception 'Saldo fisico da movimentacao nao foi encontrado'; end if;
    else
      update kit_stock set formed_qty = formed_qty - v_delta
        where kit_id=(l->>'kit_id')::uuid and size_id=(l->>'size_id')::uuid and user_id=v_uid;
      if not found then raise exception 'Saldo de kits formados nao foi encontrado'; end if;
    end if;
  end loop;

  update movements set undone_at=now() where id=p_movement_id and user_id=v_uid;
  insert into audit_logs (user_id,action,entity,entity_id,old_values)
  values (v_uid,'desfazer','movements',p_movement_id,m.lines);
end;
$$;

REVOKE ALL ON FUNCTION public.undo_movement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.undo_movement(uuid) TO authenticated, service_role;