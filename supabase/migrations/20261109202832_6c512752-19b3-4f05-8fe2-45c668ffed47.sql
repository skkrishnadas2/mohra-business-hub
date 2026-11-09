CREATE POLICY "Shop action receipts are server only"
ON public.shop_action_receipts FOR ALL TO anon, authenticated
USING (false) WITH CHECK (false);