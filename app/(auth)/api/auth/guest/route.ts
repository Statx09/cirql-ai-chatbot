import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    guest: "disabled (stop loop)"
  });
}
