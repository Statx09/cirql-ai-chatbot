"use server";

export type RegisterActionState = {
  status:
    | "idle"
    | "user_exists"
    | "failed"
    | "invalid_data"
    | "success";
};

export type LoginActionState = {
  status:
    | "idle"
    | "failed"
    | "invalid_data"
    | "success";
};

export async function login(
  _state: LoginActionState,
  _formData: FormData
): Promise<LoginActionState> {
  return {
    status: "success",
  };
}

export async function register(
  _state: RegisterActionState,
  _formData: FormData
): Promise<RegisterActionState> {
  return {
    status: "success",
  };
}

export async function saveChatModelAsCookie() {
  return;
}

export async function deleteTrailingMessages() {
  return;
}

export async function updateChatVisibility() {
  return;
}