export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const incomingMessages = body?.messages;

    if (
      !Array.isArray(incomingMessages) ||
      incomingMessages.length === 0
    ) {
      return Response.json(
        { error: "Invalid messages payload" },
        { status: 400 }
      );
    }

    const cleanedMessages = incomingMessages
      .map((msg: any) => ({
        role: msg.role,
        content:
          msg.content ||
          msg.parts?.[0]?.text ||
          "",
      }))
      .filter(
        (msg: any) =>
          msg.content &&
          ["user", "assistant", "system"].includes(msg.role)
      );

    const systemPrompt = {
      role: "system",
      content: `
You are Open Guide, the built-in assistant for CirqlProxy.

CirqlProxy is a live social discovery platform where people:

- discover other people
- wave at each other
- send messages
- build connections
- unlock voice and video calls through mutual connections

Your responsibilities:

- help users understand the platform
- explain features clearly
- encourage healthy interactions
- suggest next actions when users are unsure what to do
- answer general questions

Rules:

- Be friendly and conversational.
- Keep answers concise unless the user asks for detail.
- Never pretend to be another user.
- Never claim to send messages, waves, or notifications yourself.
- Do not invent features that do not exist.
- If you do not know something about the platform, say so.
- Focus on helping users discover and connect with people.

You are a guide, not a salesperson.
`,
    };

    const res = await fetch(
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
            systemPrompt,
            ...cleanedMessages,
          ],
          temperature: 0.7,
          max_tokens: 400,
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("?? GROQ ERROR:", data);

      return Response.json(
        { error: data },
        { status: 400 }
      );
    }

    const reply =
      data?.choices?.[0]?.message?.content;

    if (!reply) {
      return Response.json(
        { error: "No reply from model" },
        { status: 500 }
      );
    }

    return Response.json({
      reply,
    });
  } catch (err: any) {
    console.error("?? SERVER ERROR:", err);

    return Response.json(
      {
        error: err.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}
