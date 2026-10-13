import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, KanbanSquare, ShieldCheck, Users } from "lucide-react";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { getSession } from "@/server/request";

export default async function HomePage() {
  if (await getSession()) redirect("/app");
  const features = [
    { icon: Building2, title: "Agency → client workspaces", body: "Run every client account in its own isolated workspace, managed from one agency." },
    { icon: Users, title: "CRM built for volume", body: "Contacts, tags, custom fields, notes, tasks and a complete activity history." },
    { icon: KanbanSquare, title: "Pipelines that move", body: "Configurable stages, a drag-and-drop board, and live pipeline totals." },
    { icon: ShieldCheck, title: "Secure by default", body: "Server-side authorization, tenant isolation, and an audit trail of sensitive actions." },
  ];
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Wordmark />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/sign-up">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      <main>
        <section className="bg-navy-900">
          <div className="mx-auto max-w-6xl px-6 py-20 sm:py-24">
            <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-gold-400">Eightfold by 8limbs Inc.</p>
            <h1 className="mt-4 max-w-3xl text-[36px] leading-[1.1] font-semibold tracking-[-0.025em] text-white sm:text-[46px]">
              The operating system for agencies that manage many clients.
            </h1>
            <p className="mt-5 max-w-2xl text-[16px] leading-relaxed text-navy-100/75">
              One platform for client workspaces, contacts, and sales pipelines — with automation, communications, and websites on the roadmap.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild variant="accent" size="lg">
                <Link href="/sign-up">
                  Create your agency <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" className="border border-navy-600 bg-transparent hover:bg-navy-800">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </div>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-px overflow-hidden border-x border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-surface p-6">
              <Icon className="size-5 text-gold-600" aria-hidden />
              <h2 className="mt-3 text-[14.5px] font-semibold">{title}</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{body}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-6 py-6 text-[12.5px] text-ink-faint">© {new Date().getFullYear()} 8limbs Inc. All rights reserved.</div>
      </footer>
    </div>
  );
}
