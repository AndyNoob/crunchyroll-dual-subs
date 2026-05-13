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

export async function getOrFail<T, Args extends unknown[]>(
  name: string,
  get: (...args: Args) => Promise<T>,
  ...args: Args
): Promise<NonNullable<T>> {
  let value: T;

  try {
    value = await get(...args);
  } catch (e) {
    console.error(e);
    throw new Error(`could not retrieve ${name}!`);
  }

  if (value == null) {
    throw new Error(`could not retrieve ${name}!`);
  }

  return value as NonNullable<T>;
}

// Source - https://stackoverflow.com/a/9763769
// Posted by RobG, modified by community. See post 'Timeline' for change history
// Retrieved 2026-05-13, License - CC BY-SA 3.0

export function msToTime(s: number) {
  const ms = s % 1000;
  s = (s - ms) / 1000;
  const secs = s % 60;
  s = (s - secs) / 60;
  const mins = s % 60;
  const hrs = (s - mins) / 60;
  return `${Math.round(hrs / 24)}d ${hrs % 24}h ${mins}m ${secs}s`;
}
