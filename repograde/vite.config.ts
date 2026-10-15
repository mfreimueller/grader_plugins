import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { copyFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Builds the plugin into dist/<plugin id>/, the layout of a folder in Grader's plugin folder:
 * plugin.json next to a static page.
 */
const PLUGIN_ID = 'at.mfreimueller.repograde';
const ROOT = import.meta.dirname;
const OUTPUT = path.resolve(ROOT, 'dist', PLUGIN_ID);

export default defineConfig({
  root: ROOT,
  // Relative urls: the page is served from grdr-plugin://<id>/, wherever that is mapped to on disk.
  base: './',
  plugins: [
    vue(),
    {
      name: 'copy-plugin-manifest',
      closeBundle() {
        copyFileSync(path.join(ROOT, 'plugin.json'), path.join(OUTPUT, 'plugin.json'));
      },
    },
  ],
  build: {
    outDir: OUTPUT,
    emptyOutDir: true,
  },
});
