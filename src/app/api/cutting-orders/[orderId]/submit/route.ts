import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { CuttingOrderError, resubmitRecut } from "@/lib/domain/cutting-orders";

type RouteContext = { params: Promise<{ orderId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { orderId } = await context.params;
  try {
    await resubmitRecut(orderId, actor);
    return NextResponse.json({ orderId, status: "PENDING_VERIFICATION" });
  } catch (error) {
    if (error instanceof CuttingOrderError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 422;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
