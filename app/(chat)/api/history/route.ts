import type { NextRequest } from "next/server";
import { auth } from "@/app/(auth)/auth";

export async function GET(request: NextRequest) {
  // TEMP FIX: DB disabled to allow app to run
  // This avoids missing getChatsByUserId errors

  return Response.json({
    chats: [],
  });
}
