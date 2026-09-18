import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AccountInput = { username: string; displayName: string; role: "employee" | "cashier" | "auditor"; employeeNumber?: string; department?: string; temporaryPassword: string };

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "super_admin").maybeSingle();
  if (!role) throw new Error("Super Admin access required");
}

export const createAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accounts: AccountInput[] }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.accounts.length > 2000) throw new Error("Maximum 2,000 accounts per upload");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const createAccount = async (account: AccountInput) => {
      const username = account.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email: `${username}@bole.local`, password: account.temporaryPassword, email_confirm: true });
      if (error || !created.user) return { username, ok: false, message: error?.message ?? "Could not create" };
      await supabaseAdmin.from("profiles").insert({ id: created.user.id, username, display_name: account.displayName, employee_number: account.employeeNumber || null, department: account.department || null, must_change_password: true });
      await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: account.role });
      return { username, ok: true, message: "Created" };
    };
    const results = [];
    for (let index = 0; index < data.accounts.length; index += 20) {
      results.push(...await Promise.all(data.accounts.slice(index, index + 20).map(createAccount)));
    }
    return results;
  });

export const listAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, username, display_name, employee_number, department, is_active, must_change_password").order("display_name"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
    ]);
    const roleById = new Map((roles ?? []).map((r) => [r.user_id, r.role as string]));
    return (profiles ?? []).map((p) => ({ ...p, role: roleById.get(p.id) ?? "unknown" }));
  });

export const resetAccountPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; temporaryPassword: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.temporaryPassword.trim().length < 8) throw new Error("The temporary password must be at least 8 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.temporaryPassword, email_confirm: true });
    if (error) throw new Error(/not found/i.test(error.message) ? "This person no longer has a sign-in account. Delete the record and create the account again." : error.message);
    await supabaseAdmin.from("profiles").update({ must_change_password: data.userId !== context.userId }).eq("id", data.userId);
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("redemptions").select("id", { count: "exact", head: true }).eq("employee_id", data.userId);
    if (count && count > 0) throw new Error("This account has redemption history and cannot be deleted. Deactivate it instead.");
    await supabaseAdmin.from("coupon_tokens").update({ expires_at: new Date().toISOString() }).eq("employee_id", data.userId).is("redeemed_at", null);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error && !/not found/i.test(error.message)) throw new Error(error.message);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("profiles").delete().eq("id", data.userId);
    return { ok: true };
  });

export const setAccountActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; isActive: boolean }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ is_active: data.isActive }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateOwnUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const username = data.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    if (username.length < 3) throw new Error("Choose a username with at least 3 letters or numbers");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken } = await supabaseAdmin.from("profiles").select("id").eq("username", username).maybeSingle();
    if (taken && taken.id !== context.userId) throw new Error("That username is already taken");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { email: `${username}@bole.local`, email_confirm: true });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ username }).eq("id", context.userId);
    return { username };
  });
