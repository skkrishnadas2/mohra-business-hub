CREATE TABLE public.shop_action_receipts (
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  action_id uuid NOT NULL,
  version bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (shop_id, action_id)
);
GRANT ALL ON public.shop_action_receipts TO service_role;
ALTER TABLE public.shop_action_receipts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.commit_cloud_action(
  _shop_id uuid,
  _action_id uuid,
  _base_version bigint,
  _data jsonb,
  _user_id uuid
)
RETURNS TABLE(result_status text, result_version bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _existing_version bigint;
  _receipt_version bigint;
BEGIN
  SELECT r.version INTO _receipt_version
  FROM public.shop_action_receipts AS r
  WHERE r.shop_id = _shop_id AND r.action_id = _action_id;
  IF FOUND THEN
    result_status := 'ok';
    result_version := _receipt_version;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.shop_states AS s
  SET data = _data, version = _base_version + 1, updated_at = now(), updated_by = _user_id
  WHERE s.shop_id = _shop_id AND s.version = _base_version
  RETURNING s.version INTO _existing_version;

  IF NOT FOUND THEN
    SELECT s.version INTO _existing_version FROM public.shop_states AS s WHERE s.shop_id = _shop_id;
    result_status := 'conflict';
    result_version := _existing_version;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.shop_action_receipts (shop_id, action_id, version)
  VALUES (_shop_id, _action_id, _existing_version);
  result_status := 'ok';
  result_version := _existing_version;
  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_cloud_action(uuid, uuid, bigint, jsonb, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_cloud_action(uuid, uuid, bigint, jsonb, uuid) TO service_role;