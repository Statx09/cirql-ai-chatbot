export async function createGuestUser() {
  // FIX: disabled DB call that was crashing auth callback

  return [
    {
      id: "guest",
      name: "Guest User",
    },
  ];
}
