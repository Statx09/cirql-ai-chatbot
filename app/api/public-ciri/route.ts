
import { createClient } from "@supabase/supabase-js";
import { createClient as createRedisClient } from "redis";

export const runtime = "nodejs";

const CIRI_ID = "15281081-5bab-46a6-9a54-db8683c5cd75";
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 12;
const RATE_LIMIT = 10;
const RATE_WINDOW_SECONDS = 60;

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

let redisClient: ReturnType<typeof createRedisClient> | null = null;
let redisConnectPromise: Promise<unknown> | null = null;

const localLimits = new Map<string, { count: number; resetAt: number }>();

async function checkRateLimit(ip: string): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    if (!redisClient) {
      redisClient = createRedisClient({ url: redisUrl });
      redisClient.on("error", (error) => {
        console.error("Guest Ciri Redis error:", error);
      });
    }

    if (!redisClient.isOpen) {
      if (!redisConnectPromise) {
        redisConnectPromise = redisClient.connect().finally(() => {
          redisConnectPromise = null;
        });
      }
      await redisConnectPromise;
    }

    const count = Number(
      await redisClient.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return count",
        {
          keys: [`public-ciri:${ip}`],
          arguments: [String(RATE_WINDOW_SECONDS)],
        }
      )
    );

    return count <= RATE_LIMIT;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("REDIS_URL must be configured for production");
  }

  const now = Date.now();
  const current = localLimits.get(ip);

  if (!current || now >= current.resetAt) {
    localLimits.set(ip, {
      count: 1,
      resetAt: now + RATE_WINDOW_SECONDS * 1000,
    });
    return true;
  }

  current.count += 1;
  return current.count <= RATE_LIMIT;
}

export async function POST(req: Request) {
  try {
    const ip =
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      "unknown";

    let allowed: boolean;

    try {
      allowed = await checkRateLimit(ip);
    } catch (error) {
      console.error("Guest Ciri rate-limit error:", error);
      return Response.json(
        { error: "Guest chat is temporarily unavailable." },
        { status: 503 }
      );
    }

    if (!allowed) {
      return Response.json(
        { error: "Please wait a minute before sending another message." },
        { status: 429 }
      );
    }

    if (!process.env.GROQ_API_KEY) {
      return Response.json(
        { error: "AI service is not configured." },
        { status: 503 }
      );
    }

    const body = await req.json();
    const message =
      typeof body?.message === "string" ? body.message.trim() : "";

    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return Response.json(
        { error: "Please enter a message of up to 2,000 characters." },
        { status: 400 }
      );
    }

    const history = Array.isArray(body?.history)
      ? body.history
          .slice(-MAX_HISTORY_MESSAGES)
          .filter(
            (item: unknown) =>
              item &&
              typeof item === "object" &&
              "role" in item &&
              "content" in item &&
              ((item as { role: unknown }).role === "user" ||
                (item as { role: unknown }).role === "assistant") &&
              typeof (item as { content: unknown }).content === "string" &&
              (item as { content: string }).content.trim().length > 0 &&
              (item as { content: string }).content.length <=
                MAX_MESSAGE_LENGTH
          )
          .map((item: { role: "user" | "assistant"; content: string }) => ({
            role: item.role,
            content: item.content.trim(),
          }))
      : [];

    const { data: ciri, error: ciriError } = await db
      .from("profiles")
      .select("name, is_ai, ai_personality")
      .eq("user_id", CIRI_ID)
      .maybeSingle();

    if (ciriError || !ciri || !ciri.is_ai) {
      console.error("Public Ciri profile error:", ciriError);
      return Response.json(
        { error: "Ciri is temporarily unavailable." },
        { status: 503 }
      );
    }

    const systemPrompt = `${
      ciri.ai_personality ||
      "You are Ciri, the official AI Host for Cirql."
    }

PUBLIC GUEST CHAT:
- You are speaking with a guest who has not created a Cirql account.
- You are also a general conversational companion. Welcome everyday questions, friendly conversation, advice and interesting discussions.
- Introduce Cirql naturally when relevant, but never turn every conversation into a sales pitch.
- Explain that guests can explore Cirql and create an account if they want to join the community.
- Never claim that a guest has an account or that you can see their private information.
- Never pretend to be human.
- Be warm, natural, helpful and concise.
- Respond directly to the latest message. Do not repeat your introduction unnecessarily.`;

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
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message },
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    const result = await aiRes.json();

    if (!aiRes.ok) {
      console.error("Public Ciri provider error:", aiRes.status, result);
      return Response.json(
        { error: "Ciri could not respond right now. Please try again." },
        { status: 502 }
      );
    }

    const reply = result?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      return Response.json(
        { error: "Ciri returned an empty response." },
        { status: 502 }
      );
    }

    return Response.json({ success: true, reply });
  } catch (error) {
    console.error("Public Ciri route error:", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
