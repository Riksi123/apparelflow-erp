import Link from "next/link";
import { UserRole } from "@prisma/client";
import { getSessionUser } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";

const workspaces = [
  {
    number: "01",
    title: "Cutting operations",
    description: "Prepare production batches and track their progress.",
    role: "Cutting supervisor",
    href: "/cutting",
  },
  {
    number: "02",
    title: "Verification terminal",
    description: "Count every recipe component before a batch can pass QC.",
    role: "Cutting verifier",
    href: "/verification",
  },
  {
    number: "03",
    title: "Sewing floor",
    description: "Receive approved batches with their verification audit.",
    role: "Sewing supervisor",
    href: "/sewing",
  },
];

const roleLabels: Record<UserRole, string> = {
  CUTTING_SUPERVISOR: "Cutting supervisor",
  CUTTING_VERIFIER: "Cutting verifier",
  SEWING_SUPERVISOR: "Sewing supervisor",
};

export default async function Home() {
  const user = await getSessionUser();
  return (
    <main className="min-h-screen bg-[#f4f6f5] text-[#14231f]">
      <header className="border-b border-[#dce4df] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
          <a href="#home" className="flex items-center gap-3" aria-label="ApparelFlow home">
            <span className="grid size-10 place-items-center rounded-xl bg-[#164e3b] text-lg font-bold text-white">A</span>
            <span>
              <span className="block text-sm font-bold tracking-[0.12em]">APPARELFLOW</span>
              <span className="block text-xs text-[#63726c]">Production operations</span>
            </span>
          </a>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="hidden text-right sm:block"><span className="block text-sm font-semibold">{user.fullName}</span><span className="block text-xs text-[#63726c]">{roleLabels[user.role]}</span></span>
              <form action={logoutAction}><button className="rounded-lg border border-[#b9c7bf] px-3 py-2 text-xs font-semibold hover:bg-[#f4f6f5]">Sign out</button></form>
            </div>
          ) : (
            <Link href="/login" className="rounded-lg bg-[#164e3b] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#103d2e]">Sign in</Link>
          )}
        </div>
      </header>

      <section id="home" className="mx-auto max-w-7xl px-6 pb-16 pt-12 lg:px-10 lg:pt-20">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
          <div>
            <p className="mb-5 text-xs font-bold tracking-[0.2em] text-[#287256]">CUTTING QUALITY GATE</p>
            <h1 className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              Every piece counted.<br />Every batch accounted for.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-[#5e6c66] sm:text-lg">
              A focused production checkpoint for cutting, verification, and a controlled handoff to the sewing floor.
            </p>
          </div>

          <aside className="rounded-2xl border border-[#dce4df] bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[#718079]">GATEKEEPER STATUS</p>
                <p className="mt-2 text-xl font-semibold">Verification required</p>
              </div>
              <span className="rounded-lg bg-[#fff5df] px-3 py-2 text-xs font-bold text-[#805b13]">QC GATE</span>
            </div>
            <div className="mt-6 border-t border-[#e8eeea] pt-5">
              <p className="text-sm leading-6 text-[#5e6c66]">
                Only batches signed off by an authorized verifier are released to sewing.
              </p>
              <div className="mt-5 flex items-center gap-2" aria-label="Workflow: cutting, verification, sewing">
                <span className="h-1.5 flex-1 rounded-full bg-[#287256]" />
                <span className="h-1.5 flex-1 rounded-full bg-[#d6a43a]" />
                <span className="h-1.5 flex-1 rounded-full bg-[#dce4df]" />
              </div>
              <div className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-[#718079]">
                <span>Cutting</span><span>Verify</span><span>Sewing</span>
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-14 flex items-end justify-between border-b border-[#dce4df] pb-4">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-[#718079]">WORKSPACES</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">Production teams</h2>
          </div>
          <p className="hidden text-sm text-[#718079] sm:block">Role-based access · Persistent production records</p>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {workspaces.map((workspace) => (
            <article key={workspace.number} className="group rounded-2xl border border-[#dce4df] bg-white p-6 transition hover:border-[#97b5a5] hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold tracking-[0.16em] text-[#8a9891]">{workspace.number}</span>
                <span className="grid size-9 place-items-center rounded-full border border-[#dce4df] text-[#287256] transition group-hover:bg-[#164e3b] group-hover:text-white" aria-hidden="true">↗</span>
              </div>
              <h3 className="mt-8 text-xl font-semibold">{workspace.title}</h3>
              <p className="mt-2 min-h-12 text-sm leading-6 text-[#64726c]">{workspace.description}</p>
              <div className="mt-6 border-t border-[#e8eeea] pt-4 text-xs font-semibold text-[#287256]">{workspace.role}</div>
              {user && (
                <Link href={workspace.href} className="mt-5 inline-flex text-sm font-semibold text-[#287256] hover:underline">
                  Open workspace <span aria-hidden="true" className="ml-1">↗</span>
                </Link>
              )}
              {!user && <Link href="/login" className="mt-5 inline-flex text-sm font-semibold text-[#287256] hover:underline">Sign in to continue <span aria-hidden="true" className="ml-1">↗</span></Link>}
            </article>
          ))}
        </div>
      </section>
      <footer className="border-t border-[#dce4df] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-5 text-xs text-[#718079] sm:flex-row sm:items-center sm:justify-between lg:px-10">
          <span>ApparelFlow · Production Batch Verification</span>
          <span>Workspace foundation</span>
        </div>
      </footer>
    </main>
  );
}
