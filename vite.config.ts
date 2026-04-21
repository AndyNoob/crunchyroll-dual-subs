import {defineConfig} from 'vite';
import webExtension from "vite-plugin-web-extension";
import zipPack from "vite-plugin-zip-pack";
import pkg from "./package.json";
import manifest from "./manifest.json";

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
          ...manifest,
          version: pkg.version,
          description: pkg.description
        }
      }
    }),
    zipPack({
      outFileName: `${pkg.name}.zip`
    })
  ]
});
