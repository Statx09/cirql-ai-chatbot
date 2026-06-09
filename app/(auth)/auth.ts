export async function auth() {
  return {
    user: {
      id: "guest",
      name: "Guest User",
      email: "guest@example.com",
    },
  };
}
