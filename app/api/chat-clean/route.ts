import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();

  const msg = body?.messages?.at(-1)?.content || "empty";

  return NextResponse.json({
    text: "CLEAN BOT: " + msg
  });
}
