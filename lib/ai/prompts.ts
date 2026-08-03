import type { Geo } from "@vercel/functions";

export const regularPrompt =
  "You are a friendly assistant! Keep your responses concise and helpful.";

export type RequestHints = {
  latitude: Geo["latitude"];
  longitude: Geo["longitude"];
  city: Geo["city"];
  country: Geo["country"];
};

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}
`;

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);

  if (selectedChatModel === "chat-model-reasoning") {
    return `${regularPrompt}\n\n${requestPrompt}`;
  }

  return `${regularPrompt}\n\n${requestPrompt}`;
};
export const codePrompt = `
You are an expert software engineer.
Generate clean, well-structured, production-quality code.
Return only the requested code.
`;

export const updateDocumentPrompt = (
  existingContent: string,
  kind: string
) => `
You are updating an existing ${kind} document.

Existing content:

${existingContent}

Update it according to the user's request while preserving the parts that should remain unchanged.
`;
