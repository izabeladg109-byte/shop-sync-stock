import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Estoque TikTok Shop" },
      { name: "description", content: "Defina uma nova senha para acessar seu ERP de estoque." },
      { property: "og:title", content: "Redefinir senha — Estoque TikTok Shop" },
      { property: "og:description", content: "Defina uma nova senha de acesso." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) setReady(true);
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha precisa de ao menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não conferem");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Senha atualizada");
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form onSubmit={submit} className="card-elevated w-full max-w-sm space-y-4 p-6">
        <h1 className="font-display text-xl">Definir nova senha</h1>
        {!ready && (
          <p className="text-sm text-muted-foreground">
            Abra esta página pelo link enviado no seu e-mail de recuperação.
          </p>
        )}
        <div className="space-y-2">
          <Label htmlFor="new">Nova senha</Label>
          <Input
            id="new"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          Salvar nova senha
        </Button>
      </form>
    </main>
  );
}
