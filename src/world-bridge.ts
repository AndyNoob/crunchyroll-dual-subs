export function askMainWorld<T>(type: string, payload?: unknown, timeoutMs = 1000): Promise<T> {
  const id = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("cr-dual-sub-response", onResponse as EventListener);
    }

    function onResponse(event: CustomEvent) {
      if (event.detail?.id !== id) return;

      cleanup();

      if (event.detail.error) reject(new Error(event.detail.error));
      else resolve(event.detail.result);
    }

    window.addEventListener("cr-dual-sub-response", onResponse as EventListener);

    window.dispatchEvent(new CustomEvent("cr-dual-sub-request", {
      detail: { id, type, payload }
    }));
  });
}