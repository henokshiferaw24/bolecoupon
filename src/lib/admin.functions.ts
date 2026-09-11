import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type AccountInput = { username: string; displayName: string; role: "employee" | "cashier" | "auditor"; employeeNumber?: string; department?: string; temporaryPassword: string };
export const createAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accounts: AccountInput[] }) => input)
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "super_admin").maybeSingle();
    if (!role) throw new Error("Super Admin access required");
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