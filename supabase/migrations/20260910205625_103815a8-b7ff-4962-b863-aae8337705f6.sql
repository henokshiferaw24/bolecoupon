CREATE TYPE public.app_role AS ENUM ('super_admin', 'employee', 'cashier', 'auditor');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  employee_number text UNIQUE,
  department text,
  must_change_password boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(), 'super_admin')) WITH CHECK (id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins create profiles" ON public.profiles FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins delete profiles" ON public.profiles FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users view own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.weekly_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  approved_amount integer NOT NULL DEFAULT 200 CHECK (approved_amount BETWEEN 0 AND 200 AND approved_amount % 40 = 0),
  remaining_balance integer NOT NULL DEFAULT 200 CHECK (remaining_balance BETWEEN 0 AND 200 AND remaining_balance % 40 = 0),
  eligible boolean NOT NULL DEFAULT true,
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, week_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_allocations TO authenticated;
GRANT ALL ON public.weekly_allocations TO service_role;
ALTER TABLE public.weekly_allocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees view own allocations" ON public.weekly_allocations FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'auditor') OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Admins manage allocations" ON public.weekly_allocations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'super_admin')) WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.coupon_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  allocation_id uuid NOT NULL REFERENCES public.weekly_allocations(id) ON DELETE CASCADE,
  amount integer NOT NULL CHECK (amount IN (40,80,120,160,200)),
  week_start date NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  redeemed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.coupon_tokens TO authenticated;
GRANT ALL ON public.coupon_tokens TO service_role;
ALTER TABLE public.coupon_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Employees view own tokens" ON public.coupon_tokens FOR SELECT TO authenticated USING (employee_id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Employees create own tokens" ON public.coupon_tokens FOR INSERT TO authenticated WITH CHECK (employee_id = auth.uid() AND redeemed_at IS NULL);

CREATE TABLE public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id),
  cashier_id uuid NOT NULL REFERENCES public.profiles(id),
  allocation_id uuid NOT NULL REFERENCES public.weekly_allocations(id),
  token_id uuid NOT NULL UNIQUE REFERENCES public.coupon_tokens(id),
  amount integer NOT NULL CHECK (amount IN (40,80,120,160,200)),
  redeemed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.redemptions TO authenticated;
GRANT ALL ON public.redemptions TO service_role;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authorized users view redemptions" ON public.redemptions FOR SELECT TO authenticated USING (employee_id = auth.uid() OR cashier_id = auth.uid() OR public.has_role(auth.uid(), 'auditor') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TABLE public.audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auditors and admins view audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'auditor') OR public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_allocations_updated_at BEFORE UPDATE ON public.weekly_allocations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_coupon_token(_amount integer)
RETURNS TABLE(token text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week date := date_trunc('week', now() AT TIME ZONE 'Africa/Addis_Ababa')::date;
  v_allocation public.weekly_allocations;
  v_token public.coupon_tokens;
BEGIN
  IF EXTRACT(ISODOW FROM now() AT TIME ZONE 'Africa/Addis_Ababa') > 5 THEN RAISE EXCEPTION 'Coupons are available Monday through Friday only'; END IF;
  IF _amount NOT IN (40,80,120,160,200) THEN RAISE EXCEPTION 'Invalid coupon amount'; END IF;
  SELECT * INTO v_allocation FROM public.weekly_allocations WHERE employee_id = auth.uid() AND week_start = v_week AND eligible = true;
  IF NOT FOUND OR v_allocation.remaining_balance < _amount THEN RAISE EXCEPTION 'Insufficient weekly balance'; END IF;
  UPDATE public.coupon_tokens SET expires_at = now() WHERE employee_id = auth.uid() AND redeemed_at IS NULL AND expires_at > now();
  INSERT INTO public.coupon_tokens(employee_id, allocation_id, amount, week_start, expires_at)
  VALUES(auth.uid(), v_allocation.id, _amount, v_week, now() + interval '5 minutes') RETURNING * INTO v_token;
  RETURN QUERY SELECT v_token.token, v_token.expires_at;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_coupon_token(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_coupon(_token text)
RETURNS TABLE(employee_name text, amount integer, remaining_balance integer, redeemed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_coupon public.coupon_tokens;
  v_name text;
  v_remaining integer;
  v_now timestamptz := now();
BEGIN
  IF NOT public.has_role(auth.uid(), 'cashier') THEN RAISE EXCEPTION 'Cashier access required'; END IF;
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
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text) TO authenticated;

CREATE INDEX weekly_allocations_employee_week_idx ON public.weekly_allocations(employee_id, week_start);
CREATE INDEX coupon_tokens_token_idx ON public.coupon_tokens(token);
CREATE INDEX redemptions_redeemed_at_idx ON public.redemptions(redeemed_at DESC);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs(created_at DESC);