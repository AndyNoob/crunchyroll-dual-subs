import {defineConfig} from 'vite';
import webExtension from "vite-plugin-web-extension";
import zipPack from "vite-plugin-zip-pack";
import pkg from "./package.json";
import AdmZip from "adm-zip";

const browserType = process.env["BROWSER"] ?? "firefox";
console.log(`compiling for ${browserType}`);

export default defineConfig({
  publicDir: "icons",
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false
  },
  define: {
    __BROWSER_TYPE__: JSON.stringify(browserType)
  },
  plugins: [
    webExtension({
      browser: browserType,
      manifest: makeManifest
    }),
    zipPack({
      outFileName: `${pkg.name}-${browserType}.zip`,
      done: () => {
        if (browserType === "chrome") {
          const zip = new AdmZip('./dist-zip/cr-dual-subs-chrome.zip');
          zip.extractAllTo('./dist-zip/cr-dual-subs-crhome-unzipped', true);
          console.log('chrome extraction complete!');
        }
      }
    })
  ]
});

function makeManifest() {
  return {
    manifest_version: 3,
    name: pkg.displayName,
    version: pkg.version,
    description: pkg.description,
    icons: {
      "32": "icon-32.png",
      "64": "icon-64.png"
    },
    permissions: browserType === "chrome" ? [
      "storage",
      "webRequest",
      "tabs",
    ] : [
      "storage",
      "webRequest",
      "webRequestFilterResponse",
      "webRequestBlocking",
      "tabs",
    ],
    host_permissions: ["*://*.crunchyroll.com/*"],
    content_scripts: [
      {
        css: ["static/overlay.css", "static/dropdown.css"],
        js: ["src/content.js"],
        matches: ["*://*.crunchyroll.com/*"],
        run_at: "document_idle"
      }
    ],
    browser_specific_settings: {
      gecko: {
        id: "cr-dual-sub@andynoob",
        data_collection_permissions: {
          required: ["none"]
        }
      }
    },
    background: (browserType === "firefox" ? {
      scripts: ["src/background.js"]
    } : {
      service_worker: "src/background.js",
      type: "module"
    })
  }
}
