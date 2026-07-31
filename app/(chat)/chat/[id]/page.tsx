import { Chat } from "@/components/chat";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Chat
      id={id}
      initialMessages={[]}
      initialChatModel="chat-model"
      initialVisibilityType="private"
      isReadonly={false}
      autoResume={false}
    />
  );
}