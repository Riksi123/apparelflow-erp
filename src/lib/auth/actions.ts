"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, clearSession } from "@/lib/auth/session";

const loginSchema = z.object({
  email: z.email().trim().toLowerCase(),
  password: z.string().min(1).max(128),
});

export type LoginState = { error?: string };

export async function loginAction(_previousState: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (!user || !(await compare(parsed.data.password, user.passwordHash))) {
    return { error: "Email or password is incorrect." };
  }

  try {
    await createSession({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
  } catch (error) {
    // Usually a missing or too-short SESSION_SECRET; surface it instead of crashing the page.
    console.error("Failed to create session:", error);
    return { error: "Sign-in is unavailable because the server's session configuration is invalid. Please contact an administrator." };
  }

  return redirect("/");
}

export async function logoutAction() {
  await clearSession();
  return redirect("/login");
}
