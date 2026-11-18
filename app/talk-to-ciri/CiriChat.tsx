
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
};

const STORAGE_KEY = "ciri-public-chat-v1";
const CIRI_AVATAR = "https://i.pravatar.cc/400?img=32";

const welcomeMessage: ChatMessage = {
  id: 1,
  role: "assistant",
  content:
    "Hey! I'm Ciri, the official AI Host for Cirql. 😊\n\nI'm here to chat, answer your questions, offer advice, or help you discover what Cirql is all about.\n\nWhat's on your mind?",
};

export default function CiriChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    welcomeMessage,
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);

      if (saved) {
        const parsed = JSON.parse(saved);

        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages(parsed);
        }
      }
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Continue without browser storage if unavailable.
    }
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();

    if (!text || loading || text.length > 2000) return;

    setInput("");
    setError("");
    setLoading(true);

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: text,
    };

    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);

    try {
      const response = await fetch("/api/public-ciri", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: text,
          history: updatedMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.reply) {
        throw new Error(
          data.error || "Ciri couldn't respond just now. Please try again."
        );
      }

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.reply,
      };

      setMessages((current) => [...current, assistantMessage]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, loading, messages]);

  const handleKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <main className="ciri-page">
      <section className="chat-window">
        <header className="chat-header">
          <div className="brand">
            <div className="avatar-wrap">
              <img src={CIRI_AVATAR} alt="Ciri" className="avatar" />
              <span className="online-dot" />
            </div>

            <div className="brand-info">
              <h1>Ciri</h1>
              <div className="status">
                <span className="verified">✦</span>
                Official AI Host · Online
              </div>
            </div>
          </div>

          <div className="header-label">
            <span className="header-symbol">✧</span>
            CIRQL
          </div>
        </header>

        <div className="chat-body">
          <div className="welcome-label">
            <span />
            YOUR CONVERSATION STARTS HERE
            <span />
          </div>

          <div className="message-list">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message-row ${
                  message.role === "user" ? "user-row" : "assistant-row"
                }`}
              >
                {message.role === "assistant" && (
                  <img
                    src={CIRI_AVATAR}
                    alt=""
                    className="message-avatar"
                  />
                )}

                <div
                  className={`message-bubble ${
                    message.role === "user" ? "user-bubble" : "assistant-bubble"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="message-row assistant-row">
                <img
                  src={CIRI_AVATAR}
                  alt=""
                  className="message-avatar"
                />
                <div className="typing-bubble">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="chat-footer">
          <div className="composer">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Ciri..."
              rows={1}
              maxLength={2000}
              disabled={loading}
            />

            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="send-button"
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 2 11 13" />
                <path d="m22 2-7 20-4-9-9-4Z" />
              </svg>
            </button>
          </div>

          <div className="composer-bottom">
            <span>Enter to send · Shift + Enter for a new line</span>
            <span>{input.length}/2000</span>
          </div>

          <div className="join-prompt">
            <span>Enjoying the conversation?</span>
            <span className="join-highlight">
              Ask Ciri how to join Cirql ✦
            </span>
          </div>
        </footer>
      </section>

      <style jsx>{`
        .ciri-page {
          min-height: 100svh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #101016;
          color: #f5f3fa;
          font-family: Arial, Helvetica, sans-serif;
        }

        .chat-window {
          width: 100%;
          max-width: 440px;
          height: min(680px, 100svh);
          min-height: 480px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 22px;
          background: #17171f;
          box-shadow: 0 30px 100px rgba(0, 0, 0, 0.4);
        }

        .chat-header {
          height: 82px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 26px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          background: #1b1b25;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 13px;
        }

        .avatar-wrap {
          position: relative;
        }

        .avatar {
          width: 46px;
          height: 46px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #a78bfa;
        }

        .online-dot {
          position: absolute;
          right: 0;
          bottom: 1px;
          width: 12px;
          height: 12px;
          border: 2px solid #1b1b25;
          border-radius: 50%;
          background: #36d399;
        }

        .brand-info h1 {
          margin: 0 0 4px;
          font-size: 17px;
          font-weight: 700;
        }

        .status {
          color: #9997a8;
          font-size: 11px;
        }

        .verified {
          color: #a78bfa;
          margin-right: 5px;
        }

        .header-label {
          color: #aaa4bd;
          font-size: 12px;
          letter-spacing: 3px;
          font-weight: 700;
        }

        .header-symbol {
          color: #b49aff;
          margin-right: 7px;
          font-size: 17px;
        }

        .chat-body {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 25px 28px;
          scrollbar-width: thin;
          scrollbar-color: #454052 transparent;
        }

        .welcome-label {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          margin: 0 0 28px;
          color: #777487;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 1.7px;
          text-align: center;
        }

        .welcome-label span {
          width: 25px;
          height: 1px;
          background: #393744;
        }

        .message-list {
          display: flex;
          flex-direction: column;
          gap: 19px;
        }

        .message-row {
          display: flex;
          align-items: flex-end;
          gap: 10px;
        }

        .user-row {
          justify-content: flex-end;
        }

        .assistant-row {
          justify-content: flex-start;
        }

        .message-avatar {
          width: 29px;
          height: 29px;
          flex-shrink: 0;
          border-radius: 50%;
          object-fit: cover;
        }

        .message-bubble {
          max-width: min(75%, 560px);
          padding: 13px 16px;
          border-radius: 17px;
          font-size: 14px;
          line-height: 1.65;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }

        .assistant-bubble {
          color: #e8e5f0;
          background: #252430;
          border: 1px solid rgba(255, 255, 255, 0.055);
          border-bottom-left-radius: 5px;
        }

        .user-bubble {
          color: #fff;
          background: linear-gradient(135deg, #7959d8, #6345bd);
          border-bottom-right-radius: 5px;
        }

        .typing-bubble {
          display: flex;
          gap: 5px;
          align-items: center;
          padding: 16px;
          border-radius: 16px;
          background: #252430;
        }

        .typing-bubble span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #b49aff;
          animation: typing 1s infinite ease-in-out;
        }

        .typing-bubble span:nth-child(2) {
          animation-delay: 0.15s;
        }

        .typing-bubble span:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.5;
          }
          30% {
            transform: translateY(-5px);
            opacity: 1;
          }
        }

        .error-message {
          margin-left: 40px;
          color: #ff9999;
          font-size: 12px;
        }

        .chat-footer {
          flex-shrink: 0;
          padding: 17px 25px 19px;
          border-top: 1px solid rgba(255, 255, 255, 0.07);
          background: #1b1b25;
        }

        .composer {
          display: flex;
          align-items: flex-end;
          gap: 10px;
          padding: 9px 10px 9px 15px;
          border: 1px solid #393644;
          border-radius: 15px;
          background: #22212c;
          transition: border-color 0.2s;
        }

        .composer:focus-within {
          border-color: #8c70d7;
        }

        .composer textarea {
          flex: 1;
          min-width: 0;
          max-height: 120px;
          resize: none;
          outline: none;
          border: 0;
          background: transparent;
          color: #fff;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.5;
          padding: 8px 0;
        }

        .composer textarea::placeholder {
          color: #777486;
        }

        .send-button {
          width: 39px;
          height: 39px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 11px;
          background: #805fe0;
          color: white;
          cursor: pointer;
          transition: background 0.2s, opacity 0.2s;
        }

        .send-button:hover:not(:disabled) {
          background: #987cf0;
        }

        .send-button:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }

        .composer-bottom {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          padding: 0 3px;
          color: #777486;
          font-size: 10px;
        }

        .join-prompt {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 5px;
          margin-top: 17px;
          color: #8c899a;
          font-size: 11px;
        }

        .join-highlight {
          color: #b49aff;
        }

        @media (max-width: 600px) {
          .ciri-page {
            padding: 0;
            background: #17171f;
          }

          .chat-window {
            width: 100%;
            height: 100svh;
            min-height: 0;
            max-width: none;
            border: 0;
            border-radius: 0;
            box-shadow: none;
          }

          .chat-header {
            height: 72px;
            padding: 0 17px;
          }

          .chat-body {
            padding: 21px 15px;
          }

          .chat-footer {
            padding: 13px 14px calc(13px + env(safe-area-inset-bottom));
          }

          .message-bubble {
            max-width: 84%;
            font-size: 13px;
          }

          .welcome-label {
            font-size: 8px;
            letter-spacing: 1px;
          }

          .header-label {
            font-size: 10px;
            letter-spacing: 2px;
          }
        }
      `}</style>
    </main>
  );
}
