-- ============ 1. PLATAFORMAS ============
CREATE TABLE IF NOT EXISTS public.platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  position integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platforms_user_slug_uq ON public.platforms(user_id, slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platforms TO authenticated;
GRANT ALL ON public.platforms TO service_role;
ALTER TABLE public.platforms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own platforms" ON public.platforms FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_platforms_upd BEFORE UPDATE ON public.platforms
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 2. ALOCACOES ============
CREATE TABLE IF NOT EXISTS public.stock_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  platform_id uuid NOT NULL REFERENCES public.platforms(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  color_id uuid NOT NULL REFERENCES public.colors(id) ON DELETE CASCADE,
  size_id uuid NOT NULL REFERENCES public.sizes(id) ON DELETE CASCADE,
  qty integer NOT NULL DEFAULT 0 CHECK (qty >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_allocations_uq
  ON public.stock_allocations(platform_id, color_id, size_id);
CREATE INDEX IF NOT EXISTS stock_allocations_cs_idx
  ON public.stock_allocations(color_id, size_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_allocations TO authenticated;
GRANT ALL ON public.stock_allocations TO service_role;
ALTER TABLE public.stock_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stock_allocations" ON public.stock_allocations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_stock_allocations_upd BEFORE UPDATE ON public.stock_allocations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 3. PLATAFORMA NAS MOVIMENTACOES ============
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.platforms(id) ON DELETE SET NULL;
ALTER TABLE public.stock_edits ADD COLUMN IF NOT EXISTS platform_id uuid REFERENCES public.platforms(id) ON DELETE SET NULL;

-- ============ 4. GUARDA: soma das reservas <= estoque real ============
CREATE OR REPLACE FUNCTION public.check_allocation_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_stock int;
  v_sum int;
begin
  select coalesce(qty,0) into v_stock from stock_units
    where color_id = new.color_id and size_id = new.size_id and user_id = new.user_id;
  v_stock := coalesce(v_stock, 0);
  select coalesce(sum(qty),0) into v_sum from stock_allocations
    where color_id = new.color_id and size_id = new.size_id and user_id = new.user_id
      and id is distinct from new.id;
  if v_sum + new.qty > v_stock then
    raise exception 'Reserva acima do estoque disponivel (estoque %, ja reservado %)', v_stock, v_sum;
  end if;
  return new;
end; $$;

CREATE TRIGGER t_stock_allocations_capacity
  BEFORE INSERT OR UPDATE ON public.stock_allocations
  FOR EACH ROW EXECUTE FUNCTION public.check_allocation_capacity();

-- ============ 5. RPC: definir reserva ============
CREATE OR REPLACE FUNCTION public.set_allocation(
  p_platform_id uuid, p_sku_id uuid, p_color_id uuid, p_size_id uuid, p_qty integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_old int;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Quantidade invalida'; end if;
  if not exists (select 1 from platforms where id = p_platform_id and user_id = v_uid) then
    raise exception 'Plataforma nao encontrada';
  end if;
  select qty into v_old from stock_allocations
    where platform_id = p_platform_id and color_id = p_color_id and size_id = p_size_id and user_id = v_uid;

  insert into stock_allocations (user_id, platform_id, sku_id, color_id, size_id, qty)
  values (v_uid, p_platform_id, p_sku_id, p_color_id, p_size_id, p_qty)
  on conflict (platform_id, color_id, size_id) do update set qty = p_qty;

  insert into audit_logs (user_id, action, entity, new_values)
  values (v_uid, 'reserva_plataforma', 'stock_allocations',
    jsonb_build_object('platform_id', p_platform_id, 'color_id', p_color_id,
      'size_id', p_size_id, 'before', coalesce(v_old,0), 'after', p_qty));
end; $$;

-- ============ 6. MOVIMENTACAO COM PLATAFORMA ============
DROP FUNCTION IF EXISTS public.apply_movement(uuid, mov_kind, mov_direction, uuid, uuid, integer, boolean, boolean, text, text, text);

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
  v_before int;
  v_after int;
  v_primary_before int;
  v_primary_after int;
  v_user text;
  v_alloc int;
  r record;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'Quantidade invalida'; end if;
  if not exists (select 1 from skus where id = p_sku_id and user_id = v_uid) then
    raise exception 'SKU nao encontrado';
  end if;
  if p_platform_id is not null and not exists (select 1 from platforms where id = p_platform_id and user_id = v_uid) then
    raise exception 'Plataforma nao encontrada';
  end if;

  select coalesce(nullif(full_name,''), email) into v_user from profiles where id = v_uid;

  if p_kind = 'unit' then
    select coalesce(qty,0) into v_before from stock_units
      where color_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
    v_before := coalesce(v_before, 0);
    if p_affect_units then
      v_after := v_before + v_sign * p_qty;
      if v_after < 0 then raise exception 'Estoque insuficiente: disponivel %', v_before; end if;
      -- saida com plataforma: precisa de reserva suficiente
      if p_platform_id is not null and v_sign < 0 then
        select coalesce(qty,0) into v_alloc from stock_allocations
          where platform_id = p_platform_id and color_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
        if coalesce(v_alloc,0) < p_qty then
          raise exception 'Reserva insuficiente na plataforma (reservado %)', coalesce(v_alloc,0);
        end if;
        update stock_allocations set qty = qty - p_qty
          where platform_id = p_platform_id and color_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
      end if;
      insert into stock_units (user_id, sku_id, color_id, size_id, qty)
      values (v_uid, p_sku_id, p_ref_id, p_size_id, v_after)
      on conflict (color_id, size_id) do update set qty = v_after;
      if p_platform_id is not null and v_sign > 0 then
        insert into stock_allocations (user_id, platform_id, sku_id, color_id, size_id, qty)
        values (v_uid, p_platform_id, p_sku_id, p_ref_id, p_size_id, p_qty)
        on conflict (platform_id, color_id, size_id) do update set qty = stock_allocations.qty + p_qty;
      end if;
      v_lines := v_lines || jsonb_build_object('type','unit','color_id',p_ref_id,'size_id',p_size_id,
        'delta', v_sign * p_qty, 'before', v_before, 'after', v_after,
        'platform_id', p_platform_id);
    else
      v_after := v_before;
    end if;
    v_primary_before := v_before; v_primary_after := v_after;
  else
    if p_affect_units then
      for r in select kc.color_id from kit_colors kc where kc.kit_id = p_ref_id order by kc.position loop
        select coalesce(qty,0) into v_before from stock_units
          where color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
        v_before := coalesce(v_before, 0);
        v_after := v_before + v_sign * p_qty;
        if v_after < 0 then raise exception 'Estoque insuficiente em uma das cores do kit (disponivel %)', v_before; end if;
        if p_platform_id is not null and v_sign < 0 then
          select coalesce(qty,0) into v_alloc from stock_allocations
            where platform_id = p_platform_id and color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
          if coalesce(v_alloc,0) < p_qty then
            raise exception 'Reserva insuficiente na plataforma para uma das cores do kit (reservado %)', coalesce(v_alloc,0);
          end if;
        end if;
      end loop;
      for r in select kc.color_id from kit_colors kc where kc.kit_id = p_ref_id order by kc.position loop
        select coalesce(qty,0) into v_before from stock_units
          where color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
        v_before := coalesce(v_before, 0);
        v_after := v_before + v_sign * p_qty;
        if p_platform_id is not null and v_sign < 0 then
          update stock_allocations set qty = qty - p_qty
            where platform_id = p_platform_id and color_id = r.color_id and size_id = p_size_id and user_id = v_uid;
        end if;
        insert into stock_units (user_id, sku_id, color_id, size_id, qty)
        values (v_uid, p_sku_id, r.color_id, p_size_id, v_after)
        on conflict (color_id, size_id) do update set qty = v_after;
        if p_platform_id is not null and v_sign > 0 then
          insert into stock_allocations (user_id, platform_id, sku_id, color_id, size_id, qty)
          values (v_uid, p_platform_id, p_sku_id, r.color_id, p_size_id, p_qty)
          on conflict (platform_id, color_id, size_id) do update set qty = stock_allocations.qty + p_qty;
        end if;
        v_lines := v_lines || jsonb_build_object('type','unit','color_id',r.color_id,'size_id',p_size_id,
          'delta', v_sign * p_qty, 'before', v_before, 'after', v_after, 'platform_id', p_platform_id);
      end loop;
    end if;
    if p_affect_formed then
      select coalesce(formed_qty,0) into v_before from kit_stock
        where kit_id = p_ref_id and size_id = p_size_id and user_id = v_uid;
      v_before := coalesce(v_before, 0);
      v_after := v_before + v_sign * p_qty;
      if v_after < 0 then raise exception 'Kits formados insuficientes: disponivel %', v_before; end if;
      insert into kit_stock (user_id, kit_id, size_id, formed_qty)
      values (v_uid, p_ref_id, p_size_id, v_after)
      on conflict (kit_id, size_id) do update set formed_qty = v_after;
      v_lines := v_lines || jsonb_build_object('type','formed','kit_id',p_ref_id,'size_id',p_size_id,
        'delta', v_sign * p_qty, 'before', v_before, 'after', v_after);
      v_primary_before := v_before; v_primary_after := v_after;
    end if;
    if v_primary_before is null then
      select min(coalesce(su.qty,0)) into v_primary_before
        from kit_colors kc left join stock_units su
          on su.color_id = kc.color_id and su.size_id = p_size_id and su.user_id = v_uid
        where kc.kit_id = p_ref_id;
      v_primary_before := coalesce(v_primary_before, 0) - case when p_affect_units then v_sign * p_qty else 0 end;
      v_primary_after := v_primary_before + case when p_affect_units then v_sign * p_qty else 0 end;
    end if;
  end if;

  insert into movements (user_id, sku_id, kind, direction, color_id, kit_id, size_id, qty, affect_units, affect_formed, lines, note, source, order_ref, stock_before, stock_after, user_name, platform_id)
  values (v_uid, p_sku_id, p_kind, p_direction,
    case when p_kind = 'unit' then p_ref_id else null end,
    case when p_kind = 'kit' then p_ref_id else null end,
    p_size_id, p_qty, p_affect_units, p_affect_formed, v_lines, p_note, p_source, p_order_ref,
    v_primary_before, v_primary_after, v_user, p_platform_id)
  returning id into v_mov;

  insert into audit_logs (user_id, action, entity, entity_id, new_values)
  values (v_uid, 'movimentacao', 'movements', v_mov, v_lines);

  return v_mov;
end; $$;

-- ============ 7. DESFAZER: devolve tambem a reserva ============
CREATE OR REPLACE FUNCTION public.undo_movement(p_movement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  m record;
  l jsonb;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  select * into m from movements where id = p_movement_id and user_id = v_uid;
  if m is null then raise exception 'Movimentacao nao encontrada'; end if;
  if m.undone_at is not null then raise exception 'Movimentacao ja desfeita'; end if;

  for l in select * from jsonb_array_elements(m.lines) loop
    if l->>'type' = 'unit' then
      update stock_units set qty = qty - (l->>'delta')::int
      where color_id = (l->>'color_id')::uuid and size_id = (l->>'size_id')::uuid and user_id = v_uid;
      if (l->>'platform_id') is not null then
        update stock_allocations set qty = greatest(0, qty - (l->>'delta')::int)
        where platform_id = (l->>'platform_id')::uuid
          and color_id = (l->>'color_id')::uuid and size_id = (l->>'size_id')::uuid and user_id = v_uid;
      end if;
    else
      update kit_stock set formed_qty = formed_qty - (l->>'delta')::int
      where kit_id = (l->>'kit_id')::uuid and size_id = (l->>'size_id')::uuid and user_id = v_uid;
    end if;
  end loop;

  update movements set undone_at = now() where id = p_movement_id;
  insert into audit_logs (user_id, action, entity, entity_id, old_values)
  values (v_uid, 'desfazer', 'movements', p_movement_id, m.lines);
end; $$;

-- ============ 8. PLATAFORMAS PADRAO PARA QUEM JA USA ============
INSERT INTO public.platforms (user_id, name, slug, color, position)
SELECT p.id, v.name, v.slug, v.color, v.pos
FROM public.profiles p
CROSS JOIN (VALUES
  ('TikTok Shop','tiktok-shop','#ff0050',0),
  ('Mercado Livre','mercado-livre','#ffe600',1),
  ('Shopee','shopee','#ee4d2d',2)
) AS v(name, slug, color, pos)
ON CONFLICT DO NOTHING;