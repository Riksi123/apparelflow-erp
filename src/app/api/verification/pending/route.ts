import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listPendingVerifications, VerificationError } from "@/lib/domain/verification";

export async function GET() {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await listPendingVerifications(actor));
  } catch (error) {
    if (error instanceof VerificationError && error.code === "FORBIDDEN") return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
