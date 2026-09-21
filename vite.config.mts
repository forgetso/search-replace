import { defineConfig } from 'vite'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

/**
 * Build config for one extension entry point.
 *
 * Each entry is bundled separately as a self-contained IIFE. That is a hard requirement rather
 * than a preference: the files listed under `content_scripts` in manifest.json are injected as
 * classic scripts, which cannot use ESM `import`, and the MV3 service worker is only an ES
 * module if the manifest says `"type": "module"` (it does not). Rollup also refuses to emit
 * `iife` for a multi-input build, since that would require code splitting. Hence one build per
 * entry, driven by scripts/build.mjs.
 *
 * Note that vite transpiles TypeScript with esbuild and does *not* typecheck. Run
 * `npm run typecheck` for that; CI runs it as a separate job.
 */
export default defineConfig(({ mode }) => {
    const entry = process.env.EXTENSION_ENTRY
    if (!entry) {
        throw new Error('EXTENSION_ENTRY is not set. Build with `npm run build`, not `vite build`.')
    }
    const isDev = mode === 'development'

    return {
        // Static files are copied by scripts/build.mjs, which knows the three different
        // source -> destination mappings that publicDir cannot express
        publicDir: false,
        build: {
            outDir: 'dist',
            // Each entry writes its own file into the same directory
            emptyOutDir: false,
            // Chrome 88 is the minimum for manifest v3
            target: 'chrome88',
            minify: isDev ? false : 'terser',
            terserOptions: {
                compress: {
                    // Debug logging is stripped from release builds but kept in dev builds.
                    // console.warn and console.error survive, so real problems still surface.
                    drop_console: ['log', 'info', 'debug'],
                },
            },
            sourcemap: isDev ? 'inline' : false,
            rollupOptions: {
                input: resolve(root, `src/${entry}.ts`),
                output: {
                    format: 'iife',
                    entryFileNames: `${entry}.js`,
                    // An IIFE bundle has no exports to expose on the page
                    extend: true,
                },
            },
        },
    }
})
