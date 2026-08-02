const originalFetch = window.fetch;

window.fetch = async function ( input, init ) {
  const res = await originalFetch.apply(this, [ input, init ]);

  if (!res.ok) return res;
  const method = input instanceof Request
    ? input.method
    : ( init?.method ?? "GET" );

  if (method !== "GET") return res;

  try {
    const url =
      input instanceof Request ? input.url :
        input instanceof URL ? input.href :
          String(input);

    // ignore extension initiated requests
    if (url.includes("dual_sub=676767")) return res;

    if (url.includes("playback/v3")) {
      console.log("[dual-sub] playback hijacked");
      const clone = res.clone();
      sendAuthHeaders(init);
      const data = await clone.json();
      let changed = false;

      if (window.__dualSubsSubtitles) {
        const time = performance.now();
        const subtitles = await window.__dualSubsSubtitles.catch(e => {
          console.log("[dual sub soft sub] failed to wait to additional subtitles to be loaded", e);
          return null;
        });
        console.log(`[dual sub soft sub] waited ${Math.round(performance.now() - time)}ms for additional subtitles to load`);
        if (subtitles) {
          const replaced = [];
          for (const key of Object.keys(subtitles)) {
            if (data[ "subtitles" ][ key ]) continue;
            data[ "subtitles" ][ key ] = subtitles[ key ];
            replaced.push(key);
          }
          console.log("[dual sub soft sub] injected subtitles", data, replaced);
          changed = true;
        } else console.log("[dual sub soft sub] additional subtitles could not be loaded");
      }

      dispatchExtensionEvent("playback", data);

      if (typeof window.SubtitlesOctopus != "function") {
        const noSub = data[ "hardSubs" ][ "none" ].url;
        for (let [ key, value ] of Object.entries(data[ "hardSubs" ])) {
          if (key === "none") continue;
          value.url = noSub;
          console.log("[dual sub soft sub] changed hard sub url", key, noSub);
        }
        changed = true;
      }

      if (changed) {
        const cleanBlob = new Blob([ JSON.stringify(data) ], { type: 'application/json' });
        return new Response(cleanBlob, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers
        });
      }
    }
    if (url.includes("content/v2/cms/objects")) {
      console.log("[dual-sub] manifest hijacked");
      const clone = res.clone();
      sendAuthHeaders(init);
      clone.json().then(data => {
        dispatchExtensionEvent("manifest", data);
      });
    }
    if (url.includes("/playheads")) {
      console.log("[dual-sub] play heads received.");
      sendAuthHeaders(init);
    }
  } catch (e) {
    console.warn("[dual-sub] fetch patch failed", e);
  }

  return res;
};

console.log("[dual-sub] monkey patched fetch", new Date());

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;

XMLHttpRequest.prototype.open = function ( method, url, ...rest ) {
  this.__crDualSubsUrl = String(url);
  this.__crDualSubsMethod = method;
  return originalOpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function ( ...args ) {
  this.addEventListener("load", function () {
    const url = this.__crDualSubsUrl;

    // ignore extension initiated requests
    if (url.includes("dual_sub=676767")) return;

    try {
      if (url?.includes("/multiprofile")) {
        if (this.__crDualSubsMethod === "GET") {
          console.log("[dual-sub] profiles (XHR) hijacked");
          const payload = JSON.parse(this.responseText);
          dispatchExtensionEvent("profiles", payload);
        } else if (this.__crDualSubsMethod === "PATCH") {
          console.log("[dual-sub] patch profile (XHR) hijacked");
          const payload = JSON.parse(this.responseText);
          dispatchExtensionEvent("patch_profile", payload);
        }
      }
      if (url?.includes("/token")) {
        console.log("[dual-sub] token (XHR) hijacked");
        const payload = JSON.parse(this.responseText);
        dispatchExtensionEvent("token", payload);
      }
    } catch (e) {
      console.error("[dual-sub] failed to parse XHR", e);
    }
  });

  return originalSend.apply(this, args);
};

function sendAuthHeaders( req ) {
  if (!req) return;
  const authorization = req.headers.get("authorization");
  if (!authorization) return;
  const split = authorization.split(" ");
  if (split.length !== 2) return;
  const payload = { "access_token": split[ 1 ], "token_type": split[ 0 ] };
  dispatchExtensionEvent("token", payload);
}

console.log("[dual-sub] monkey patched XHR", new Date());

function dispatchExtensionEvent( type, payload ) {
  const customEvent = new CustomEvent("cr-dual-subs-monkey-patching", {
    detail: { type, payload }
  });
  window.dispatchEvent(customEvent);
}
