import {defineConfig} from 'vite';
import webExtension from "vite-plugin-web-extension";
import zipPack from "vite-plugin-zip-pack";
import pkg from "./package.json";

const browserType = process.env["BROWSER"] ?? "firefox";
console.log(`compiling for ${browserType}`);

export default defineConfig({
  publicDir: "icons",
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false
  },
  plugins: [
    webExtension({
      browser: browserType,
      manifest: () => {
        return {
          manifest_version: 3,
          name: pkg.displayName,
          version: pkg.version,
          description: pkg.description,
          icons: {
            "32": "icon-32.png",
            "64": "icon-64.png"
          },
          permissions: [
            "storage",
            "webRequest",
            "webRequestFilterResponse",
            "webRequestBlocking",
            "tabs",
            "activeTab"
          ],
          content_scripts: [
            {
              css: ["static/overlay.css"],
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
    }),
    zipPack({
      outFileName: `${pkg.name}.zip`
    })
  ]
});
