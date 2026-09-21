// Runs before every test file (see `setupFiles` in vitest.config.mts).
// Modules such as `util.ts` read `chrome.runtime.getManifest()` at import time, so a
// `chrome` global has to exist before any module under test is imported.
import { installChromeMock } from './chromeMock'
import { installInnerTextShim } from './innerText'

installChromeMock()
installInnerTextShim()
