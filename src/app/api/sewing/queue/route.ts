import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { listSewingQueue, SewingError } from "@/lib/domain/sewing";

export async function GET() {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json(await listSewingQueue(actor));
  } catch (error) {
    if (error instanceof SewingError && error.code === "FORBIDDEN") return NextResponse.json({ error: error.message }, { status: 403 });
    throw error;
  }
}
