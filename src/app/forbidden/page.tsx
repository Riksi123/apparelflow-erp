import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6f5] px-6 text-center text-[#14231f]">
      <div className="max-w-md">
        <p className="text-xs font-bold tracking-[0.18em] text-[#8f2e27]">ACCESS DENIED</p>
        <h1 className="mt-4 text-3xl font-semibold">This workspace is not available to your role.</h1>
        <p className="mt-3 text-sm leading-6 text-[#5e6c66]">Your assigned permissions do not allow this action.</p>
        <Link href="/" className="mt-7 inline-flex rounded-lg bg-[#164e3b] px-4 py-3 text-sm font-semibold text-white">Return to workspace</Link>
      </div>
    </main>
  );
}
