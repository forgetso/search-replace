import { defineConfig } from 'vitest/config'

// Unit tests run in jsdom so that the DOM helpers in `elements.ts` and the search/replace
// walk in `searchreplace.ts` can be exercised without a browser. The Cypress specs under
// `src/cypress` cover what jsdom cannot do: real layout, real iframes, the loaded extension.
export default defineConfig({
    test: {
        environment: 'jsdom',
        include: ['src/**/*.test.ts'],
        // Cypress specs also use `describe`/`it` but must not be collected here
        exclude: ['src/cypress/**', 'node_modules/**'],
        setupFiles: ['src/testing/setup.ts'],
        restoreMocks: true,
        coverage: {
            provider: 'v8',
            include: ['src/**/*.ts'],
            exclude: ['src/cypress/**', 'src/testing/**', 'src/**/*.test.ts', 'src/types/**'],
            reporter: ['text', 'html'],
        },
    },
})
