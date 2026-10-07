import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { SewingError, startSewing } from "@/lib/domain/sewing";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { orderId } = await context.params;
  try {
    return NextResponse.json(await startSewing(orderId, actor));
  } catch (error) {
    if (error instanceof SewingError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 422;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
