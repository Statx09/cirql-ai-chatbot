import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side client for trusted operations, such as saving AI replies.
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// Used to verify the user's Supabase access token.
const authVerifier = createClient(supabaseUrl, anonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const getCorsHeaders = (origin: string | null) => {
  const allowedOrigins = [
    "https://opencirqlproxy.vercel.app",
    "http://localhost:5173",
  ];

  const allowedOrigin =
    origin && allowedOrigins.includes(origin)
      ? origin
      : "https://opencirqlproxy.vercel.app";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
};

export async function OPTIONS(req: Request) {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(req.headers.get("origin")),
  });
}

export async function POST(req: Request) {
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));

  try {
    const authorization = req.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      return Response.json(
        { error: "Authentication required" },
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: authData, error: authError } =
      await authVerifier.auth.getUser(token);

    if (authError || !authData.user) {
      return Response.json(
        { error: "Invalid or expired session" },
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const { sender_id, receiver_id, text } = body;

    if (!sender_id || !receiver_id || !text || typeof text !== "string") {
      return Response.json(
        { error: "Missing or invalid sender_id, receiver_id or text" },
        { status: 400, headers: corsHeaders }
      );
    }

    // The authenticated user must be the sender.
    if (sender_id !== authData.user.id) {
      return Response.json(
        { error: "Sender does not match authenticated user" },
        { status: 403, headers: corsHeaders }
      );
    }

    if (!text.trim()) {
      return Response.json(
        { error: "Message cannot be empty" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Resolve a real or synthetic receiver for AI response handling.
    let { data: receiver, error: receiverError } = await supabase
      .from("profiles")
      .select("id, user_id, is_ai, ai_personality, name")
      .eq("user_id", receiver_id)
      .maybeSingle();

    if (!receiver && !receiverError) {
      const result = await supabase
        .from("profiles")
        .select("id, user_id, is_ai, ai_personality, name")
        .eq("id", receiver_id)
        .is("user_id", null)
        .maybeSingle();

      receiver = result.data;
      receiverError = result.error;
    }

    if (receiverError) {
      console.error("Receiver lookup error:", receiverError);

      return Response.json(
        { error: "Could not resolve message recipient" },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!receiver) {
      return Response.json(
        { error: "Recipient profile not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    // Call the existing billing RPC as the authenticated sender.
    // Do NOT use the service-role client for this RPC:
    // send_message() relies on auth.uid().
    const userSupabase = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: billingResult, error: billingError } =
      await userSupabase.rpc("send_message", {
        p_receiver_id: receiver_id,
        p_text: text.trim(),
      });

    if (billingError) {
      console.error("MESSAGE BILLING ERROR:", billingError);

      const message = billingError.message || "Message billing failed";

      const status = message.includes("INSUFFICIENT_BALANCE")
        ? 402
        : message.includes("RECEIVER_PROFILE_NOT_FOUND")
          ? 404
          : message.includes("NOT_AUTHENTICATED")
            ? 401
            : message.includes("INVALID_RECEIVER") ||
                message.includes("EMPTY_MESSAGE")
              ? 400
              : 500;

      return Response.json(
        { error: message },
        { status, headers: corsHeaders }
      );
    }

    if (!billingResult?.success || !billingResult?.message_id) {
      console.error("Unexpected billing RPC result:", billingResult);

      return Response.json(
        { error: "Message billing returned an unexpected result" },
        { status: 500, headers: corsHeaders }
      );
    }

    // Retrieve the exact message created by send_message().
    // Never insert the outgoing message a second time.
    const { data: message, error: messageFetchError } = await supabase
      .from("messages")
      .select("*")
      .eq("id", billingResult.message_id)
      .single();

    if (messageFetchError || !message) {
      console.error("Billed message retrieval error:", messageFetchError);

      return Response.json(
        {
          error: "Message was processed but could not be retrieved",
          message_id: billingResult.message_id,
        },
        { status: 500, headers: corsHeaders }
      );
    }

    // Preserve the existing connection behaviour.
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

    // send_message() already creates the notification for real recipients.
    // Do not insert another notification here.

    // Preserve the existing AI text response functionality.
    if (receiver.is_ai) {
      console.log("AI HOST DETECTED:", {
        receiver_id,
        name: receiver.name,
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
                content: text.trim(),
              },
            ],
            temperature: 0.7,
            max_tokens: 400,
          }),
        }
      );

      const aiData = await aiRes.json();

      if (!aiRes.ok) {
        console.error("GROQ ERROR:", aiData);

        // The user's outgoing message is already saved and billed.
        // Return it so the UI does not lose the successfully sent message.
        return Response.json(
          {
            success: true,
            message,
            charged: billingResult.charged,
            ai_error: "AI provider error",
          },
          { headers: corsHeaders }
        );
      }

      const reply = aiData?.choices?.[0]?.message?.content;

      if (!reply) {
        console.error("AI provider returned no reply:", aiData);

        return Response.json(
          {
            success: true,
            message,
            charged: billingResult.charged,
            ai_error: "AI provider returned no reply",
          },
          { headers: corsHeaders }
        );
      }

      const { data: aiMessage, error: aiMessageError } = await supabase
        .from("messages")
        .insert({
          sender_id: receiver_id,
          receiver_id: sender_id,
          text: reply,
          event: null,
        })
        .select()
        .single();

      if (aiMessageError) {
        console.error("AI MESSAGE INSERT ERROR:", aiMessageError);

        return Response.json(
          {
            success: true,
            message,
            charged: billingResult.charged,
            ai_error: "AI reply could not be saved",
          },
          { headers: corsHeaders }
        );
      }

      return Response.json(
        {
          success: true,
          message,
          ai_message: aiMessage,
          charged: billingResult.charged,
        },
        { headers: corsHeaders }
      );
    }

    return Response.json(
      {
        success: true,
        message,
        charged: billingResult.charged,
      },
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
