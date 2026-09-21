# Search and Replace Extension for Chromium based browsers

Allows you to search for text anywhere on the page and replace it with different text. For example:

- quickly correct forms in which the wrong information has been entered multiple times
- edit the text in Content Manage Systems editors such as the WordPress post editor
- edit the HTML of the page
- use regular expressions as a search term
- capture matches from the regular expressions search term and apply as part of the replacement
- save the instance of the search and replace and apply to all subsequent page visits
- match pages by regular expressions to apply rules to many different web pages

Please Note:

1. You must refresh the page or restart chrome before using.
2. Please select "Input Fields Only" if you are editing text in a text editor or form.
3. The popup will not stay open if you click elsewhere. This is a feature of Chrome.

View a video of it in action here: http://www.youtube.com/watch?v=tf0D8RUdwkI

## Issues

Please report issues [here](https://github.com/forgetso/search-replace/issues/new/choose) and include the following information:

- Version
- Web page
- Search and Replace options used (e.g. Input Fields Only)
- Attach a copy of the problem page downloaded by using [this chrome extension to download it](https://chromewebstore.google.com/detail/singlefile/mpiodijhokgodhhofbcjdecpffjipkle?hl=en).

## Contributing

You can create PRs to further develop this extension. To get started, you can follow the instructions below to run the
extension locally.

1. Clone this repo ```git clone https://github.com/forgetso/search-replace.git```
2. Uninstall Search and Replace
3. [Enable developer mode in Extensions menu of chrome](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked)
   so that you can load unpacked Chrome extensions
4. Go to the directory where you cloned this repo
5. Install the dependencies `npm i`
6. Build the extension in development mode ```npm run watch``` (this will create a directory called `dist`)
7. Go to the [Extensions page](chrome://extensions) and select `Load Unpacked`
8. Navigate to the root folder of the repository and select the `dist` folder and press ok

You will now have a local copy of the extension running in your browser. You can edit the TypeScript files and the
extension will automatically rebuild thanks to the `npm run watch` command. To see the changes in your browser you will
need to hit the reload button underneath Search and Replace on the [Extensions page](chrome://extensions).

### The build

[Vite](https://vite.dev) builds the extension; `npm run build` produces `dist/`, and `npm run build:dev`
does the same without minification. Each entry point is bundled separately into a self-contained
IIFE, because a manifest v3 content script is injected as a classic script and cannot use ESM
imports. `scripts/build.mjs` drives that, and `vite.config.mts` explains it in more detail.

Vite transpiles TypeScript with esbuild and does **not** typecheck, so run `npm run typecheck`
(CI does) rather than relying on the build to catch type errors.

### Tests and checks

`npm run checks` runs everything CI runs bar the end-to-end tests: typecheck, lint, formatting and
unit tests. The individual scripts are:

| Command | What it does |
| --- | --- |
| `npm test` | Unit tests ([vitest](https://vitest.dev), jsdom) |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests with a coverage report |
| `npm run typecheck` | `tsc --noEmit` over the extension, the tests and the Cypress specs |
| `npm run lint` / `lint:fix` | eslint |
| `npm run format` / `format:check` | prettier |

End-to-end tests use [Cypress](https://www.cypress.io) and need the fixture server running:

```bash
npm run start &        # serves the fixtures in ./tests on port 9000
npm run test:e2e       # or `npm run cypress:open` to pick specs interactively
```

`wordpress.cy.ts` is excluded from that run because it drives a real WordPress install. To run it:

```bash
npm run e2e:docker:up
npm run test:e2e:wordpress
npm run e2e:docker:down
```

Unit tests live next to the code they cover as `*.test.ts`. They run in jsdom, so anything that
depends on real layout, real iframes or the loaded extension belongs in the Cypress specs instead.

Feel free to submit a PR if you make any improvements!
