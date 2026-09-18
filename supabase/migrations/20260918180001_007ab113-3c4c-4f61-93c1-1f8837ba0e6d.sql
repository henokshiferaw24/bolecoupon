CREATE OR REPLACE FUNCTION public.redeem_coupon(_token text)
 RETURNS TABLE(employee_name text, amount integer, remaining_balance integer, redeemed_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_coupon public.coupon_tokens;
  v_name text;
  v_remaining integer;
  v_now timestamptz := now();
BEGIN
  IF NOT private.has_role(auth.uid(), 'cashier') THEN RAISE EXCEPTION 'Cashier access required'; END IF;
  IF EXTRACT(ISODOW FROM v_now AT TIME ZONE 'Africa/Addis_Ababa') > 5 THEN RAISE EXCEPTION 'Redemption is closed on weekends'; END IF;
  SELECT * INTO v_coupon FROM public.coupon_tokens ct WHERE ct.token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found'; END IF;
  IF v_coupon.redeemed_at IS NOT NULL THEN RAISE EXCEPTION 'Coupon already redeemed'; END IF;
  IF v_coupon.expires_at < v_now THEN RAISE EXCEPTION 'Coupon expired'; END IF;
  UPDATE public.weekly_allocations wa SET remaining_balance = wa.remaining_balance - v_coupon.amount
  WHERE wa.id = v_coupon.allocation_id AND wa.eligible = true AND wa.remaining_balance >= v_coupon.amount
  RETURNING wa.remaining_balance INTO v_remaining;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient weekly balance'; END IF;
  UPDATE public.coupon_tokens ct SET redeemed_at = v_now, redeemed_by = auth.uid() WHERE ct.id = v_coupon.id;
  INSERT INTO public.redemptions(employee_id, cashier_id, allocation_id, token_id, amount, redeemed_at)
  VALUES(v_coupon.employee_id, auth.uid(), v_coupon.allocation_id, v_coupon.id, v_coupon.amount, v_now);
  INSERT INTO public.audit_logs(actor_id, action, entity_type, entity_id, details)
  VALUES(auth.uid(), 'coupon_redeemed', 'coupon_token', v_coupon.id::text, jsonb_build_object('employee_id', v_coupon.employee_id, 'amount', v_coupon.amount));
  SELECT p.display_name INTO v_name FROM public.profiles p WHERE p.id = v_coupon.employee_id;
  RETURN QUERY SELECT v_name, v_coupon.amount, v_remaining, v_now;
END; $function$;