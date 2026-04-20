import {defineConfig} from 'vite';
import webExtension from "vite-plugin-web-extension";
import zipPack from "vite-plugin-zip-pack";
import pkg from "./package.json";
import manifest from "./manifest.json";

export default defineConfig({
  publicDir: false, // webExtension plugin does this already
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false
  },
  plugins: [
    // viteStaticCopy({
    //   targets: [
    //     {
    //       src: 'manifest.json',
    //       dest: './'
    //     }
    //   ]
    // }),
    webExtension({
      skipManifestValidation: true,
      browser: "firefox",
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
