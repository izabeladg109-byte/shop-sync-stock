CREATE TABLE public.ocr_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  pattern_signature text NOT NULL,
  sku_id uuid NOT NULL REFERENCES public.skus(id) ON DELETE CASCADE,
  kind public.mov_kind NOT NULL,
  ref_id uuid NOT NULL,
  size_id uuid NOT NULL REFERENCES public.sizes(id) ON DELETE CASCADE,
  qty integer NOT NULL,
  original_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  correction_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ocr_feedback_signature_not_blank CHECK (btrim(pattern_signature) <> ''),
  CONSTRAINT ocr_feedback_qty_positive CHECK (qty > 0),
  UNIQUE (user_id, pattern_signature, sku_id, kind, ref_id, size_id, qty)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ocr_feedback TO authenticated;
GRANT ALL ON public.ocr_feedback TO service_role;
ALTER TABLE public.ocr_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own ocr feedback" ON public.ocr_feedback FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX ocr_feedback_user_signature_idx ON public.ocr_feedback(user_id, pattern_signature, correction_count DESC);

CREATE OR REPLACE FUNCTION public.filtered_history_ids(
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
) RETURNS TABLE(id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_to <= p_from THEN RAISE EXCEPTION 'Periodo invalido'; END IF;
  IF p_table NOT IN ('movements','packing_reads','stock_edits','audit_logs') THEN RAISE EXCEPTION 'Tipo de historico invalido'; END IF;
  IF p_direction IS NOT NULL AND p_direction NOT IN ('in','out') THEN RAISE EXCEPTION 'Direcao invalida'; END IF;
  IF p_kind IS NOT NULL AND p_kind NOT IN ('unit','kit') THEN RAISE EXCEPTION 'Tipo invalido'; END IF;

  IF p_table = 'movements' THEN
    RETURN QUERY SELECT m.id FROM public.movements m LEFT JOIN public.skus s ON s.id=m.sku_id
    WHERE m.user_id=v_uid AND m.created_at>=p_from AND m.created_at<=p_to
      AND (p_movement_id IS NULL OR m.id=p_movement_id)
      AND (p_sku_id IS NULL OR m.sku_id=p_sku_id)
      AND (p_category_id IS NULL OR s.category_id=p_category_id)
      AND (p_color_id IS NULL OR m.color_id=p_color_id OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(m.lines) l WHERE nullif(l->>'color_id','')::uuid=p_color_id))
      AND (p_size_id IS NULL OR m.size_id=p_size_id)
      AND (p_kit_id IS NULL OR m.kit_id=p_kit_id)
      AND (p_platform_id IS NULL OR m.platform_id=p_platform_id)
      AND (p_direction IS NULL OR m.direction::text=p_direction)
      AND (p_kind IS NULL OR m.kind::text=p_kind)
      AND (nullif(btrim(p_order),'') IS NULL OR m.order_ref ILIKE '%'||btrim(p_order)||'%');
  ELSIF p_table = 'stock_edits' THEN
    RETURN QUERY SELECT e.id FROM public.stock_edits e LEFT JOIN public.skus s ON s.id=e.sku_id
    WHERE e.user_id=v_uid AND e.created_at>=p_from AND e.created_at<=p_to
      AND (p_movement_id IS NULL OR e.id=p_movement_id)
      AND (p_sku_id IS NULL OR e.sku_id=p_sku_id)
      AND (p_category_id IS NULL OR s.category_id=p_category_id)
      AND (p_color_id IS NULL OR e.color_id=p_color_id)
      AND (p_size_id IS NULL OR e.size_id=p_size_id)
      AND (p_platform_id IS NULL OR e.platform_id=p_platform_id)
      AND p_kit_id IS NULL AND p_direction IS NULL AND p_kind IS NULL
      AND nullif(btrim(p_order),'') IS NULL;
  ELSIF p_table = 'packing_reads' THEN
    RETURN QUERY SELECT r.id FROM public.packing_reads r
    LEFT JOIN public.movements m ON m.id=r.movement_id
    LEFT JOIN public.skus s ON s.id=m.sku_id
    WHERE r.user_id=v_uid AND r.created_at>=p_from AND r.created_at<=p_to
      AND (p_movement_id IS NULL OR r.movement_id=p_movement_id)
      AND (p_sku_id IS NULL OR m.sku_id=p_sku_id)
      AND (p_category_id IS NULL OR s.category_id=p_category_id)
      AND (p_color_id IS NULL OR m.color_id=p_color_id OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(m.lines,'[]'::jsonb)) l WHERE nullif(l->>'color_id','')::uuid=p_color_id))
      AND (p_size_id IS NULL OR m.size_id=p_size_id)
      AND (p_kit_id IS NULL OR m.kit_id=p_kit_id)
      AND (p_platform_id IS NULL OR m.platform_id=p_platform_id)
      AND (p_direction IS NULL OR m.direction::text=p_direction)
      AND (p_kind IS NULL OR m.kind::text=p_kind)
      AND (nullif(btrim(p_order),'') IS NULL OR r.order_ref ILIKE '%'||btrim(p_order)||'%');
  ELSE
    RETURN QUERY SELECT a.id FROM public.audit_logs a
    WHERE a.user_id=v_uid AND a.created_at>=p_from AND a.created_at<=p_to
      AND (p_movement_id IS NULL OR a.entity_id=p_movement_id)
      AND p_sku_id IS NULL AND p_category_id IS NULL AND p_color_id IS NULL
      AND p_size_id IS NULL AND p_kit_id IS NULL AND p_platform_id IS NULL
      AND p_direction IS NULL AND p_kind IS NULL AND nullif(btrim(p_order),'') IS NULL;
  END IF;
END;
$$;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.filtered_history_ids(
    p_table,p_from,p_to,p_sku_id,p_direction,p_order,p_category_id,p_color_id,
    p_size_id,p_kit_id,p_platform_id,p_movement_id,p_kind
  );
$$;

CREATE OR REPLACE FUNCTION public.list_filtered_history_ids(
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
  p_kind text DEFAULT NULL,
  p_limit integer DEFAULT 5000
) RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(x.id), '{}'::uuid[])
  FROM (SELECT id FROM public.filtered_history_ids(
    p_table,p_from,p_to,p_sku_id,p_direction,p_order,p_category_id,p_color_id,
    p_size_id,p_kit_id,p_platform_id,p_movement_id,p_kind
  ) LIMIT least(greatest(coalesce(p_limit,5000),1),10000)) x;
$$;

DROP FUNCTION IF EXISTS public.purge_filtered_history(text,timestamptz,timestamptz,uuid,text,text,text);
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
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[];
  v_found integer := 0;
  v_deleted integer := 0;
  v_remaining integer := 0;
  v_reads_deleted integer := 0;
  v_logical_bytes bigint := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Operacao permitida somente para administrador'; END IF;
  IF p_confirm IS DISTINCT FROM 'EXCLUIR' THEN RAISE EXCEPTION 'Confirmacao invalida'; END IF;
  IF p_table = 'audit_logs' THEN RAISE EXCEPTION 'O registro de auditoria e imutavel e nao pode ser apagado pela lixeira'; END IF;

  SELECT coalesce(array_agg(x.id), '{}'::uuid[]) INTO v_ids
  FROM public.filtered_history_ids(p_table,p_from,p_to,p_sku_id,p_direction,p_order,p_category_id,p_color_id,p_size_id,p_kit_id,p_platform_id,p_movement_id,p_kind) x;
  v_found := cardinality(v_ids);

  IF p_table = 'movements' THEN
    SELECT coalesce(sum(pg_column_size(m)),0) INTO v_logical_bytes FROM public.movements m WHERE m.id=ANY(v_ids) AND m.user_id=v_uid;
    DELETE FROM public.packing_reads r WHERE r.user_id=v_uid AND r.movement_id=ANY(v_ids);
    GET DIAGNOSTICS v_reads_deleted = ROW_COUNT;
    DELETE FROM public.movements m WHERE m.user_id=v_uid AND m.id=ANY(v_ids);
  ELSIF p_table = 'packing_reads' THEN
    SELECT coalesce(sum(pg_column_size(r)),0) INTO v_logical_bytes FROM public.packing_reads r WHERE r.id=ANY(v_ids) AND r.user_id=v_uid;
    DELETE FROM public.packing_reads r WHERE r.user_id=v_uid AND r.id=ANY(v_ids);
  ELSIF p_table = 'stock_edits' THEN
    SELECT coalesce(sum(pg_column_size(e)),0) INTO v_logical_bytes FROM public.stock_edits e WHERE e.id=ANY(v_ids) AND e.user_id=v_uid;
    DELETE FROM public.stock_edits e WHERE e.user_id=v_uid AND e.id=ANY(v_ids);
  ELSE
    RAISE EXCEPTION 'Tipo de historico invalido para exclusao';
  END IF;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT count(*) INTO v_remaining
  FROM public.filtered_history_ids(p_table,p_from,p_to,p_sku_id,p_direction,p_order,p_category_id,p_color_id,p_size_id,p_kit_id,p_platform_id,p_movement_id,p_kind);
  IF v_remaining <> 0 OR v_deleted <> v_found THEN
    RAISE EXCEPTION 'Exclusao nao confirmada: encontrados %, excluidos %, restantes %',v_found,v_deleted,v_remaining;
  END IF;

  EXECUTE format('ANALYZE public.%I',p_table);
  INSERT INTO public.audit_logs(user_id,action,entity,new_values)
  VALUES(v_uid,'limpeza_historico',p_table,jsonb_build_object(
    'from',p_from,'to',p_to,'found',v_found,'deleted',v_deleted,'remaining',v_remaining,
    'dependent_reads_deleted',v_reads_deleted,'logical_bytes_deleted',v_logical_bytes));

  RETURN jsonb_build_object(
    'found',v_found,'deleted',v_deleted,'remaining',v_remaining,
    'dependent_records_deleted',v_reads_deleted,
    'files_found',0,'files_deleted',0,'files_failed',0,'errors','[]'::jsonb,
    'logical_bytes_deleted',v_logical_bytes,
    'physical_bytes_freed',0,
    'reusable_bytes_created',v_logical_bytes);
END;
$$;

CREATE OR REPLACE FUNCTION public.db_storage_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tables jsonb := '[]'::jsonb;
  v_database bigint := 0;
  v_public bigint := 0;
  v_storage_files bigint := 0;
  v_storage_bytes bigint := 0;
  r record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF NOT public.has_role(v_uid,'admin') THEN RAISE EXCEPTION 'Operacao permitida somente para administrador'; END IF;
  SELECT pg_database_size(current_database()) INTO v_database;
  SELECT coalesce(sum(pg_total_relation_size(c.oid)),0) INTO v_public
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r';

  FOR r IN SELECT c.relname,pg_total_relation_size(c.oid) bytes
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY 2 DESC
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE user_id=$1',r.relname) INTO r.rows USING v_uid;
    EXCEPTION WHEN undefined_column THEN
      IF r.relname='profiles' THEN EXECUTE 'SELECT count(*) FROM public.profiles WHERE id=$1' INTO r.rows USING v_uid;
      ELSE r.rows := 0;
      END IF;
    END;
    v_tables := v_tables || jsonb_build_object('name',r.relname,'bytes',r.bytes,'rows',r.rows);
  END LOOP;

  SELECT count(*),coalesce(sum(coalesce((metadata->>'size')::bigint,0)),0)
    INTO v_storage_files,v_storage_bytes FROM storage.objects WHERE owner_id=v_uid::text;
  RETURN jsonb_build_object(
    'database_bytes',v_database,'public_schema_bytes',v_public,'reusable_bytes',0,
    'storage_files',v_storage_files,'storage_bytes',v_storage_bytes,'tables',v_tables);
END;
$$;

REVOKE ALL ON FUNCTION public.filtered_history_ids(text,timestamptz,timestamptz,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.preview_filtered_history(text,timestamptz,timestamptz,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_filtered_history(text,timestamptz,timestamptz,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.list_filtered_history_ids(text,timestamptz,timestamptz,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_filtered_history_ids(text,timestamptz,timestamptz,uuid,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text,integer) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.purge_filtered_history(text,timestamptz,timestamptz,uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.purge_filtered_history(text,timestamptz,timestamptz,uuid,text,text,text,uuid,uuid,uuid,uuid,uuid,uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.db_storage_info() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.db_storage_info() TO authenticated,service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',r.signature);
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_allocation_capacity() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_stock_allocation_floor() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM authenticated;
