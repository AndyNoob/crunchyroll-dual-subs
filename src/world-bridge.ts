export function askMainWorld<T>(type: string, payload?: unknown, timeoutMs = 1000): Promise<T> {
  const uid = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      console.error(`[dual sub bridge] timed out during ${type}`);
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timeout);
      window.removeEventListener("message", listener);
    }

    function onResponse(data: {source: string, detail: any}) {
      if (data.source !== "cr-dual-sub-response") return;
      if (data.detail?.result === undefined) {
        console.error(`[dual sub bridge] detail.result was undefined`, data);
        return;
      }
      if (data.detail?.uid !== uid) return;

      cleanup();

      if (data.detail.error) reject(new Error(data.detail.error));
      else resolve(data.detail.result);
    }

    const listener = (e: MessageEvent) => {
      onResponse(e.data);
    };
    window.addEventListener("message", listener);

    window.postMessage({
      source: "cr-dual-sub-request",
      detail: JSON.stringify({ uid, type, payload })
    });

  });
}