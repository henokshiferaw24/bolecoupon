import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LogIn, ShieldCheck, Utensils } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "Sign in | Bole Digital Coupons" },
    { name: "description", content: "Sign in to manage and redeem Bole employee meal coupons." },
    { property: "og:title", content: "Bole Digital Coupons" },
    { property: "og:description", content: "Secure meal coupon management for Bole employees." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ]}),
  component: Index,
});

// IMPORTANT: Replace this placeholder. See ./README.md for routing conventions.
function Index() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError("");
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email: `${username.trim().toLowerCase()}@bole.local`, password });
      if (authError) throw authError;
      await navigate({ to: "/dashboard" });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed"); }
    finally { setLoading(false); }
  }
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.15fr_.85fr]">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-lg font-bold"><span className="grid size-10 place-items-center rounded-md bg-primary-foreground/15"><Utensils /></span>Bole Digital Coupons</div>
        <div className="max-w-xl"><p className="mb-4 text-sm font-semibold uppercase opacity-75">Cafeteria access, simplified</p><h1 className="text-6xl font-extrabold leading-tight">A better way to serve every meal.</h1><p className="mt-6 max-w-md text-lg leading-8 opacity-80">Secure weekly allowances, instant QR redemption, and accountable reporting for the whole organization.</p></div>
        <div className="flex gap-6 text-sm opacity-75"><span>2,000 employees</span><span>•</span><span>Fast, paperless service</span></div>
      </section>
      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-10 lg:hidden"><div className="flex items-center gap-3 text-lg font-bold"><span className="grid size-10 place-items-center rounded-md bg-primary text-primary-foreground"><Utensils /></span>Bole Digital Coupons</div></div>
          <div className="mb-8"><div className="mb-5 grid size-12 place-items-center rounded-md bg-secondary text-primary"><ShieldCheck /></div><h2 className="text-3xl font-extrabold">Welcome back</h2><p className="mt-2 text-muted-foreground">Use the credentials issued by your administrator.</p></div>
          <form onSubmit={signIn} className="space-y-5">
            <label className="block text-sm font-semibold">Username<Input className="mt-2 h-12" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required /></label>
            <label className="block text-sm font-semibold">Password<Input className="mt-2 h-12" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
            {error && <p className="rounded-md border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
            <Button className="h-12 w-full text-base" disabled={loading}><LogIn />{loading ? "Signing in…" : "Sign in"}</Button>
          </form>
          <p className="mt-8 text-center text-xs text-muted-foreground">Accounts are created and managed by the Super Admin.</p>
        </div>
      </section>
    </main>
  );
}
