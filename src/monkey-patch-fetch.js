const originalFetch = window.fetch;

window.fetch = async function ( input, init ) {
  const res = await originalFetch.apply(this, [ input, init ]);

  try {
    const url =
      input instanceof Request ? input.url :
        input instanceof URL ? input.href :
          String(input);

    if (url.includes("/playback/v3/")) {
      console.log("[dual-sub] playback hijacked");
      const clone = res.clone();
      clone.json().then(data => {
        dispatchExtensionEvent("playback", data);
      });
    }
    if (url.includes("content/v2/cms/objects")) {
      console.log("[dual-sub] manifest hijacked");
      const clone = res.clone();
      clone.json().then(data => {
        dispatchExtensionEvent("manifest", data);
      });
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
  return originalOpen.call(this, method, url, ...rest);
};

XMLHttpRequest.prototype.send = function ( ...args ) {
  this.addEventListener("load", function () {
    const url = this.__crDualSubsUrl;

    try {
      if (url?.includes("/multiprofile")) {
        console.log("[dual-sub] profiles (XHR) hijacked");
        dispatchExtensionEvent("profiles", JSON.parse(this.responseText));
      }
      if (url?.includes("/token")) {
        console.log("[dual-sub] token (XHR) hijacked");
        dispatchExtensionEvent("token", JSON.parse(this.responseText));
      }
    } catch (e) {
      console.error("[dual-sub] failed to parse XHR", e);
    }
  });

  return originalSend.apply(this, args);
};

console.log("[dual-sub] monkey patched XHR", new Date());

function dispatchExtensionEvent( type, payload ) {
  const customEvent = new CustomEvent("cr-dual-subs-monkey-patching", {
    detail: { type, payload }
  });
  window.dispatchEvent(customEvent);
}
