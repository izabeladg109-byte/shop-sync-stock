import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Boxes, Loader2, ScanBarcode } from "lucide-react";

const searchSchema = z.object({ redirect: z.string().optional() });

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Entrar — Estoque TikTok Shop" },
      {
        name: "description",
        content:
          "Acesse o ERP de controle de estoque para vendedores TikTok Shop: kits, movimentação rápida e leitura de Packing List.",
      },
      { property: "og:title", content: "Entrar — Estoque TikTok Shop" },
      {
        property: "og:description",
        content: "ERP de estoque para TikTok Shop: kits, movimentação rápida e leitura de etiquetas.",
      },
    ],
  }),
  component: AuthPage,
});

const credentials = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "A senha precisa de ao menos 6 caracteres").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState(false);

  const destination = search.redirect?.startsWith("/") ? search.redirect : "/dashboard";

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: destination, replace: true });
    });
  }, [navigate, destination]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: destination, replace: true });
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credentials.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]!.message);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      ...parsed.data,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName.trim() },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data.session) {
      navigate({ to: destination, replace: true });
      return;
    }
    setPendingConfirm(true);
    toast.success("Conta criada", { description: "Confirme o e-mail para acessar." });
  }

  async function handleReset() {
    const parsed = z.string().email().safeParse(email.trim());
    if (!parsed.success) {
      toast.error("Informe seu e-mail para recuperar a senha");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Enviamos um link de redefinição para seu e-mail");
  }

  async function handleGoogle() {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setLoading(false);
      toast.error(result.error.message);
      return;
    }
    if (result.redirected) return;
    navigate({ to: destination, replace: true });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="absolute -right-24 -top-24 size-96 rounded-full brand-gradient opacity-25 blur-3xl" />
        <div className="relative flex items-center gap-2 font-display text-lg font-semibold">
          <Boxes className="size-6 text-primary" />
          Estoque TikTok Shop
        </div>
        <div className="relative space-y-6">
          <h1 className="max-w-md font-display text-4xl leading-tight">
            Controle de estoque feito para quem vende <span className="text-brand-gradient">roupas na TikTok Shop</span>
          </h1>
          <ul className="space-y-3 text-sm text-sidebar-foreground/80">
            <li className="flex items-center gap-2">
              <ScanBarcode className="size-4 text-accent" /> Leitura de Packing List pela câmera
            </li>
            <li className="flex items-center gap-2">
              <Boxes className="size-4 text-accent" /> Unidades, kits formados e kits disponíveis
            </li>
          </ul>
        </div>
        <p className="relative text-xs text-sidebar-foreground/60">
          Dados sincronizados em tempo real entre celular e computador.
        </p>
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 font-display text-xl font-semibold lg:hidden">
            <Boxes className="size-6 text-primary" /> Estoque TikTok Shop
          </div>

          {pendingConfirm ? (
            <div className="card-elevated space-y-3 p-6">
              <h2 className="font-display text-xl">Confirme seu e-mail</h2>
              <p className="text-sm text-muted-foreground">
                Enviamos um link de confirmação para <strong>{email}</strong>. Após confirmar, volte
                aqui e faça login.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setPendingConfirm(false)}>
                Voltar ao login
              </Button>
            </div>
          ) : (
            <Tabs defaultValue="login">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">E-mail</Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Senha</Label>
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 size-4 animate-spin" />} Entrar
                  </Button>
                  <button
                    type="button"
                    onClick={handleReset}
                    className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Nome</Label>
                    <Input
                      id="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email-up">E-mail</Label>
                    <Input
                      id="email-up"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password-up">Senha</Label>
                    <Input
                      id="password-up"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="mr-2 size-4 animate-spin" />} Criar conta
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          )}

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> ou <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            Continuar com Google
          </Button>
        </div>
      </section>
    </main>
  );
}
