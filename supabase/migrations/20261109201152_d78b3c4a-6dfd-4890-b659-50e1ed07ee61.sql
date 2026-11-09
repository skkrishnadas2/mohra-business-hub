DROP POLICY "Members can view their shop state" ON public.shop_states;

CREATE POLICY "Owners can view their raw shop state"
ON public.shop_states FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.shops
  WHERE shops.id = shop_states.shop_id AND shops.owner_id = auth.uid()
));

REVOKE UPDATE ON public.shop_states FROM authenticated;