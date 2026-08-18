import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    "https://opencirqlproxy.vercel.app",
    "http://localhost:5173",
  ];

  const allowedOrigin = origin && allowedOrigins.includes(origin)
    ? origin
    : "https://opencirqlproxy.vercel.app";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
};

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get("origin")),
  });
}
export async function POST(req: Request) {
  try {
    const corsHeaders = getCorsHeaders(req.headers.get("origin"));
    const body = await req.json();

    const { sender_id, receiver_id, text } = body;

        // Check if receiver is an AI host
    const { data: receiver } = await supabase
      .from("profiles")
      .select("is_ai, ai_personality, name")
      .eq("user_id", receiver_id)
      .single();

    if (!sender_id || !receiver_id || !text) {
      return Response.json(
        { error: "Missing sender_id, receiver_id or text" },
        { status: 400, headers: corsHeaders }
      );
    }

    // 1. Insert message
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        sender_id,
        receiver_id,
        text,
        event: "message",
      })
      .select()
      .single();

    if (msgError) {
      console.error("Message error:", msgError);

      return Response.json(
        { error: msgError.message },
        { status: 500, headers: corsHeaders }
      );
    }

    // 2. Ensure connection exists
    const { data: existing } = await supabase
      .from("connections")
      .select("*")
      .or(
        `and(user_a.eq.${sender_id},user_b.eq.${receiver_id}),and(user_a.eq.${receiver_id},user_b.eq.${sender_id})`
      )
      .maybeSingle();

    if (!existing) {
      const { error: connError } = await supabase
        .from("connections")
        .insert({
          user_a: sender_id,
          user_b: receiver_id,
          status: "accepted",
        });

      if (connError) {
        console.error("Connection error:", connError);
      }
    }

    // 3. Sender name for notification
    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", sender_id)
      .single();

    const senderName = sender?.name || "Someone";

    // 4. Notification
    const { error: notifError } = await supabase
      .from("notifications")
      .insert({
        user_id: receiver_id,
        actor_id: sender_id,
        type: "message",
        title: "ðŸ’¬ New Message",
        body: `${senderName} sent you a message`,
        reference_id: message.id,
        is_read: false,
      });

    if (notifError) {
      console.error("Notification error:", notifError);
    }

        // 5. AI HOST RESPONSE
    if (receiver?.is_ai) {

      console.log("AI HOST DETECTED:", {
        receiver_id,
        name: receiver.name,
        is_ai: receiver.is_ai,
      });

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
                content: receiver.ai_personality,
              },
              {
                role: "user",
                content: text,
              },
            ],
            temperature: 0.7,
            max_tokens: 400,
          }),
        }
      );

      const aiData = await aiRes.json();

      console.log("GROQ STATUS:", aiRes.status);
      console.log("GROQ RESPONSE:", JSON.stringify(aiData));

      if (!aiRes.ok) {
        console.error("GROQ ERROR:", aiData);

        return Response.json(
          {
            error: "AI provider error",
            details: aiData,
          },
          {
            status: 502,
            headers: corsHeaders,
          }
        );
      }

      const reply =
        aiData?.choices?.[0]?.message?.content;

      if (!reply) {
        console.error("NO AI REPLY:", aiData);

        return Response.json(
          {
            error: "AI provider returned no reply",
            details: aiData,
          },
          {
            status: 502,
            headers: corsHeaders,
          }
        );
      }

      const { data: aiMessage, error: aiMessageError } = await supabase
        .from("messages")
        .insert({
          sender_id: receiver_id,
          receiver_id: sender_id,
          text: reply,
          event: "message",
        })
        .select()
        .single();

      if (aiMessageError) {
        console.error("AI MESSAGE INSERT ERROR:", aiMessageError);

        return Response.json(
          {
            error: "AI reply generated but could not be saved",
            details: aiMessageError.message,
          },
          {
            status: 500,
            headers: corsHeaders,
          }
        );
      }

      console.log("AI MESSAGE CREATED:", aiMessage);

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
    return Response.json(
      { success: true, message },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error("Message route crash:", err);

    return Response.json(
      { error: err.message || "Message failed" },
      { status: 500, headers: corsHeaders }
    );
  }
}






