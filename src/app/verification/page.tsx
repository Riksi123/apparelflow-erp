import Link from "next/link";
import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth/session";
import { VerificationWorkspace } from "@/components/verification/workspace";

export default async function VerificationPage() {
  await requireRole(UserRole.CUTTING_VERIFIER);
  return (
    <main className="min-h-screen bg-[#f4f6f5] px-5 py-8 text-[#14231f] sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="text-sm font-semibold text-[#287256] hover:underline">← ApparelFlow home</Link>
        <div className="mt-8">
          <p className="text-xs font-bold tracking-[0.18em] text-[#287256]">CUTTING VERIFIER</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Verification terminal</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5e6c66]">Count every component. Shortages block approval at the server gate.</p>
        </div>
        <div className="mt-8"><VerificationWorkspace /></div>
      </div>
    </main>
  );
}
