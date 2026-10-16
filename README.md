# Yongil Translator

A Chromium extension that translates webpages in place using a ChatGPT subscription account. Translate an entire page or selected blocks, then restore the original text at any time.

**Current status:** The user has reported successful translation with GPT-6.1 Sol. Automated regression tests cover the implementation, including configurable parallel requests. The latest changes have not yet been verified through browser automation or timed against the live service. Edge/Brave compatibility remains unverified.

## Installation

1. Download this repository. No separate build or npm installation is required.
2. Open `chrome://extensions` in Chrome and enable Developer mode.
3. Choose **Load unpacked** and select the repository's **extension** folder.
4. Open the extension popup and sign in with **Continue with ChatGPT**.
5. Open a webpage and choose **Allow only this site** or **Allow all sites** in the popup. Until access is granted, only the header, Settings button, and highlighted access card appear after sign-in. Granting access activates the current page and reveals translation controls.
6. When no model is saved, the first model returned by your account is selected automatically. Choose the target language and run **Translate page**. Site access is required for all translation features and shortcuts.

Chrome internal pages, extension stores, the browser's PDF viewer, and text inside images are outside the translation scope. Some sites are also subject to browser-enforced script injection restrictions.

## Usage

| Action | Method |
|---|---|
| Translate a page | Alt+T or Translate page in the extension popup or bottom-right page toolbar |
| Translate a block | Hold Alt and click, or enter block selection from the popup and click |
| Restore a block's original text | Alt-click a translated block, or click it in block selection mode |
| Translate selected text in a popup | Drag to select text, then click Translate selection |
| Move, resize, or close the selection popup | Drag its title, drag its bottom-right corner, or use Close/Escape |
| Restore a page's original text | Alt+R or Restore original in the popup or page toolbar |
| Exit selection mode | Escape (configurable), Exit block selection in the page toolbar, or toggle Translate block in the popup |
| Change page, block-selection, and cancel keys | Record a key combination under Settings → Shortcuts; Clear disables a shortcut |

- Before sign-in, the popup shows the Yongil TRANSLATOR header, Settings button, and ChatGPT connection area. The options page shows the connection area. The options page unlocks after connection. Popup translation controls additionally require access to the current site, and hide again on sign-out.
- After sign-in, an unapproved site shows only a highlighted access card below the persistent header and Settings button. Translation controls, language/model settings, account information, and the footer stay hidden until access is confirmed. The card uses a larger, bold accent-colored title and two full-width buttons: **Allow only this site** grants access to the current site, while **Allow all sites** requests access to all HTTP and HTTPS websites. Both choices reveal the same translation controls after approval. The buttons stay disabled while a permission request is pending. Permission denial stays inside the card. Unsupported browser pages show an explanatory message with no permission button.
- Site access is required. The extension no longer requests temporary activeTab access. Popup actions, page shortcuts, and inference requests check the granted host permission; frames require access to both their own origin and the containing site. Revoking access hides the controls and stops translation jobs. Shortcuts require focus in the webpage and do not run in editors or the browser address bar. Existing on-page restoration controls remain available after sign-out.
- Settings → Translation → Concurrent translation requests accepts 1–64, with a default of 16. The service worker shares this limit across tabs. Changes take effect when a new translation starts; requests already running are allowed to finish.
- Page batches run in parallel and display completed results immediately, even when earlier batches are still running.
- Within each document, page translation requests blocks that intersect the current viewport first, including partially visible blocks, then continues with the nearest offscreen blocks. Pending work is reprioritized after scrolling, resizing, zooming, or applying translations that can change the layout. Requests already sent continue normally; concurrent responses can still finish out of order.
- The bottom-right page toolbar includes a Translate page button, a thin progress bar along its top edge, and a completed/total block counter (for example, **16/120 Blocks** in English). Successfully applied results count even when their text matches the original. Failed, restored, or subsequently edited blocks do not count as completed. Counts describe tracked blocks in that document; detached blocks are excluded. The counter stays visible alongside errors. The page button dispatches translation to accessible frames and is disabled while that document is translating.
- The interface supports English and Korean. Settings → Data & appearance → UI language offers Follow browser settings (default), Korean, and English. Unsupported browser languages fall back to English. The preference applies to the popup, settings, page controls, and messages, including before sign-in. It is independent of the translation target.
- When no model is saved, the first returned model is selected and saved. Refreshing the list preserves an existing choice.
- Button-activated block selection stays active after every translate or restore click. Continue clicking blocks until using the cancel key, Exit block selection, closing the page toolbar, or switching tabs. Releasing modifier keys or moving focus between frames does not end button-activated selection.
- Page translation and restoration have separate shortcuts: **Alt+T** translates, and **Alt+R** stops pending work and restores the entire page. Translation keeps matching translated blocks and processes remaining blocks; it does not switch to restoration. Each shortcut has its own recording and Clear controls. Existing saved page shortcuts remain assigned to translation, while older settings receive the new restoration default. Actions reach all accessible frames, and holding a key does not repeat the action.
- Defaults are Alt+T, Alt+R, and Alt+click. Version 3 migrates the former Ctrl+Alt defaults once, including legacy Alt+Shift block defaults that have never been migrated. Other custom and disabled shortcuts are preserved, and choosing an older combination again after migration is respected. Popup translation, block and restoration buttons display their configured shortcuts. Existing saved concurrency values are retained; new or reset settings default to 16.
- Hovering over a block shows no action popup, including while translating. Only block selection displays a translate/restore hint. Use the page or extension popup controls to stop or retry page translations.
- Granting site access activates the current page without starting a translation and automatically enables the page script on future visits. After updating the extension, refresh pages that were already open.
- Selected-text translation uses the current model, target language, and instructions without replacing page text. It starts only when its button is clicked. Closing the popup cancels its request and discards late results. Selections are limited to 16,000 characters; editors and excluded content are ignored.
- The language field supports both list selection and direct input. Language choices show the native name followed by the UI-localized name, separated by **∙**. Regional variants include the country in both languages: for example, **English (United Kingdom) ∙ 영어 (영국)** in the Korean UI. Names appear only once when the target language matches the UI language. The list includes regional English, Portuguese, Spanish, French, German, and Chinese choices. Search accepts native/localized names, countries, and locale codes; custom targets remain supported.
- Regional choices are saved as native labels independently of the UI language, so switching the interface language preserves the selected target and country. The browser-language choice stays at the top, including its supported regional variant.
- The initial language is based on the **browser UI language**. A reliable way to read the operating system language from the extension has not been established, so it is not labeled as the OS language.
- The source language is detected internally and has no separate UI row.
- Custom instructions are saved explicitly and apply to translations started afterward.
- Restoring the entire page also restores blocks translated individually.
- Successfully applied block translations are cached in the current document, including pages with more than 200 blocks. Translating a restored block or page with matching original text, target language, model, enabled instructions, and account connection reuses the result without a new inference request. Changed text or settings use a separate cache entry. Refreshing the page, navigating to another URL, or clearing the temporary cache discards these entries. No translations are saved to disk.
- Stopping translation and restoring original text are separate actions. Stopping preserves translations already applied.
- Results that arrive after restoration are discarded. Text updated by the site is not overwritten with an older original.
- Forms, editors, passwords, hidden elements, and code blocks are not collected. The extension reports exclusions when a single text node exceeds 16,000 characters or the traversal limit is reached.
- Accessible frames and open Shadow DOM are eligible for processing. Closed Shadow DOM and inaccessible frames are unsupported.

## Authentication and data

The extension handles OAuth Authorization Code + PKCE internally. It observes the code when the dedicated sign-in tab navigates to the designated callback URL, so no local server or companion application is installed. It uses a flow compatible with the public Codex client and does not guarantee the same support as the official subscription integration for general third-party applications. Behavior with a real account requires separate verification.

Credentials are not exposed to content scripts. Tokens are held in extension storage restricted to trusted contexts. Original text, translations, and restoration snapshots remain in the current page's memory. Settings exports include only allowed fields and exclude credentials. See the [Privacy Notice](PRIVACY.md) for details.

## Development and verification

The implementation uses JavaScript ES modules and standard DOM APIs with no runtime dependencies. Instead of the initially proposed TypeScript, Vite, and React stack, it can be installed directly as an unpacked extension. Node.js 20 or later is needed only for development checks and packaging.

```sh
npm test
npm run check
npm run package
```

Tests verify OAuth validation, output structure and streaming, original-text restoration, cancellation races, service-worker message boundaries, and account state without making requests with a real account. Actual browser verification procedures and recorded results are in [TESTING.md](TESTING.md).

- `extension/`: directly installable extension
- `extension/lib/`: localization, settings, OAuth, subscription requests, and response validation
- `extension/_locales/`: English and Korean message catalogs
- `extension/lib/languages.mjs`: regional language choices, native/localized labels, and target resolution
- `extension/selection-ui.js`: selected-text translation and its movable, resizable result popup
- `extension/document-core.js`: original-text snapshots and generation tracking
- `extension/content.js`: DOM collection, translation and restoration, and on-page UI
- `extension/background.mjs`: authentication events, job queue, permissions, and message handling
- `tests/`: regression and integration tests, plus browser fixtures
- `scripts/`: syntax checks, icon rendering, and ZIP packaging

Page shortcuts are handled by the content script so users can configure page and block gestures consistently. The defaults are Alt+T, Alt+R, and Alt+click; the webpage must have focus and site access must be granted. Browser or operating-system bindings may take precedence. The extension does not register separate browser commands.

To add a UI language, translate a copy of `extension/_locales/en/messages.json`, extend the supported language choices in `lib/i18n.mjs`, `lib/settings.mjs`, and `options.html`, and run the localization tests. Browser-owned extension descriptions follow [Chrome localization](https://developer.chrome.com/docs/extensions/reference/api/i18n); the in-extension UI also supports the saved override.

The brand symbol and functional icons were created for this project, except the GitHub mark from Primer Octicons. See [third-party notices](extension/THIRD_PARTY_NOTICES.txt). Project code and original design assets are covered by the [MIT License](LICENSE).

## Chrome Web Store preparation

The [submission kit](store/README.md) contains English/Korean descriptions, privacy and permission disclosures, reviewer instructions, English promotional artwork, and an English-only screenshot capture plan. The [public privacy page](docs/privacy.html) is generated from PRIVACY.md. Actual browser captures, public hosting, and confirmation of the subscription integration support remain outstanding as recorded in the kit.

The popup includes a GitHub icon next to Settings, including before sign-in. The options sidebar also links to the source repository. Both links open a new tab.
