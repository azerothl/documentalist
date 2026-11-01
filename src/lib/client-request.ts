export async function apiFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const response = await globalThis.fetch(input, init);
    if (!response.ok) {
      const body = await response
        .clone()
        .json()
        .catch(() => ({}));
      throw new Error(body.error || `Requête refusée (${response.status}).`);
    }
    return response;
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    window.dispatchEvent(
      new CustomEvent("documentalist-error", {
        detail:
          error instanceof Error
            ? error.message
            : "Connexion au serveur impossible.",
      }),
    );
    throw error;
  }
}
