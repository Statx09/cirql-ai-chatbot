import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { from_user, to_user } = body;

    if (!from_user || !to_user) {
      return Response.json(
        { error: "Missing from_user or to_user" },
        { status: 400 }
      );
    }

    // 1. Insert wave
    const { data: wave, error: waveError } = await supabase
      .from("waves")
      .insert({
        from_user,
        to_user,
      })
      .select()
      .single();

    if (waveError) {
      console.error("Wave error:", waveError);

      return Response.json(
        { error: waveError.message },
        { status: 500 }
      );
    }

    // 2. Get sender name (for notification text)
    const { data: sender } = await supabase
      .from("profiles")
      .select("name")
      .eq("user_id", from_user)
      .single();

    const senderName = sender?.name || "Someone";

    // 3. Create notification for receiver
    const { error: notifError } = await supabase
      .from("notifications")
      .insert({
        user_id: to_user,
        actor_id: from_user,
        type: "wave",
        title: "👋 New Wave",
        body: `${senderName} waved at you`,
        reference_id: wave.id,
        is_read: false,
      });

    if (notifError) {
      console.error("Notification error:", notifError);
    }

    return Response.json({
      success: true,
      wave,
    });
  } catch (err: any) {
    console.error("Wave API crash:", err);

    return Response.json(
      { error: err.message || "Wave failed" },
      { status: 500 }
    );
  }
}