"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction, type LoginState } from "@/lib/auth/actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <main className="grid min-h-screen place-items-center bg-[#f4f6f5] px-5 py-12 text-[#14231f]">
      <section className="w-full max-w-md rounded-2xl border border-[#dce4df] bg-white p-7 shadow-sm sm:p-9">
        <Link href="/" className="text-xs font-bold tracking-[0.16em] text-[#287256]">APPARELFLOW</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Sign in to your workspace</h1>
        <p className="mt-2 text-sm leading-6 text-[#5e6c66]">Use your assigned production account to continue.</p>

        <form action={action} className="mt-8 space-y-5">
          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold">Work email</label>
            <input id="email" name="email" type="email" autoComplete="username" required maxLength={254}
              className="w-full rounded-lg border border-[#7b8e83] bg-white px-3 py-3 text-sm text-[#14231f] shadow-sm placeholder:text-[#65736c] focus:border-[#287256] focus:outline-none focus:ring-2 focus:ring-[#287256]/20" />
          </div>
          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-semibold">Password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128}
              className="w-full rounded-lg border border-[#7b8e83] bg-white px-3 py-3 text-sm text-[#14231f] shadow-sm placeholder:text-[#65736c] focus:border-[#287256] focus:outline-none focus:ring-2 focus:ring-[#287256]/20" />
          </div>
          {state.error && <p role="alert" className="rounded-lg border border-[#e9b7b2] bg-[#fff1ef] px-3 py-2 text-sm font-medium text-[#8f2e27]">{state.error}</p>}
          <button type="submit" disabled={pending} className="w-full rounded-lg bg-[#164e3b] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#103d2e] disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="mt-7 rounded-lg bg-[#f4f6f5] p-4 text-xs leading-5 text-[#5e6c66]">
          <p className="font-bold text-[#34453e]">Demo accounts</p>
          <p className="mt-1">These accounts share the private `DEMO_PASSWORD` configured when seeding:</p>
          <ul className="mt-2 space-y-1 font-mono text-[#34453e]">
            <li>cutting.supervisor@apparelflow.local</li>
            <li>cutting.verifier@apparelflow.local</li>
            <li>sewing.supervisor@apparelflow.local</li>
          </ul>
        </div>
      </section>
    </main>
  );
}
