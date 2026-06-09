import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return Response.json({ error: "Missing user_id" }, { status: 400 });
    }

    // 🔥 fetch ALL notification types properly
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // ✅ NORMALIZE INTO REAL APP EVENTS
    const notifications = (data || []).map((n) => {
      return {
        id: n.id,
        type: n.type || "system", // wave | message | system
        message:
          n.message ||
          (n.type === "wave"
            ? "👋 Someone waved at you"
            : n.type === "message"
            ? "💬 New message"
            : "🔔 Notification"),
        from_user: n.from_user,
        created_at: n.created_at,
        read: n.read || false,
      };
    });

    return Response.json({ notifications });
  } catch (err) {
    return Response.json(
      { error: err.message || "Failed" },
      { status: 500 }
    );
  }
}
