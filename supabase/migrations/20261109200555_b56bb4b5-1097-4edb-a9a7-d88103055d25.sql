DROP POLICY "Members can view their shops" ON public.shops;
DROP POLICY "Members can view own membership and owners can view their team" ON public.shop_members;
DROP POLICY "Owners can view shop invitations" ON public.shop_invites;
DROP POLICY "Members can view their shop state" ON public.shop_states;
DROP FUNCTION public.is_shop_member(uuid);
DROP FUNCTION public.is_shop_owner(uuid);

CREATE POLICY "Members can view their shops"
ON public.shops FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shop_members
  WHERE shop_members.shop_id = shops.id AND shop_members.user_id = auth.uid()
));

CREATE POLICY "Members can view their own membership"
ON public.shop_members FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Owners can view shop invitations"
ON public.shop_invites FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shops
  WHERE shops.id = shop_invites.shop_id AND shops.owner_id = auth.uid()
));

CREATE POLICY "Members can view their shop state"
ON public.shop_states FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shop_members
  WHERE shop_members.shop_id = shop_states.shop_id AND shop_members.user_id = auth.uid()
));

REVOKE ALL ON FUNCTION public.create_cloud_shop(text, jsonb) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.join_cloud_shop(uuid, uuid) FROM anon, authenticated;

DROP FUNCTION public.create_cloud_shop(text, jsonb);
DROP FUNCTION public.join_cloud_shop(uuid, uuid);

CREATE OR REPLACE FUNCTION public.create_cloud_shop(_name text, _data jsonb, _user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _shop_id uuid;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User identity required';
  END IF;
  IF length(trim(_name)) = 0 OR jsonb_typeof(_data) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid shop setup';
  END IF;
  INSERT INTO public.shops (name, owner_id) VALUES (trim(_name), _user_id) RETURNING id INTO _shop_id;
  INSERT INTO public.shop_members (shop_id, user_id, role) VALUES (_shop_id, _user_id, 'owner');
  INSERT INTO public.shop_invites (shop_id) VALUES (_shop_id);
  INSERT INTO public.shop_states (shop_id, data, updated_by) VALUES (_shop_id, _data, _user_id);
  RETURN _shop_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_cloud_shop(_shop_id uuid, _join_code uuid, _user_id uuid)
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role public.app_role;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'User identity required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.shop_invites WHERE shop_id = _shop_id AND join_code = _join_code
  ) THEN
    RAISE EXCEPTION 'Invalid shop invitation';
  END IF;
  INSERT INTO public.shop_members (shop_id, user_id, role)
  VALUES (_shop_id, _user_id, 'cashier')
  ON CONFLICT (shop_id, user_id) DO NOTHING;
  SELECT role INTO _role FROM public.shop_members WHERE shop_id = _shop_id AND user_id = _user_id;
  RETURN _role;
END;
$$;

REVOKE ALL ON FUNCTION public.create_cloud_shop(text, jsonb, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.join_cloud_shop(uuid, uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_cloud_shop(text, jsonb, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.join_cloud_shop(uuid, uuid, uuid) TO service_role;