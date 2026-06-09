"use server";

export async function saveChatModelAsCookie() {
  return;
}

export async function deleteTrailingMessages() {
  return;
}

export async function updateChatVisibility() {
  return;
}

export async function register() {
  return {
    success: true,
    user: null,
  };
}

export type RegisterActionState = {
  error?: string;
  success?: boolean;
};

