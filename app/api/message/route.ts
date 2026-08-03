import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:5173",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    console.log("=== MESSAGE ROUTE START ===");

    const body = await req.json();
    console.log("BODY:", body);

    const { sender_id, receiver_id, text } = body;

    if (!sender_id || !receiver_id || !text) {
      console.log("Missing required fields");

      return Response.json(
        { error: "Missing sender_id, receiver_id or text" },
        {
          status: 400,
          headers: corsHeaders,
        }
      );
    }

    console.log("Inserting message...");

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
      console.error("MESSAGE ERROR:", msgError);

      return Response.json(
        { error: msgError.message },
        {
          status: 500,
          headers: corsHeaders,
        }
      );
    }

    console.log("Message inserted:", message);

    console.log("Checking connection...");

    const { data: existing, error: existingError } = await supabase
      .from("connections")
      .select("*")
      .or(
        `and(user_a.eq.${sender_id},user_b.eq.${receiver_id}),and(user_a.eq.${receiver_id},user_b.eq.${sender_id})`
      )
      .maybeSingle();

    if (existingError) {
      console.error("Connection lookup error:", existingError);
    }

    if (!existing) {
      console.log("Creating connection...");

      const { error: connError } = await supabase
        .from("connections")
        .insert({
          user_a: sender_id,
          user_b: receiver_id,
          status: "accepted",
        });

      if (connError) {
        console.error("Connection insert error:", connError);
      }
    }

    console.log("Looking up sender profile...");

    const { data: sender, error: senderError } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", sender_id)
      .single();

    if (senderError) {
      console.error("Sender lookup error:", senderError);
    }

    const senderName = sender?.name ?? "Someone";

    console.log("Creating notification...");

    const { error: notifError } = await supabase
      .from("notifications")
      .insert({
        user_id: receiver_id,
        actor_id: sender_id,
        type: "message",
        title: "💬 New Message",
        body: `${senderName} sent you a message`,
        reference_id: message.id,
        is_read: false,
      });

    if (notifError) {
      console.error("Notification error:", notifError);
    }

/* ================= AI HOST ================= */

const { data: receiverProfile } = await supabase
  .from("profiles")
  .select("is_ai, ai_personality")
  .eq("user_id", receiver_id)
  .single();

if (receiverProfile?.is_ai) {

  console.log("AI HOST DETECTED");

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

  console.log("GROQ RESPONSE:", groqData);

  const aiText =
    groqData?.choices?.[0]?.message?.content ||
    "Sorry, I am having trouble replying right now.";

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

    console.log("=== MESSAGE ROUTE COMPLETE ===");

    return Response.json(
      {
        success: true,
        message,
      },
      {
        headers: corsHeaders,
      }
    );
  } catch (err) {
    console.error("FATAL MESSAGE ROUTE ERROR:", err);

    return Response.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      {
        status: 500,
        headers: corsHeaders,
      }
    );
  }
}