import {defineConfig} from 'vite';
import {viteStaticCopy} from 'vite-plugin-static-copy';
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  publicDir: false, // webExtension plugin does this already
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: 'manifest.json',
          dest: './'
        }
      ]
    }),
    webExtension({
      skipManifestValidation: true
    })
  ]
});
