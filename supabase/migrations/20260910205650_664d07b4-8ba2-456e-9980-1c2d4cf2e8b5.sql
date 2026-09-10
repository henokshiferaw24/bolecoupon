CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

ALTER POLICY "Users view own profile" ON public.profiles USING (id = auth.uid() OR private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Users update own profile" ON public.profiles USING (id = auth.uid() OR private.has_role(auth.uid(), 'super_admin')) WITH CHECK (id = auth.uid() OR private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Admins create profiles" ON public.profiles WITH CHECK (private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Admins delete profiles" ON public.profiles USING (private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Users view own role" ON public.user_roles USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Employees view own allocations" ON public.weekly_allocations USING (employee_id = auth.uid() OR private.has_role(auth.uid(), 'auditor') OR private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Admins manage allocations" ON public.weekly_allocations USING (private.has_role(auth.uid(), 'super_admin')) WITH CHECK (private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Employees view own tokens" ON public.coupon_tokens USING (employee_id = auth.uid() OR private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Authorized users view redemptions" ON public.redemptions USING (employee_id = auth.uid() OR cashier_id = auth.uid() OR private.has_role(auth.uid(), 'auditor') OR private.has_role(auth.uid(), 'super_admin'));
ALTER POLICY "Auditors and admins view audit logs" ON public.audit_logs USING (private.has_role(auth.uid(), 'auditor') OR private.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Employees update own unused tokens" ON public.coupon_tokens FOR UPDATE TO authenticated USING (employee_id = auth.uid() AND redeemed_at IS NULL) WITH CHECK (employee_id = auth.uid());
CREATE POLICY "Cashiers update valid tokens" ON public.coupon_tokens FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'cashier') AND redeemed_at IS NULL) WITH CHECK (private.has_role(auth.uid(), 'cashier'));
CREATE POLICY "Cashiers update allocations for redemption" ON public.weekly_allocations FOR UPDATE TO authenticated USING (private.has_role(auth.uid(), 'cashier')) WITH CHECK (private.has_role(auth.uid(), 'cashier'));
CREATE POLICY "Cashiers record redemptions" ON public.redemptions FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'cashier') AND cashier_id = auth.uid());
CREATE POLICY "Cashiers record audit events" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (private.has_role(auth.uid(), 'cashier') AND actor_id = auth.uid());
GRANT INSERT ON public.redemptions TO authenticated;
GRANT INSERT ON public.audit_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.audit_logs_id_seq TO authenticated;

ALTER FUNCTION public.create_coupon_token(integer) SECURITY INVOKER;
ALTER FUNCTION public.redeem_coupon(text) SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.create_coupon_token(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_coupon(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_coupon_token(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_coupon(_token text)
RETURNS TABLE(employee_name text, amount integer, remaining_balance integer, redeemed_at timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, private AS $$
DECLARE
  v_coupon public.coupon_tokens;
  v_name text;
  v_remaining integer;
  v_now timestamptz := now();
BEGIN
  IF NOT private.has_role(auth.uid(), 'cashier') THEN RAISE EXCEPTION 'Cashier access required'; END IF;
  IF EXTRACT(ISODOW FROM v_now AT TIME ZONE 'Africa/Addis_Ababa') > 5 THEN RAISE EXCEPTION 'Redemption is closed on weekends'; END IF;
  SELECT * INTO v_coupon FROM public.coupon_tokens WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found'; END IF;
  IF v_coupon.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Coupon already redeemed'; END IF;
  IF v_coupon.expires_at < v_now THEN RAISE EXCEPTION 'Coupon expired'; END IF;
  UPDATE public.weekly_allocations SET remaining_balance = remaining_balance - v_coupon.amount
  WHERE id = v_coupon.allocation_id AND eligible = true AND remaining_balance >= v_coupon.amount
  RETURNING weekly_allocations.remaining_balance INTO v_remaining;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient weekly balance'; END IF;
  UPDATE public.coupon_tokens SET redeemed_at = v_now, redeemed_by = auth.uid() WHERE id = v_coupon.id;
  INSERT INTO public.redemptions(employee_id, cashier_id, allocation_id, token_id, amount, redeemed_at)
  VALUES(v_coupon.employee_id, auth.uid(), v_coupon.allocation_id, v_coupon.id, v_coupon.amount, v_now);
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES(auth.uid(), 'coupon_redeemed', 'coupon_token', v_coupon.id::text, jsonb_build_object('employee_id', v_coupon.employee_id, 'amount', v_coupon.amount));
  SELECT display_name INTO v_name FROM public.profiles WHERE id = v_coupon.employee_id;
  RETURN QUERY SELECT v_name, v_coupon.amount, v_remaining, v_now;
END; $$;