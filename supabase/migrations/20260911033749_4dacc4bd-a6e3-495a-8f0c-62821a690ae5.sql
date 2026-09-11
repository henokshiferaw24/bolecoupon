CREATE OR REPLACE FUNCTION public.create_coupon_token(_amount integer)
 RETURNS TABLE(token text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_week date := date_trunc('week', now() AT TIME ZONE 'Africa/Addis_Ababa')::date;
  v_allocation public.weekly_allocations;
  v_token public.coupon_tokens;
BEGIN
  IF EXTRACT(ISODOW FROM now() AT TIME ZONE 'Africa/Addis_Ababa') > 5 THEN RAISE EXCEPTION 'Coupons are available Monday through Friday only'; END IF;
  IF _amount NOT IN (40,80,120,160,200) THEN RAISE EXCEPTION 'Invalid coupon amount'; END IF;
  SELECT * INTO v_allocation FROM public.weekly_allocations wa WHERE wa.employee_id = auth.uid() AND wa.week_start = v_week AND wa.eligible = true;
  IF NOT FOUND OR v_allocation.remaining_balance < _amount THEN RAISE EXCEPTION 'Insufficient weekly balance'; END IF;
  UPDATE public.coupon_tokens ct SET expires_at = now() WHERE ct.employee_id = auth.uid() AND ct.redeemed_at IS NULL AND ct.expires_at > now();
  INSERT INTO public.coupon_tokens(employee_id, allocation_id, amount, week_start, expires_at)
  VALUES(auth.uid(), v_allocation.id, _amount, v_week, now() + interval '30 seconds') RETURNING * INTO v_token;
  RETURN QUERY SELECT v_token.token, v_token.expires_at;
END; $function$