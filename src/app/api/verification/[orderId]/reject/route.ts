import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { rejectVerification, VerificationError } from "@/lib/domain/verification";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { orderId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  try {
    return NextResponse.json(await rejectVerification(orderId, body, actor));
  } catch (error) {
    if (error instanceof VerificationError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 422;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
