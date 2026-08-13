import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeSync } from "@/lib/erp";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Boxes,
  ClipboardList,
  History,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Menu,
  Moon,
  ScanBarcode,
  Settings,
  Sun,
  Tags,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: AppLayout,
});

const nav = [
  { to: "/dashboard", label: "Painel", icon: LayoutDashboard },
  { to: "/estoque", label: "Estoque", icon: Boxes },
  { to: "/movimentacao", label: "Movimentação", icon: ClipboardList },
  { to: "/sugestoes", label: "Sugestões", icon: Lightbulb },
  { to: "/leitura", label: "Leitura Packing List", icon: ScanBarcode },
  { to: "/cadastros", label: "Cadastros", icon: Tags },
  { to: "/historico", label: "Histórico", icon: History },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;



function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="space-y-1">
      {nav.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          activeProps={{
            className:
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold bg-sidebar-accent text-sidebar-accent-foreground",
          }}
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function AppLayout() {
  useRealtimeSync();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden border-r border-sidebar-border bg-sidebar p-4 lg:flex lg:flex-col">
        <div className="mb-6 flex items-center gap-2 px-2 font-display text-base font-semibold text-sidebar-foreground">
          <Boxes className="size-5 text-primary" />
          Estoque TikTok
        </div>
        <NavLinks />
        <div className="mt-auto space-y-1 pt-4">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={toggle}>
            {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            {theme === "dark" ? "Modo escuro" : "Modo claro"}
          </Button>
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={signOut}>
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-card/80 px-4 py-3 backdrop-blur lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-4">
              <div className="mb-6 flex items-center gap-2 font-display font-semibold">
                <Boxes className="size-5 text-primary" /> Estoque TikTok
              </div>
              <NavLinks onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-display text-sm font-semibold">Estoque TikTok Shop</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Alternar tema">
              {theme === "dark" ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sair">
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
