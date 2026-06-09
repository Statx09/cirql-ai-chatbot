import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { from_user, to_user } = await req.json();

    if (!from_user || !to_user) {
      return Response.json({ error: "Missing users" }, { status: 400 });
    }

    const { data: connection, error } = await supabase
      .from("connections")
      .insert({
        user_a: from_user,
        user_b: to_user,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", from_user)
      .single();

    const senderName = sender?.name || "Someone";

    await supabase.from("notifications").insert({
      user_id: to_user,
      actor_id: from_user,
      type: "connect",
      title: "?? New Connection Request",
      body: ${senderName} wants to connect with you,
      reference_id: connection.id,
      is_read: false,
    });

    return Response.json({ success: true, connection });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
