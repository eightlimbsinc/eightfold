import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      <aside className="relative hidden overflow-hidden bg-navy-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <OctagramPattern />
        <Link href="/" className="relative">
          <Wordmark inverted />
        </Link>
        <div className="relative max-w-md">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-gold-400">Agency operating system</p>
          <p className="mt-3 text-[28px] leading-tight font-semibold tracking-[-0.02em] text-white">
            Every client, contact, and deal — in one disciplined workspace.
          </p>
          <p className="mt-4 text-[14px] leading-relaxed text-navy-100/70">
            Eightfold brings CRM, pipelines, and client workspaces together for agencies that manage many accounts at once.
          </p>
        </div>
        <p className="relative text-[12px] text-navy-100/50">© {new Date().getFullYear()} 8limbs Inc.</p>
      </aside>
      <main className="flex flex-col justify-center bg-surface px-6 py-12 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <Link href="/" className="mb-10 inline-block lg:hidden">
            <Wordmark />
          </Link>
          {children}
        </div>
      </main>
    </div>
  );
}

function OctagramPattern() {
  return (
    <svg className="absolute -right-24 -bottom-24 h-[520px] w-[520px] text-navy-700" viewBox="0 0 200 200" aria-hidden>
      {[90, 70, 50, 30].map((s, i) => (
        <g key={s} fill="none" stroke="currentColor" strokeWidth={i === 0 ? 0.6 : 0.5} opacity={1 - i * 0.15}>
          <rect x={100 - s / 2} y={100 - s / 2} width={s} height={s} />
          <rect x={100 - s / 2} y={100 - s / 2} width={s} height={s} transform="rotate(45 100 100)" stroke="var(--color-gold-600)" opacity="0.35" />
        </g>
      ))}
    </svg>
  );
}
