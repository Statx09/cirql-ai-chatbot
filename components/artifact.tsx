"use client";

import type { Attachment, ChatMessage } from "@/lib/types";
import type { Vote } from "@/lib/db/schema";

export type UIArtifact = {
  documentId: string;
  content: string;
  kind: string;
  title: string;
  status: "idle" | "streaming";
  isVisible: boolean;
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

type ArtifactProps = {
  attachments: Attachment[];
  chatId: string;
  input: string;
  isReadonly: boolean;
  messages: ChatMessage[];
  regenerate: (...args: any[]) => any;
  selectedModelId: string;
  selectedVisibilityType: any;
  sendMessage: (...args: any[]) => any;
  setAttachments: (...args: any[]) => any;
  setInput: (...args: any[]) => any;
  setMessages: (...args: any[]) => any;
  status: any;
  stop: (...args: any[]) => any;
  votes?: Vote[];
};

export function Artifact(_: ArtifactProps) {
  return null;
}

export const artifactDefinitions: any[] = [];
