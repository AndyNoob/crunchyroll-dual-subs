import browser from "webextension-polyfill";

export async function getOrLoadHeaders(tabId: number, refresh = false) {
  let header = headersMap.get(tabId);
  if (refresh || !header) {
    if (!refresh)
      console.log(`[getOrLoadHeaders] headers not found for tab ${tabId}, messaging for content script to try hack.`);
    try {
      await browser.runtime.sendMessage({type: "TRY_HACK"});
    } catch {
      return Promise.reject("hack failed");
    }
    console.log(`[getOrLoadHeaders] hack on tab ${tabId} is complete.`);
    header = headersMap.get(tabId);
  }
  return header;
}

export function findHeaderValue(headers: Header[], name: string): string {
  try {
    return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())!.value!;
  } catch (e) {
    console.warn(`[findHeaderValue] failed to find value of ${name}`, headers);
    throw e;
  }
}

export interface Header {
  name: string,
  value?: string
}

export function setHeaders(tabId: number, headers: Header[]) {
  let authFound = false;
  for (let header of headers) {
    const name = header.name.toLowerCase();
    if (name.includes("authorization") && !header.value?.toLowerCase().startsWith("basic")) {
      authFound = true;
    }
  }
  if (!authFound) return false;
  headersMap.set(tabId, headers);
  return true;
}

const headersMap = new Map<number, Header[]>();