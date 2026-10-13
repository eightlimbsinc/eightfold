import { Sidebar, type SidebarProps } from "./sidebar";
import { Topbar, type TopbarProps } from "./topbar";

export function AppShell({ sidebar, topbar, children }: { sidebar: SidebarProps; topbar: Omit<TopbarProps, "sidebar">; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 lg:block">
        <Sidebar {...sidebar} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar {...topbar} sidebar={sidebar} />
        <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
