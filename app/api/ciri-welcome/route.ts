
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CIRI_ID = "15281081-5bab-46a6-9a54-db8683c5cd75";

const authClient = createClient(url, anonKey);
const db = createClient(url, serviceKey);

function cors(origin: string | null) {
  const allowed = [
    "https://opencirqlproxy.vercel.app",
    "https://joincirql.vercel.app",
    "http://localhost:5173",
  ];

  return {
    "Access-Control-Allow-Origin":
      origin && allowed.includes(origin)
        ? origin
        : "https://opencirqlproxy.vercel.app",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: cors(req.headers.get("origin")),
  });
}

export async function POST(req: Request) {
  const headers = cors(req.headers.get("origin"));

  try {
    const token = req.headers
      .get("authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401, headers }
      );
    }

    const { data: auth, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !auth.user) {
      return Response.json(
        { error: "Invalid session" },
        { status: 401, headers }
      );
    }

    const userId = auth.user.id;

    if (userId === CIRI_ID) {
      return Response.json(
        { error: "Invalid recipient" },
        { status: 400, headers }
      );
    }

    const { data: ciri, error: ciriError } = await db
      .from("profiles")
      .select("user_id, name, is_ai, ai_personality")
      .eq("user_id", CIRI_ID)
      .maybeSingle();

    if (ciriError || !ciri || !ciri.is_ai || ciri.name !== "Ciri") {
      console.error("Ciri profile check failed:", ciriError);
      return Response.json(
        { error: "Ciri is unavailable" },
        { status: 500, headers }
      );
    }

    const { data: profile, error: profileError } = await db
      .from("profiles")
      .select("name")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      return Response.json(
        { error: "Could not load user profile" },
        { status: 500, headers }
      );
    }

    async function hasConversation() {
      const { data, error } = await db
        .from("messages")
        .select("id")
        .or(
          `and(sender_id.eq.${userId},receiver_id.eq.${CIRI_ID}),and(sender_id.eq.${CIRI_ID},receiver_id.eq.${userId})`
        )
        .is("event", null)
        .limit(1);

      if (error) throw error;
      return Boolean(data?.length);
    }

    if (await hasConversation()) {
      return Response.json(
        { success: true, skipped: true, reason: "Conversation already exists" },
        { headers }
      );
    }

    const displayName = profile?.name?.trim() || "there";

    const aiRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: `${ciri.ai_personality || "You are Ciri, the official AI Host for Cirql."}

You are initiating the first conversation with a newly arrived Cirql user.
Write one warm, natural, concise welcome addressed to ${displayName}.
Briefly introduce yourself as Ciri, the AI guide for Cirql.
Offer help discovering people and using Cirql features.
Sound friendly and conversational, but never claim to be human.
Do not mention payments unless the user asks.
Keep it to 2-4 short sentences and optionally one gentle question.`,
            },
            {
              role: "user",
              content: `Write your first welcome message to ${displayName}.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 180,
        }),
      }
    );

    const result = await aiRes.json();

    if (!aiRes.ok) {
      console.error("Ciri welcome AI error:", aiRes.status, result);
      return Response.json(
        { error: "Could not generate Ciri welcome" },
        { status: 502, headers }
      );
    }

    const welcome = result?.choices?.[0]?.message?.content?.trim();

    if (!welcome) {
      return Response.json(
        { error: "Ciri returned no welcome" },
        { status: 502, headers }
      );
    }

    if (await hasConversation()) {
      return Response.json(
        { success: true, skipped: true, reason: "Conversation already exists" },
        { headers }
      );
    }

    const { data: message, error: saveError } = await db
      .from("messages")
      .insert({
        sender_id: CIRI_ID,
        receiver_id: userId,
        text: welcome,
        event: null,
        payload: { type: "ciri_welcome", version: 1 },
      })
      .select()
      .single();

    if (saveError) {
      console.error("Ciri welcome save error:", saveError);
      return Response.json(
        { error: "Could not save Ciri welcome" },
        { status: 500, headers }
      );
    }

    return Response.json(
      { success: true, ai_message: message },
      { headers }
    );
  } catch (error) {
    console.error("Ciri welcome route error:", error);
    return Response.json(
      { error: "Ciri welcome failed" },
      { status: 500, headers }
    );
  }
}
