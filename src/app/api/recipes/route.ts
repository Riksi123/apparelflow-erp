import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { CuttingOrderError, listAvailableRecipes } from "@/lib/domain/cutting-orders";

export async function GET() {
  const actor = await getSessionUser();
  if (!actor) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  try {
    return NextResponse.json(await listAvailableRecipes(actor));
  } catch (error) {
    if (error instanceof CuttingOrderError && error.code === "FORBIDDEN") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }
}
