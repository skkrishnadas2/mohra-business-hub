CREATE TYPE public.app_role AS ENUM ('owner', 'cashier');

CREATE TABLE public.shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shops TO authenticated;
GRANT ALL ON public.shops TO service_role;
ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shop_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shop_id, user_id)
);
GRANT SELECT ON public.shop_members TO authenticated;
GRANT ALL ON public.shop_members TO service_role;
ALTER TABLE public.shop_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shop_invites (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  join_code uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.shop_invites TO authenticated;
GRANT ALL ON public.shop_invites TO service_role;
ALTER TABLE public.shop_invites ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.shop_states (
  shop_id uuid PRIMARY KEY REFERENCES public.shops(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 1,
  data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.shop_states TO authenticated;
GRANT ALL ON public.shop_states TO service_role;
ALTER TABLE public.shop_states ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_shop_member(_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = _shop_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_shop_owner(_shop_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shop_members
    WHERE shop_id = _shop_id AND user_id = auth.uid() AND role = 'owner'
  )
$$;

REVOKE ALL ON FUNCTION public.is_shop_member(uuid) FROM public;
REVOKE ALL ON FUNCTION public.is_shop_owner(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_shop_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shop_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_shop_owner(uuid) TO service_role;

CREATE POLICY "Members can view their shops"
ON public.shops FOR SELECT TO authenticated
USING (public.is_shop_member(id));

CREATE POLICY "Members can view own membership and owners can view their team"
ON public.shop_members FOR SELECT TO authenticated
USING (user_id = auth.uid() OR public.is_shop_owner(shop_id));

CREATE POLICY "Owners can view shop invitations"
ON public.shop_invites FOR SELECT TO authenticated
USING (public.is_shop_owner(shop_id));

CREATE POLICY "Members can view their shop state"
ON public.shop_states FOR SELECT TO authenticated
USING (public.is_shop_member(shop_id));

CREATE OR REPLACE FUNCTION public.create_cloud_shop(_name text, _data jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF length(trim(_name)) = 0 OR jsonb_typeof(_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid shop setup';
  END IF;
  INSERT INTO public.shops (name, owner_id) VALUES (trim(_name), auth.uid()) RETURNING id INTO _shop_id;
  INSERT INTO public.shop_members (shop_id, user_id, role) VALUES (_shop_id, auth.uid(), 'owner');
  INSERT INTO public.shop_invites (shop_id) VALUES (_shop_id);
  INSERT INTO public.shop_states (shop_id, data, updated_by) VALUES (_shop_id, _data, auth.uid());
  RETURN _shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_cloud_shop(_shop_id uuid, _join_code uuid)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.app_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_invites WHERE shop_id = _shop_id AND join_code = _join_code
  ) THEN
    RAISE EXCEPTION 'Invalid shop invitation';
  END IF;
  INSERT INTO public.shop_members (shop_id, user_id, role)
  VALUES (_shop_id, auth.uid(), 'cashier')
  ON CONFLICT (shop_id, user_id) DO NOTHING;
  SELECT role INTO _role FROM public.shop_members WHERE shop_id = _shop_id AND user_id = auth.uid();
  RETURN _role;
END;
$$;

REVOKE ALL ON FUNCTION public.create_cloud_shop(text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.join_cloud_shop(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_cloud_shop(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.join_cloud_shop(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_cloud_shop(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_cloud_shop(uuid, uuid) TO service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_states;