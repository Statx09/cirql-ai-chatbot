import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { sender_id, receiver_id, text } = body;

    if (!sender_id || !receiver_id || !text) {
      return Response.json(
        { error: "Missing sender_id, receiver_id or text" },
        { status: 400 }
      );
    }

    // 1. Insert message
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
      console.error("Message error:", msgError);

      return Response.json(
        { error: msgError.message },
        { status: 500 }
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
        title: "💬 New Message",
        body: `${senderName} sent you a message`,
        reference_id: message.id,
        is_read: false,
      });

    if (notifError) {
      console.error("Notification error:", notifError);
    }

    return Response.json({
      success: true,
      message,
    });
  } catch (err: any) {
    console.error("Message route crash:", err);

    return Response.json(
      { error: err.message || "Message failed" },
      { status: 500 }
    );
  }
}
