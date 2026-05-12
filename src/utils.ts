export function normalizeUrl(url: string) {
  const normalized = new URL(url);
  normalized.search = '';
  normalized.hash = '';
  return normalized.toString();
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function shortenUrl(urlStr: string) {
  try {
    const parts = new URL(urlStr).pathname.split("/").filter(Boolean);
    return parts.length ? `/${parts[parts.length - 1]}` : "/";
  } catch {
    return urlStr;
  }
}

export function singleFlight<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  keyFn: (...args: Args) => string
) { // courtesy of GPT-5.3/5.5
  const inFlight = new Map<string, Promise<Result>>();

  return (...args: Args): Promise<Result> => {
    const key = keyFn(...args);

    const existing = inFlight.get(key);
    if (existing) {
      console.log(`[singleFlight] ${fn.name}: "${key}" already in flight`);
      return existing;
    }
    console.log(`[singleFlight] ${fn.name}: marking "${key}" to flight`);

    const promise = fn(...args).finally(() => {
      inFlight.delete(key);
    });

    inFlight.set(key, promise);
    return promise;
  };
}

export let waitUntil: number = 0;

export function setNextRequestTime(val: number) {
  waitUntil = val;
}