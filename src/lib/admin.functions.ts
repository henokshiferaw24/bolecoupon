import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const bootstrapAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  if ((count ?? 0) > 0) return { ready: true };
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email: "admin@bole.local", password: "Admin@123", email_confirm: true });
  if (error && !error.message.toLowerCase().includes("already")) throw error;
  let userId = data.user?.id;
  if (!userId) {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    userId = users.users.find(user => user.email === "admin@bole.local")?.id;
  }
  if (!userId) throw new Error("Unable to initialize administrator");
  await supabaseAdmin.from("profiles").upsert({ id: userId, username: "admin", display_name: "Super Admin", must_change_password: true });
  await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "super_admin" });
  return { ready: true };
});

type AccountInput = { username: string; displayName: string; role: "employee" | "cashier" | "auditor"; employeeNumber?: string; department?: string; temporaryPassword: string };
export const createAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { accounts: AccountInput[] }) => input)
  .handler(async ({ data, context }) => {
    const { data: role } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "super_admin").maybeSingle();
    if (!role) throw new Error("Super Admin access required");
    if (data.accounts.length > 2000) throw new Error("Maximum 2,000 accounts per upload");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results = [];
    for (const account of data.accounts) {
      const username = account.username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email: `${username}@bole.local`, password: account.temporaryPassword, email_confirm: true });
      if (error || !created.user) { results.push({ username, ok: false, message: error?.message ?? "Could not create" }); continue; }
      await supabaseAdmin.from("profiles").insert({ id: created.user.id, username, display_name: account.displayName, employee_number: account.employeeNumber || null, department: account.department || null, must_change_password: true });
      await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: account.role });
      results.push({ username, ok: true, message: "Created" });
    }
    return results;
  });