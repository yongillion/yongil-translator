# Yongil Translator

A Chromium extension that translates webpages in place using a ChatGPT subscription account, your own OpenAI API key, a Claude API key, experimental browser-provided On-Device AI, or the browser Translator API. Translate an entire page or selected blocks, then restore the original text at any time.

**Current status:** The user has reported successful translation with GPT-6.1 Sol. Automated regression tests cover the implementation, including configurable parallel requests. The latest changes have not yet been verified through browser automation or timed against the live service. Edge/Brave compatibility remains unverified.

## Installation

1. Download this repository. No separate build or npm installation is required.
2. Open `chrome://extensions` in Chrome and enable Developer mode.
3. Choose **Load unpacked** and select the repository's **extension** folder.
4. Open the extension popup. Choose **ChatGPT subscription** and sign in, or choose **OpenAI API** or **Claude API**, enter the corresponding API key, and connect.
5. Open a webpage and choose **Allow only this site** or **Allow all sites** in the popup. Until access is granted, only the header, Settings button, and highlighted access card appear after sign-in. Granting access activates the current page and reveals translation controls.
6. When no model is saved, the first model returned by your account is selected automatically. Choose the target language and run **Translate page**. Site access is required for all translation features and shortcuts.

Chrome internal pages, extension stores, the browser's PDF viewer, and text inside images are outside the translation scope. Some sites are also subject to browser-enforced script injection restrictions.

## On-Device AI (experimental)

This option uses the browser-provided Prompt API without an account or API key. Browser names and user-agent brands do not control eligibility. The option starts hidden and appears only when the extension document exposes LanguageModel.availability() and LanguageModel.create(), availability reports available, downloadable, or downloading, and at least one listed target language is supported. Missing APIs, unavailable models, rejected probes, unknown states, and timeouts leave it hidden, including in Google Chrome. Samsung, Edge, and other browsers qualify if their extension contexts expose a compatible API; their actual implementations have not been verified.

1. Choose **On-Device AI**, then **Open local model tab**.
2. Click **Prepare local model** in that tab. The browser manages model downloads and device eligibility. Discovery never creates a session or starts a download.
3. Keep that tab open, grant site access, and select a supported target language. If another language requires a download, return to the model tab and prepare it with another click.

Target languages are checked with the API, including Korean when the browser supports it. Existing saved targets are preserved. Before each request, availability is checked using the same source/target options as session creation, including English instructions and reliably detected source languages. Model rejection of unsupported languages remains authoritative. The UI supports English and Korean independently of model language support.

Translation processes one block and one request at a time, regardless of the cloud concurrency setting. Context overflow leaves the block unchanged. Invalid JSON uses the configured retry budget; validated results use the existing restoration and page-cache behavior. Closing or stopping the model tab cancels work. The extension never automatically switches these requests to OpenAI or Anthropic. Developer mode records local request/response diagnostics under the existing retention rules.

The name **On-Device AI** describes the intended use with local browser models, but Prompt API availability is not proof of local execution. The API proposal also permits browser-managed cloud implementations and exposes no portable execution-location guarantee. Processing location and model downloads follow the browser's implementation and policies. The extension does not add a network model library or remote fallback.

The bundled extension tab is necessary because the API is not exposed in service workers. No new host or offscreen permission is added. Stored provider/model identifiers are retained for compatibility; the UI uses a generic browser-model label. Real downloads and inference still require testing on each browser/device. See the [Prompt API proposal](https://github.com/webmachinelearning/prompt-api), [Chrome documentation](https://developer.chrome.com/docs/ai/prompt-api), and [Samsung built-in AI policy](https://developer.samsung.com/browser/policy/built-in-aiap-is-enabled.html). Samsung's policy documentation does not by itself establish that a usable model is exposed to extensions.

## Translator API

Translator API is a separate browser translation engine, independent of the Prompt API option. It needs no account or API key. The option starts hidden and appears only when the extension document exposes Translator.availability() and Translator.create() and a probe finds a supported listed language pair. Browser branding is not checked. Probes never create translators or download language packs.

1. Choose **Translator API** and **Open browser translator**.
2. Click **Prepare language pack** for the displayed pair. Keep this tab open.
3. Grant site access and choose a supported target language in the popup. Page, block, and selected-text translation use the existing controls and shortcuts.
4. If another source/target pair requires a download, open the translator tab, prepare the displayed pair with another click, and retry the failed blocks. The extension does not download every language pack in advance.

Source language is detected with the browser extension language detector using the whole block. Short or ambiguous text uses its nearest declared page language where available; detection can be wrong. The picker shows targets with at least one supported source pair, and each actual pair is checked before use. Country variants are passed to the API; Traditional Chinese is kept distinct from Simplified Chinese.

Requests run one block at a time. Each text node is translated separately so inline elements, IDs, surrounding whitespace, restoration snapshots, and cached results remain intact. This can reduce linguistic context across inline boundaries compared with an LLM. Custom instructions are hidden and not passed to this engine; saved instructions remain available for other providers. Browser errors leave the original unchanged, and result validation uses the existing retry limit. Closing the translator tab cancels requests. No automatic cloud fallback is used.

The browser controls downloads, device eligibility, and processing location. No new permissions are requested. Actual browser model download and translation remain unverified in this development environment. See [Chrome Translator API documentation](https://developer.chrome.com/docs/ai/translator-api) and the [Translator API proposal](https://github.com/webmachinelearning/translation-api).

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

- Before sign-in, the popup shows the Yongil TRANSLATOR header, Settings button, and subscription/API connection choices. The options page shows the connection area. The options page unlocks after connection. Popup translation controls additionally require access to the current site, and hide again on sign-out.
- After sign-in, an unapproved site shows only a highlighted access card below the persistent header and Settings button. Translation controls, language/model settings, account information, and the footer stay hidden until access is confirmed. The card uses a larger, bold accent-colored title and two full-width buttons: **Allow only this site** grants access to the current site, while **Allow all sites** requests access to all HTTP and HTTPS websites. Both choices reveal the same translation controls after approval. The buttons stay disabled while a permission request is pending. Permission denial stays inside the card. Unsupported browser pages show an explanatory message with no permission button.
- Site access is required. The extension no longer requests temporary activeTab access. Popup actions, page shortcuts, and inference requests check the granted host permission; frames require access to both their own origin and the containing site. Revoking access hides the controls and stops translation jobs. Shortcuts require focus in the webpage and do not run in editors or the browser address bar. Existing on-page restoration controls remain available after sign-out.
- For cloud connections, Settings → Translation → Concurrent translation requests accepts 1–64, with a default of 16. The service worker shares this limit across tabs. Changes take effect when a new translation starts; requests already running are allowed to finish.
- Settings → Translation → Maximum retries accepts 0–10, with a default of 4 retries after the initial request (up to 5 attempts per batch). Invalid JSON/schema, incomplete streams, network errors, timeouts, and server errors retry with a short increasing delay. Each attempt has a 120-second timeout. Authentication, access, model, usage-limit, and cancellation errors stop immediately. Retries use the original input and the job's saved settings, keep the same concurrency slot, and do not advance completed-block progress until a valid result is applied. Each new request can consume subscription usage or incur API charges, according to the selected connection.
- If a completed response contains a valid JSON object followed only by redundant closing brackets or braces, the extension removes that suffix and validates every requested block and node before applying it. Translation text is preserved, and successful recovery needs no extra request, even when retries are disabled. Missing content, invalid IDs, truncated JSON, and other malformed output still follow the retry policy. Developer logs retain the raw response and record successful recovery as `translation.recovered`.
- Settings → Data & appearance → Developer mode enables the LOG icon in the popup header and settings. Clicking it toggles the native browser side panel in the current window: an open log panel closes, and a closed panel opens with retained and live diagnostics: extension actions, provider request bodies, streamed responses, errors, and retries. Expand entries to inspect the complete retained payload; search, filter severity, follow the latest entry, or clear history. Authentication headers, API key verification payloads, and OAuth token exchange payloads are not logged. API credential fields and recognizable key strings are redacted; raw API HTTP error bodies are omitted because they may echo credentials. Records can include private page text and custom instructions. Recording starts when enabled; the maximum log count is configurable from 1 to 1,000,000 (default 4,000), with the control shown only while developer mode is enabled. Recent entries within that count and the remaining default local storage quota are kept in trusted local extension storage across browser restarts. The quota is shared with settings, credentials, and the model list; 64 KiB is reserved for their updates. Lowering the entry limit trims existing history immediately. No unlimitedStorage permission is requested. Older entries are evicted and an exceptionally large entry is replaced with an explicit size-limit notice. Turning developer mode off stops recording and disables the panel but retains history until Clear logs or extension removal. Use LOG again or the upper-right X to close the panel; recording continues and saved history is preserved. The LOG tooltip and accessible pressed state follow whether the panel is open. Other browser windows are unaffected. The browser controls the panel's left/right placement. No separate popup window is created.
- Page batches run in parallel and display completed results immediately, even when earlier batches are still running.
- Within each document, page translation requests blocks that intersect the current viewport first, including partially visible blocks, then continues with the nearest offscreen blocks. Pending work is reprioritized after scrolling, resizing, zooming, or applying translations that can change the layout. Requests already sent continue normally; concurrent responses can still finish out of order.
- The bottom-right page toolbar includes a Translate page button, a thin progress bar along its top edge, and a completed/total block counter (for example, **16/120 Blocks** in English). Successfully applied results count even when their text matches the original. Failed, restored, or subsequently edited blocks do not count as completed. Counts describe tracked blocks in that document; detached blocks are excluded. The counter stays visible alongside errors. The page button dispatches translation to accessible frames and is disabled while that document is translating.
- The interface supports English and Korean. Settings → Data & appearance → UI language offers Follow browser settings (default), Korean, and English. Unsupported browser languages fall back to English. The preference applies to the popup, settings, page controls, and messages, including before sign-in. It is independent of the translation target.
- When no model is saved, the first returned model is selected and saved. Refreshing the list preserves an existing choice.
- Button-activated block selection stays active after every translate or restore click. Continue clicking blocks until using the cancel key, Exit block selection, closing the page toolbar, or switching tabs. Releasing modifier keys or moving focus between frames does not end button-activated selection.
- Page translation and restoration have separate shortcuts: **Alt+T** translates, and **Alt+R** stops pending work and restores the entire page. Translation keeps matching translated blocks and processes remaining blocks; it does not switch to restoration. Each shortcut has its own recording and Clear controls. Existing saved page shortcuts remain assigned to translation, while older settings receive the new restoration default. Actions reach all accessible frames, and holding a key does not repeat the action.
- Defaults are Alt+T, Alt+R, and Alt+click. Version 3 migrates the former Ctrl+Alt defaults once, including legacy Alt+Shift block defaults that have never been migrated. Other custom and disabled shortcuts are preserved, and choosing an older combination again after migration is respected. Popup translation, block and restoration buttons display their configured shortcuts. Existing saved concurrency values are retained; new or reset settings default to 16.
- Hovering over a block shows no action popup, including while translating. Only block selection displays a translate/restore hint. Use the page or extension popup controls to stop or retry page translations.
- Granting site access activates the already-loaded page before model discovery completes, without reloading it or starting a translation. Grants through Chrome's site-access menu also activate existing matching tabs. Shortcuts work once focus returns to the webpage. Future visits load the script automatically. After updating the extension itself, refresh pages that were already open once to replace their old content scripts.
- Selected-text translation uses the current model, target language, and instructions without replacing page text. It starts only when its button is clicked. Closing the popup cancels its request and discards late results. Selections are limited to 16,000 characters; editors and excluded content are ignored.
- The language field supports both list selection and direct input. Language choices show the native name followed by the UI-localized name, separated by **∙**. Regional variants include the country in both languages: for example, **English (United Kingdom) ∙ 영어 (영국)** in the Korean UI. Names appear only once when the target language matches the UI language. The list includes regional English, Portuguese, Spanish, French, German, and Chinese choices. Search accepts native/localized names, countries, and locale codes; custom targets remain supported.
- Regional choices are saved as native labels independently of the UI language, so switching the interface language preserves the selected target and country. The browser-language choice stays at the top, including its supported regional variant.
- The initial language is based on the **browser UI language**. A reliable way to read the operating system language from the extension has not been established, so it is not labeled as the OS language.
- The source language is detected internally and has no separate UI row.
- Custom instructions are saved explicitly and apply to translations started afterward.
- Restoring the entire page also restores blocks translated individually.
- Successfully applied block translations are cached in the current document, including pages with more than 200 blocks. Translating a restored block or page with matching original text, target language, model, enabled instructions, and account connection reuses the result without a new inference request. Changed text or settings use a separate cache entry. Refreshing the page, navigating to another URL, or clearing the temporary cache discards these entries. This translation cache is never saved to disk; optional developer diagnostics separately retain request and response text.
- Stopping translation and restoring original text are separate actions. Stopping preserves translations already applied.
- Results that arrive after restoration are discarded. Text updated by the site is not overwritten with an older original.
- Forms, editors, passwords, hidden elements, and code blocks are not collected. The extension reports exclusions when a single text node exceeds 16,000 characters or the traversal limit is reached.
- Accessible frames and open Shadow DOM are eligible for processing. Closed Shadow DOM and inaccessible frames are unsupported.

## Authentication and data

Select **ChatGPT subscription**, **OpenAI API**, or **Claude API** in the connection card, including before the first login. All three connections can be saved locally; changing the selected method preserves the other credentials and remembers each method's model choice. Switching or replacing credentials stops current jobs. **Disconnect** removes only the selected method's credential. There is no automatic fallback between providers.

OpenAI API mode validates the key with `GET https://api.openai.com/v1/models` and sends translations to `POST https://api.openai.com/v1/responses`, using streaming, `store:false`, and a strict JSON output schema. The model picker shows returned text-model families and selects the first entry when no model was saved. The model-list endpoint has no capability flags, so specific endpoint, project, and model restrictions are reported when a request is made. API usage is billed separately from a ChatGPT subscription. The same site permissions, restoration, caching, shortcuts, retries, and concurrency controls apply. Use **Replace API key** to change keys; saved keys are never prefilled in the UI.

Official references: [Model discovery](https://developers.openai.com/api/reference/resources/models/methods/list), [Responses streaming](https://developers.openai.com/api/docs/guides/streaming-responses), [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

Claude API mode uses only a user-supplied Anthropic API key; Claude subscription login and OAuth tokens are not supported. It validates the key and retrieves the paginated model catalogue from GET https://api.anthropic.com/v1/models, then translates through POST /v1/messages. The first model is selected when no preference exists, retired models are excluded, and API display names are preserved. Models advertising structured-output support receive output_config.format with the translation JSON schema; other models use the same JSON instructions and strict local block/node validation. Streaming must finish with end_turn before results apply. Truncated output retries with a higher token limit when the model allows it, within the configured retry count; refusals stop immediately. Claude API usage is billed by Anthropic. Keys are sent only to the matching fixed API origin, never to another provider.

Claude references: [Models](https://platform.claude.com/docs/en/api/models/list), [Messages streaming](https://platform.claude.com/docs/en/build-with-claude/streaming), [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

For ChatGPT subscription connections, the extension handles OAuth Authorization Code + PKCE internally. It observes the code when the dedicated sign-in tab navigates to the designated callback URL, so no local server or companion application is installed. It uses a flow compatible with the public Codex client and does not guarantee the same support as the official subscription integration for general third-party applications. Behavior with a real account requires separate verification.

Credentials and diagnostic history are not exposed to content scripts. Tokens and user-supplied API keys are held in extension local storage restricted to trusted contexts. This is not an OS-encrypted credential vault. Translation caches and restoration snapshots remain in the current page's memory; opt-in developer logs separately retain copies of requests and responses locally. Settings exports include only allowed fields and exclude credentials and logs. See the [Privacy Notice](PRIVACY.md) for details.

## Development and verification

The implementation uses JavaScript ES modules and standard DOM APIs with no runtime dependencies. Instead of the initially proposed TypeScript, Vite, and React stack, it can be installed directly as an unpacked extension. Node.js 20 or later is needed only for development checks and packaging.

```sh
npm test
npm run check
npm run package
```

Tests verify OAuth validation, output structure and streaming, original-text restoration, cancellation races, service-worker message boundaries, and account state without making requests with a real account. Actual browser verification procedures and recorded results are in [TESTING.md](TESTING.md).

- `extension/`: directly installable extension
- `extension/lib/`: localization, settings, OAuth, API-key connections, provider requests, and response validation
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
