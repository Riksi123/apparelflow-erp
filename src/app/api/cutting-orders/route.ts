import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  createCuttingOrder,
  CuttingOrderError,
  listCuttingOrders,
} from "@/lib/domain/cutting-orders";

export async function GET() {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    return NextResponse.json(await listCuttingOrders(actor));
  } catch (error) {
    if (error instanceof CuttingOrderError && error.code === "FORBIDDEN") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  try {
    const order = await createCuttingOrder(body, actor);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof CuttingOrderError) {
      const status = error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : 422;
      return NextResponse.json({ error: error.message }, { status });
    }
    throw error;
  }
}
