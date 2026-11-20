
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const { sender_id, receiver_id, text } = await req.json();

    if (
      !sender_id ||
      !receiver_id ||
      !text?.trim() ||
      auth.user.id !== sender_id ||
      sender_id === receiver_id
    ) {
      return Response.json(
        { error: "Invalid request" },
        { status: 400, headers }
      );
    }

    const { data: host, error: hostError } = await db
      .from("profiles")
      .select("is_ai, ai_personality, name")
      .eq("user_id", receiver_id)
      .maybeSingle();

    if (hostError || !host) {
      return Response.json(
        { error: "AI host not found" },
        { status: 404, headers }
      );
    }

    if (!host.is_ai) {
      return Response.json(
        { success: true, skipped: true },
        { headers }
      );
    }

    // Founding 100 progress checks for Ciri only.
    let founding100Context = "";

    if (receiver_id === "15281081-5bab-46a6-9a54-db8683c5cd75") {
      const [profile, xDetails, contribution, application, approval] =
        await Promise.all([
          db.from("profiles")
            .select("profile_completed")
            .eq("user_id", sender_id)
            .maybeSingle(),

          db.from("founding_100_x_details")
            .select("x_username, x_profile_url, verification_status")
            .eq("user_id", sender_id)
            .maybeSingle(),

          db.from("founding_100_contributions")
            .select("contribution_type")
            .eq("user_id", sender_id)
            .order("created_at", { ascending: false })
            .limit(1),

          db.from("founding_100_applications")
            .select("application_status, x_verification_status")
            .eq("user_id", sender_id)
            .maybeSingle(),

          db.from("founding_100_approvals")
            .select("slot_number")
            .eq("user_id", sender_id)
            .maybeSingle(),
        ]);

      founding100Context = `
FOUNDING 100 DATABASE STATUS:
- Profile: ${
        profile.error
          ? "CHECK UNAVAILABLE"
          : profile.data?.profile_completed
            ? "COMPLETE"
            : "NOT COMPLETE"
      }
- X details: ${
        xDetails.error
          ? "CHECK UNAVAILABLE"
          : xDetails.data
            ? xDetails.data.verification_status.toUpperCase()
            : "NOT RECEIVED"
      }
- Live Feed contribution: ${
        contribution.error
          ? "CHECK UNAVAILABLE"
          : contribution.data?.length
            ? "RECORDED: " + contribution.data[0].contribution_type
            : "NOT RECORDED"
      }
- Application: ${
        application.error
          ? "CHECK UNAVAILABLE"
          : application.data?.application_status.toUpperCase() || "NOT SUBMITTED"
      }
- Approval: ${
        approval.error
          ? "CHECK UNAVAILABLE"
          : approval.data
            ? "APPROVED, SLOT " + approval.data.slot_number
            : "NOT APPROVED"
      }

Use these database records as the source of truth.
Guide the user one step at a time.
Never claim a step is complete unless confirmed.
Never claim X verification or approval without a matching database record.
`;

    }

    const { data: history, error: historyError } = await db
      .from("messages")
      .select("sender_id, receiver_id, text")
      .or(`and(sender_id.eq.${sender_id},receiver_id.eq.${receiver_id}),and(sender_id.eq.${receiver_id},receiver_id.eq.${sender_id})`)
      .is("event", null)
      .order("created_at", { ascending: false })
      .limit(12);

    if (historyError) {
      console.error("AI conversation history error:", historyError);
    }

    const conversation = (history || [])
      .reverse()
      .map((message) => ({
        role: message.sender_id === sender_id ? "user" : "assistant",
        content: message.text,
      }))
      .filter((message) => message.content);

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
              content: `${host.ai_personality || `You are ${host.name}, an AI host on UpCall.`}

${founding100Context}

CONVERSATION STYLE:
- Talk naturally and warmly, like a friendly host having a real-time chat.
- Respond directly to what the user just said. Do not repeat your introduction unless it is relevant.
- Do not greet the user in every reply or use generic openers such as "Hi there, I'm Ciri" repeatedly.
- Ask thoughtful follow-up questions when appropriate, but do not force a question into every response.
- Be engaging, personable, and concise. Match the user's tone.
- Treat casual conversation as casual conversation; do not turn every message into a Cirql support question.
- Never claim to be human. Stay in character as the AI host.
- If the user asks a personal or conversational question, answer naturally within your established character.`
            },
            ...conversation,
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      }
    );

    const result = await aiRes.json();

    if (!aiRes.ok) {
      console.error("AI provider error:", aiRes.status, result);
      return Response.json(
        { error: "AI provider error" },
        { status: 502, headers }
      );
    }

    const reply = result?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return Response.json(
        { error: "AI returned no reply" },
        { status: 502, headers }
      );
    }

    const { data: aiMessage, error: saveError } = await db
      .from("messages")
      .insert({
        sender_id: receiver_id,
        receiver_id: sender_id,
        text: reply,
        event: null,
      })
      .select()
      .single();

    if (saveError) {
      console.error("AI reply save error:", saveError);
      return Response.json(
        { error: "Could not save AI reply" },
        { status: 500, headers }
      );
    }

    return Response.json(
      { success: true, ai_message: aiMessage },
      { headers }
    );
  } catch (error) {
    console.error("AI reply route error:", error);
    return Response.json(
      { error: "AI reply failed" },
      { status: 500, headers }
    );
  }
}



