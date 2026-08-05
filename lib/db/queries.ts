export async function createGuestUser() {
  // FIX: disabled DB call that was crashing auth callback

  return [
    {
      id: "guest",
      name: "Guest User",
    },
  ];
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  // MVP stub - suggestions disabled
  return [];
}

