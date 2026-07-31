import { createClient } from "@supabase/supabase-js";

/* ================= SUPABASE ================= */
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/* ================= CORS ================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/* ================= OPTIONS ================= */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: corsHeaders,
  });
}

/* ================= ROUTE ================= */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { sender_id, receiver_id, text } = body;

    if (!sender_id || !receiver_id || !text) {
      return Response.json(
        { error: "Missing sender_id, receiver_id or text" },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    /* ================= INSERT USER MESSAGE ================= */

    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        sender_id,
        receiver_id,
        text,
      })
      .select()
      .single();

    if (msgError) {
      console.error(msgError);

      return Response.json(
        { error: msgError.message },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    /* ================= ENSURE CONNECTION ================= */

    const { data: existing } = await supabase
      .from("connections")
      .select("*")
      .or(
        `and(user_a.eq.${sender_id},user_b.eq.${receiver_id}),and(user_a.eq.${receiver_id},user_b.eq.${sender_id})`
      )
      .maybeSingle();

    if (!existing) {
      await supabase.from("connections").insert({
        user_a: sender_id,
        user_b: receiver_id,
        status: "accepted",
      });
    }

    /* ================= NOTIFICATION ================= */

    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", sender_id)
      .single();

    await supabase.from("notifications").insert({
      user_id: receiver_id,
      actor_id: sender_id,
      type: "message",
      title: "💬 New Message",
      body: `${sender?.name || "Someone"} sent you a message`,
      reference_id: message.id,
      is_read: false,
    });

    /* ================= AI HOST ================= */

    const { data: receiverProfile } = await supabase
      .from("profiles")
      .select("is_ai, ai_personality")
      .eq("user_id", receiver_id)
      .single();

    if (receiverProfile?.is_ai) {
    const groqResponse = await fetch(
  "https://api.groq.com/openai/v1/chat/completions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",

      messages: [
        {
          role: "system",
          content: receiverProfile.ai_personality,
        },
        {
          role: "user",
          content: text,
        },
      ],

      temperature: 0.85,
      max_tokens: 400,
    }),
  }
);

const groqData = await groqResponse.json();

const aiText =
  groqData?.choices?.[0]?.message?.content ||
  "Sorry, I'm having trouble replying right now.";

      const { data: aiMessage } = await supabase
        .from("messages")
        .insert({
          sender_id: receiver_id,
          receiver_id: sender_id,
          text: aiText,
        })
        .select()
        .single();

      return Response.json(
        {
          success: true,
          message,
          ai_message: aiMessage,
        },
        {
          headers: corsHeaders,
        }
      );
    }

    /* ================= HUMAN MESSAGE ================= */

    return Response.json(
      {
        success: true,
        message,
      },
      {
        headers: corsHeaders,
      }
    );
  } catch (err: any) {
    console.error(err);

    return Response.json(
      {
        error: err.message || "Unknown server error",
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}
