export async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function extractErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload.detail === "string") return payload.detail;
  if (Array.isArray(payload.detail)) return payload.detail.join(", ");
  if (typeof payload.error === "string") return payload.error;
  if (typeof payload.message === "string") return payload.message;

  if (typeof payload === "object") {
    const firstEntry = Object.entries(payload)[0];
    if (firstEntry) {
      const [, value] = firstEntry;
      if (Array.isArray(value)) return value.join(", ");
      if (typeof value === "string") return value;
    }
  }

  return fallback;
}
