# Verification Record

Review date: 2026-10-19

## Completed checks

- Unit and regression tests: **46 passed**
- Mock service-worker integration tests: **26 passed**
- Page-job and block-interaction regression tests: **31 passed**
- UI state tests with mock DOM and browser APIs: **40 passed**
- Localization catalog and preference tests: **8 passed**
- Selected-text popup regression tests: **6 passed**
- Page-toolbar progress and action tests: **4 passed**
- Retry and diagnostic-storage tests: **20 passed**
- Log side-panel UI tests: **7 passed**
- API connection and provider-isolation tests: **12 passed**
- Claude API connection, streaming, and isolation tests: **19 passed**
- On-Device AI capability detection, language support, bridge, and lifecycle tests: **33 passed**
- Translator API capability, source detection, language-pack lifecycle, UI, isolation, and retry tests: **26 passed**
- Hidden native-execution integration tests: **17 passed**
- Source-language selection and prepared-pair management tests: **13 passed**
- Extension JavaScript syntax checks: **29 files passed**
- Brand PNG icon visual inspection: 128px output reviewed
- ZIP packaging: verified the installation file list and included manifest and icons

Tests ran in a local JavaScript execution environment. They do not replace actual extension E2E tests using a browser DOM or tests with a real provider account. Provider transport, browser APIs, accounts, and tokens are mocked. Response fixtures include a replay of the user-reported public-text translation failure, with account identifiers and provider metadata excluded.

Key coverage:

- Claude API selection in both screens and UI languages; paginated model discovery, capability-gated JSON output, Messages streaming across byte/Unicode boundaries, truncation with bounded token-limit retries, refusal handling, and cancellation
- Three-provider credential/model isolation, rejection of mismatched API keys and Claude OAuth tokens, safe errors and log redaction, stale model-refresh rejection, and no cross-provider fallback

- Subscription/API selection before connection, masked key submission and immediate field clearing, failed verification, key replacement/disconnection, separate model preferences, first-model selection, unchanged site-permission gates, and English/Korean billing/status/error labels
- Fixed public API origin, cookie-free requests with redirects rejected, strict JSON schema and streamed Responses output, no subscription headers in API requests, separate connection/cache identities, cancellation on provider changes, serialized connection changes, and rejection of stale model writes
- Trusted-context-only API credential storage, no keys in status/settings/model results or exports, rejected content/log-panel credential actions, no OAuth refresh for API 401 errors, quota/rate/access errors, and redaction/omission of provider errors that echo keys

- Standard PKCE test vector, exact callback address and state, signature, issuer, audience, expiration, and nonce
- Rejection of malformed translation structures, missing or duplicate IDs, and incomplete or failed streams
- Recovery of a complete JSON object with extra trailing closing delimiters, exact preservation of all eight reported translations, escaped quotes/backslashes and Unicode, strict content validation after recovery, raw-response diagnostics, and rejection of prose, additional JSON values, internal syntax errors, or truncated responses
- Configurable retries (0–10, default 4 additional attempts), original-input reuse, corrective JSON instructions, stream/network/server recovery, per-attempt timeout, cancellation during backoff, and account changes between attempts
- Opt-in local diagnostic history, live stream events, credential-field redaction, trusted UI boundaries, restart persistence, configurable 1–1,000,000 entry retention (default 4,000), shared native storage quota accounting, concurrent quota changes, full-storage eviction, immediate limit reductions, clearing during active requests, and storage-error recovery
- Current-window LOG toggling in popup and settings, Chromium side-panel contexts reporting windowId -1, initially open panels, hidden panels and regular log tabs, native close events and legacy polling, stale context responses, duplicate-click suppression, failed operations, trusted status/close messages, and preserved recording/history
- Native side-panel opening from LOG, search and severity filters, stable chronological ordering, inert payload rendering, follow-scroll behavior, a close button that preserves recording/history, and English/Korean labels
- Immediate activation before model discovery, permission grants outside the popup, and Alt shortcuts after content enable without navigation
- Page and block restoration, restoration of selected blocks within a batch, and rejection of late results after restoration
- Document-local cache reuse after block/page restoration, retention across 240 blocks, mixed cached/edited batches, separate settings/account results, fresh-document cache misses, explicit cache clearing, and exclusion of late/cancelled results
- Independent Alt+T translation and Alt+R restoration, editable and disabled shortcuts, legacy settings/import defaults, suppression of repeat events, editor/composition exclusions, and separate settings rows
- Translation and restoration dispatch the requested action to all accessible frames regardless of existing translated blocks; content requests are confined to their authorized sender tab
- Alt defaults and version-3 migration of previous Ctrl+Alt defaults; preserved custom/disabled shortcuts and later explicit choices
- Alt-click and persistent button-activated block selection toggle translation/restoration using the actual click target; ordinary hover stays silent, including during translation
- Continued selection after multiple clicks, key release, and frame focus changes; coordinated cancellation through Escape, toolbar toggles, popup toggles, and tab visibility changes
- First available model selection only when no previous choice exists; saved choices and empty model lists remain unchanged
- Browser-language detection, English fallback, manual English/Korean selection, live updates across extension screens/content scripts, localized accessibility labels, and preservation of unsaved drafts
- Native and UI-localized language/country names, same-language deduplication, regional browser defaults, native/localized/code search, keyboard selection, custom targets, and stable saved targets across UI-language changes
- Selection popup requests only after a button click; plain-text output, dragging and viewport clamping, close/stop races, overlapping jobs, length limits, and editor exclusions
- Original text as the input for retranslation; preservation across site edits, node replacement, and DOM restructuring
- Configurable concurrency (1–64, default 16), shared limits across tabs, and draining active requests after a lower limit is selected
- Out-of-order batch completion, page and block restoration during parallel requests, cancellation, usage-limit failures, and recoverable batch errors
- Viewport-first request ordering, partially visible/tall blocks, horizontal exclusion, nearest offscreen work, scroll/resize/zoom updates, layout changes after applying translations, stable document-order ties, and one geometry read per element per priority pass
- Blocking account-management access from content scripts and keeping tokens private
- Recognizing the options page when Chrome supplies tab metadata, including query strings and hash anchors; sharing the popup account and settings; rejecting unrelated URLs and extension identities
- Rejecting job ID reuse across documents and fixing settings at job start
- Request handling for sign-out, excluded sites, and explicit original-text restoration
- Signed-out connection views; persistent popup title and Settings button; permission-only connected views; delayed access checks; grant, denial, and revocation; unsupported pages; and stale approval/check responses after sign-out
- Separate site-only and all-sites permission requests, successful activation with either scope, duplicate prompt suppression, and denial or stale approval handling for both buttons
- Translation cannot use earlier temporary activation: page actions and inference require granted host permissions, including the containing site for frames; granting permission activates the current page without inference

## User-reported verification

The user reported successful translation with GPT-6.1 Sol on 2026-10-15. This report predates the configurable concurrency and popup changes. No live latency measurements or browser automation results are inferred from it.

On 2026-10-16, the user supplied a Luna failure from attempt 4 of 5. All eight requested blocks were translated, but an extra `]}` followed the complete root object. The same suffix appeared in the streamed deltas and final provider output, confirming malformed provider output for this attempt rather than duplication by the extension's stream reader. Previously, strict JSON parsing rejected the entire batch and caused it to be requested again. The supplied attempt alone does not establish the cause of every earlier failure.

The regression fixture in `tests/fixtures/luna-extra-closers.json` replays that final output without account metadata. It now passes the existing block, node, and text checks after removing only the redundant suffix. Tests verify success with zero retries, unchanged translated text, preserved raw diagnostics, and continued retries for unrecoverable output. The fix has not been tested against a live Luna request in Chrome.

On 2026-10-17, the user reported that clicking LOG again did not close an open panel. The previous implementation filtered runtime contexts by the browser window ID, but Chromium reports `windowId: -1` for side-panel contexts. The previous mock incorrectly supplied a real window ID. A regression using Chromium's return shape fails with the previous code and passes with the corrected discovery logic. This reproduces the faulty state detection offline; live browser verification remains pending.

## Checks not yet completed

On 2026-10-18, a live API model-discovery check was attempted with a user-supplied key held only in process memory. The execution environment rejected network access with `EACCES`; the key was not written to source, tests, logs, or packages. The browser inventory returned no connected apps or browsers. Live API authentication, billing/quota availability, model access, translation, and browser rendering are therefore unverified. The API regression suite uses synthetic credentials and a mocked transport, not the supplied key.

| Item | Status and reason |
|---|---|
| Actual Chrome extension installation and UI review | No connected browser; a headless popup preview also failed because Chrome GPU subprocesses exited |
| Authentication with the specified, already signed-in account | Not performed because no browser control connection was available |
| Live model discovery, inference, and token refresh | Unverified because sign-in with a real account was not completed |
| Page/block translation and restoration in Chrome | Actual browser E2E tests were not run |
| Edge and Brave | Not tested |
| Icons and UI across all display scales and themes | The full set of combinations was not tested |
| Git commits | The user manages commits; these changes are left uncommitted |

The browser-launch tool returned `Browser is not available: chrome`, and the browser list was also empty afterward. This limitation is not treated as an account sign-in failure. A subsequent headless Chrome attempt with an isolated preview profile exited with “GPU process is not usable” before a screenshot was produced. The permission-card layout and colors still require visual browser review.

## Re-running checks

Run the same checks with Node.js 20 or later:

```sh
npm test
npm run check
npm run package
```

The raw execution results are stored in [test-results.json](test-results.json).

## Browser verification procedure

1. Load `extension/` in Chrome Developer mode.
2. Start account sign-in from the popup and verify that it uses the account from the existing session. Do not copy passwords or tokens into logs or documents.
3. With no saved model, retrieve the live list and verify that the first returned model is selected and saved. Choose a different model, refresh, and verify that the choice is preserved. Verify a real translation using a short piece of public text.
4. Run `node scripts/serve-fixture.mjs`, then open `http://localhost:3185/fixture.html`. This server is only for the development fixture and is not required to install, authenticate, or use the extension normally.
5. Translate the page and hover over a translated or translating block: no block action popup should appear. Restore one block with Alt-click, including without first moving the pointer, then restore another using block selection mode. Restore the entire page. Link click behavior and emphasis/table structure must be preserved.
6. Translate two blocks individually, then restore both using page restoration.
7. Restore the original text while page translation is in progress, and verify that late responses do not change the text afterward.
8. Use the site-text update button in a translated paragraph, then restore the original text. The site's new text must remain intact.
9. Verify that forms, editors, code, and hidden elements are not translated.
10. Check Alt+T, Alt+R, holding Alt and clicking, configured alternative shortcuts, and selection cancellation. Upgrade version-2 settings containing Ctrl+Alt defaults and unmigrated legacy Alt+Shift block settings; verify the one-time Alt migration; retain other custom shortcuts and disabled keys. Enter block selection from both buttons, click several blocks to translate or restore them, and verify that the mode remains active. Verify Exit block selection, the configured cancel key with the toolbar focused, popup toggling, tab changes, and multi-frame cancellation.
11. Check refreshes, SPA navigation, frames, open Shadow DOM, sign-out, and offline restoration.
12. Review the popup and settings screen in light and dark themes at 100%, 125%, 150%, and 200% display scaling.
13. Verify that the signed-out popup retains its Yongil TRANSLATOR header and Settings button above the ChatGPT connection area, including during login. The options page should show its connection area until sign-in. Complete login and verify that controls appear. Open Settings from the signed-in popup and confirm that the existing account is recognized without signing in again, including when navigating directly to an options hash anchor. Sign out and confirm that controls hide again without briefly flashing.
14. Sign in on an unapproved website. Verify that only the header, Settings button, and highlighted access card appear, with no translation, settings, account, or footer controls. Verify the bold accent title, primary **Allow only this site** button, and outlined **Allow all sites** button in both themes and languages. Confirm the browser request covers only the current site for the first choice and HTTP/HTTPS websites for the second; both buttons stay disabled while the prompt is open. Repeat the following checks with each choice. Decline access: controls stay hidden and the denial message appears inside the card. Grant access: the card disappears, controls appear, and the page script activates without sending text. Revoke access: controls hide and jobs stop. Verify that delayed checks and approvals cannot reveal controls after sign-out. Restricted browser pages show an unsupported-page explanation without a permission button.
15. Set concurrent requests to 1, 16, and 64; start fresh translations across two tabs and verify the shared limit. Confirm that lowering the value drains requests already running without exceeding the new limit afterward. Verify that export/import preserves the setting and older settings receive the default of 16.
16. Compare time to first completed translation and time to full completion on the same page and model with cold caches. A concurrency increase does not imply an equal multiplier in live speed.
17. Verify popup, settings, page controls, accessibility labels, and errors with English and Korean browser UI languages. With an unsupported browser language, verify English fallback. In Settings → Data & appearance, choose each UI language and return to Follow browser settings. Open multiple extension screens and a translated page: verify immediate updates, preserved translation targets/models/drafts, and saved overrides after reopening, export/import, and reset. Browser-owned metadata continues to follow the browser language.
18. Drag to select supported page text. Confirm that a translation button appears but no request is sent until it is clicked. Verify the translated result, title dragging, native corner resizing, scrolling, Close, and Escape. Confirm that page text is unchanged and editor selections are ignored. Close during translation and immediately start another selection; late results must not reopen the popup or overwrite the newer result. Repeat in dark mode and narrow viewports. The resize handle and actual rendered layout require these browser checks; mock tests cover behavior and CSS configuration only.
19. Translate a block, restore it, and translate it again with both Alt-click and button-activated selection. Verify that the cached result appears without another inference request. Repeat with page restoration on a page containing more than 200 blocks. Change one source block and verify that only that block sends a new request. Change the target, model, enabled instructions, or account connection to verify separate cache entries. Refresh the page and verify that translation requires a fresh request. Clearing the cache must preserve restoration snapshots.
20. In Settings → Shortcuts, verify separate translation and restoration rows with the same recording/Clear controls as block selection and cancellation. Alt+T must translate on both an original page and a partially translated page without restoring completed blocks. Alt+R must stop pending work and restore all translated blocks, including accessible frames. Holding either shortcut must not repeat the action. Change and clear each shortcut independently, then verify reopening settings and export/import. Editors and the address bar must not trigger either action. Site access remains required.
21. In Korean UI, verify 한국어 appears once; English (United States), English (United Kingdom), English (Australia), Português (Brasil), and Português (Portugal) show native and Korean labels with regional names. Switch to English UI and confirm English entries appear once and the selected translation target keeps its country. Verify browser-language ordering, filtering by native/localized country names and locale codes, keyboard selection, and free-text targets. Review wrapping in the popup and options page.
22. On a long page, set concurrency to 1, scroll to the middle, and start a fresh translation. Verify that requests contain visible blocks before offscreen blocks, including paragraphs that are only partly visible. Scroll elsewhere while a request is in flight: after it finishes, the next request should prioritize the new viewport. Repeat with window resizing, zooming, and several concurrent requests. In-flight requests must continue, every eligible block must eventually translate once, and the progress counter must increase only after results are applied. Repeat from a cold cache to distinguish request ordering from cache reuse.
23. Set maximum retries to 0 and 4. With public test text, verify unrecoverable malformed or incomplete responses retry up to the configured limit, preserve original input, and advance progress only after valid output is applied. A complete JSON object followed only by extra closing delimiters should pass full validation without another request; developer logs should retain the raw output and include `translation.recovered`. Stop or restore during retry backoff; no subsequent request should be sent. Authentication, access, and usage-limit failures must stop immediately.
24. Enable Developer mode in Data & appearance. Open LOG from the popup and verify the native side panel alongside the webpage (placement follows the browser setting). Expand requests and responses, inspect streaming updates, search/filter, disable Follow latest, and clear history during an active request. While the panel is open, reopen the popup and click LOG to close it; click LOG again to reopen it. Repeat from settings and after closing with the panel's X or the browser control. The tooltip and accessible pressed state should follow the panel state, recording must continue, and retained and newer entries must still be present. Repeat with two browser windows; toggling in one must not close the other's panel. Verify Maximum log entries appears only in developer mode, defaults to 4,000, accepts 1 and 1,000,000, and rejects out-of-range values. Lowering the count must trim older logs immediately. Fill the standard local quota with sample logs to verify oldest-first eviction without damaging settings or credentials. Reopen the browser to check retained history. Turn developer mode off to stop recording; re-enable and clear logs afterward. Use only nonpersonal sample text and English UI for screenshots.
25. Revoke and grant site access without reloading. Verify Alt-click and Alt+T after returning focus to the webpage, even while model discovery is slow or fails. Repeat with Chrome's site-access menu. No automatic navigation or translation should occur on permission grant.
26. Verify that the floating toolbar's circular X overlaps its upper-right corner, remains visible in light/dark themes and narrow viewports, has a localized accessible name, and dismisses the toolbar without stopping an ongoing translation.
27. Repeat equivalent checks in Edge and Brave and record the actual compatibility results.

## Store preparation checks

All 308 automated checks pass, including redundant-JSON-suffix recovery, retries, diagnostic logs, immediate permission activation, viewport-first scheduling, toolbar progress, GitHub links, Alt defaults, and 1–64 concurrency. The maximum-concurrency regression starts 64 simultaneous batches and completes the remaining work. Both English and Korean popup shortcut labels are checked. The promotional PNGs are English artwork, not captured browser screenshots. Isolated Chrome and Edge screenshot attempts failed with GPU-process errors; actual English screenshots remain pending. See [store assets and capture status](store/README.md).

## Page toolbar progress

The real toolbar rendering and job functions are exercised with mock DOM/browser APIs. Checks cover 16/120 completed blocks with queued batches, cached results, unchanged successful output, failed requests, edited/detached text, restoration, accessible progress values, indeterminate preparation, English/Korean labels, and page translation dispatch. Actual Chrome visual review remains pending. In a browser, verify the four-pixel top-edge bar at narrow widths and in light/dark themes, and confirm that the counter remains visible with an error message.

The earlier computer-use inventory had no connected browser. LOG toggling has been verified with mock browser APIs, including the older-Chromium close fallback, but requires live browser verification. Native side-panel behavior and the updated circular toolbar close button remain pending actual Chrome visual verification.

The toggle uses [runtime.getContexts](https://developer.chrome.com/docs/extensions/reference/api/runtime#method-getContexts) to discover log side-panel documents without a window filter. [Chromium's runtime regression test](https://chromium.googlesource.com/chromium/src/+/cc748d4034cf809a90bead06f9f9dcabd0dbbaf5/chrome/browser/extensions/api/runtime/runtime_apitest.cc) records `windowId: -1` for these contexts. A trusted status message asks the panel to identify its owning window and visibility; regular tabs displaying the log page do not answer. State is resolved before the LOG button is enabled so opening remains within the click gesture. Closing uses [sidePanel.close](https://developer.chrome.com/docs/extensions/reference/api/sidePanel#method-close) when available (Chrome 141+) and a trusted, window-scoped message to the panel otherwise. Lifecycle events are optional; polling also detects manual closure or hidden panels.

## API verification procedure

After reloading the unpacked extension, choose OpenAI API in the connection card and enter a test key privately. Confirm verification clears the field, selects the first model when no API preference exists, and still requires website access. Translate public fixture text, restore it, and check the document cache. Switch between subscription and API during an active request; old results must not apply and model choices must remain separate. Check key replacement, rejected/restricted keys, insufficient quota, API rate limits, and Disconnect. Verify request headers and credentials never appear in the developer log or exported settings. API usage is separately billed; use a short public fixture and a small request count. Keep all screenshots in English and omit credentials/account identifiers.

## Claude API verification status

On 2026-10-19, the supplied Claude key was used only in process memory for a GET /v1/models smoke check against api.anthropic.com. Outbound access was rejected with EACCES before an HTTP response. The key was cleared from memory without writing it or the account email to project files. Live authentication, available quota/models, and translation remain unverified. The browser inventory again returned no apps or browsers; no new browser screenshots were captured.

For manual verification, reload the unpacked extension, choose Claude API, enter the key privately, and connect. Confirm the first returned model is selected, its API display name appears, and site access is still required. Translate a short public page, a block, and a selection, then restore and repeat from cache. Switch among all three connection methods during translation and confirm cancellation plus separate model preferences. Check replacement, disconnect, model refresh, and developer log redaction. Claude offers no subscription or OAuth login. Keep screenshots in English and exclude keys and account identifiers.

## On-Device AI verification status

On 2026-10-19, 33 tests covered capability-based detection without browser branding, all recognized availability states, absent/partial APIs, policy errors, timeouts, hidden controls on unsupported devices, and compatible Samsung/Edge/unbranded test profiles. Language tests cover browser-reported Korean support, regional targets, unsupported configurations, exact source/target options, and additional downloads requiring another user click. Bridge tests retain exact sender checks, single-request/single-block scheduling, cancellation, tab closure, connection isolation, bounded JSON retries, diagnostics, context errors, and session destruction. A saved local-mode preference on an unsupported browser stays disconnected until the user explicitly chooses another connection.

The English popup and model setup page were visually reviewed in the in-app browser against an isolated localhost preview with mocked browser and LanguageModel APIs. The preview shows On-Device AI under an Edge profile with a compatible API and hides it under a Chrome profile reporting unavailable. Updated labels and setup-page layout were inspected. This is a UI test double, not an installed extension or real browser model. Setup activation and readiness are also exercised in the automated document harness.

Manual release checks still required: install the unpacked extension in each intended browser; confirm actual Prompt API exposure, availability, language support, and processing location; prepare the model with a direct user click; verify download progress/cancellation; translate short public text; restore/retranslate from cache; close the setup tab after background readiness and confirm inference continues; explicitly Stop and verify cancellation; test unsupported source/target languages and context errors; switch providers; restart the worker/browser. Confirm API-unavailable devices hide the option regardless of brand. The extension must not issue OpenAI/Anthropic translation requests in this mode. Browser-managed processing and transfers require separate verification. Keep release screenshots in English and distinguish mocked previews from real extension captures.

## Translator API verification status

26 dedicated Translator cases, 17 hidden-execution integration cases, and 13 source-language cases pass, bringing the full suite to 308 passes. They cover API-method and pair availability probes without downloads; browser-brand independence; unavailable/blocked/timed-out API behavior; regional/Chinese script mapping; source detection and page-language hints; plain-text node translation with whitespace and IDs retained; same-language bypass; prepared-session reuse; gesture-required new language packs; cancellation and cleanup; strict runner identity; provider switching; no cloud fallback; omitted custom instructions; bounded retries; diagnostics; and both UI languages. All 29 extension JavaScript files pass syntax checks.

English connected/unsupported popup states and the translator setup page were inspected in the in-app browser using mocked browser APIs. The setup button transitioned to Ready, and unsupported previews showed no native API choices. These were local UI previews, not real extension captures or live browser translation.

Manual checks still required: install in each intended browser, confirm Translator exposure in extension documents, prepare a real language pair with a direct click, check download progress and cancellation, translate public English/Korean and mixed-language text, prepare a second source/target pair, retry failed blocks, verify inline layout/restoration/cache, and close the prepared tab during work to confirm background translation continues. Explicit Stop must cancel work. Test policy-blocked devices, unsupported pairs, worker restarts, and provider switches. Confirm the extension issues no cloud provider requests in this mode; inspect browser-managed processing separately.

## Background execution and language-pack selectors

The setup page offers localized Source and Target language selectors with native/regional names. Tests cover selected-pair creation from the original click, unavailable/same-language pairs, readiness feedback, and reopening setup for an additional required pair. These selectors prepare packs independently of the translation target in Settings and the per-page source selected in the popup.

The hidden-execution suite runs the real iframe engine against mocked browser AI APIs and exercises both provider bridges: preparation-tab closure before/during translation, one shared offscreen host, lazy restoration after worker restart, document recreation, exact sender checks, cancellation, provider switching, setup/Stop races, language-pack requests, explicit disconnect, and visible-tab fallback. It verifies no cloud requests or credentials enter the native execution channel. The offscreen parent scripts a packaged same-origin iframe using the IFRAME_SCRIPTING reason; only runtime messaging is used by the offscreen host.

English selectors and background-ready feedback were reviewed in an isolated browser preview with mocked APIs. No installed extension, real offscreen model initialization, download, or native inference has been verified in this environment. Manual checks: reload the extension with its offscreen permission; prepare a pair/model and wait for the close-tab confirmation; close setup before starting and during translation; restore/retranslate; restart the worker/browser; prepare a new source pair; stop/disconnect during setup and inference; verify explicit tab fallback when hidden creation is blocked. Test each intended browser/device.

## Popup source languages and prepared language pairs

Thirteen dedicated cases cover supported-browser page detection, Auto fallback, retained explicit Auto, editable cloud source names, closed native language selectors, source/target availability, identity translation, automatic setup before page translation, prepared-pair status and record removal, per-tab/document isolation, frozen job prompts, cache identity, trusted-message boundaries, stale-document rejection, navigation cleanup, and explicit-source precedence. Two further hidden-execution cases verify explicit sources without redetection and exact missing-pair setup, reuse/reopening of setup tabs, and prepared-pair records. Translator tests also reject identity-only capability reports and preserve manual setup choices during status inspection.

English popup and Settings previews were inspected with mocked APIs: detected English, native French selection, cloud Auto/custom input, and removing one prepared-pair record. No real download or browser-owned file deletion was performed. The Translator API exposes neither a complete installed-pack inventory nor an uninstall operation; Settings lists pairs prepared by this extension, and Remove from list only deletes that record.

Manual checks: detect the active page language on a compatible browser; select another source or Auto; verify Alt+T, block, and selected-text translation use it; restore/retranslate with the new cache identity; reload or navigate and confirm fresh detection. Verify cloud custom language names and native supported choices in both UI languages. Request an unprepared pair, prepare it in the automatically opened tab, then retry. Confirm Settings adds that pair, refreshes browser-reported availability, and removes only the chosen record while leaving browser-managed files intact.

## Experimental On-Device AI opt-in

Both switches default off for new and existing settings. Nine added On-Device AI cases cover strict boolean validation and legacy imports, all four switch combinations without disabled capability probes, signed-out settings, English/Korean performance warnings, unsupported browsers and unaffected Translator API, restored native language lists after re-enabling, live cross-page settings updates, worker/setup/readiness guards, cancellation from either switch, and direct setup-page revocation. One additional hidden-execution case cancels in-flight inference and clears readiness for both switches.

The English signed-out Settings page was visually reviewed with mocked APIs. The experimental section is last, enabling the parent reveals the individual switch and warning, and enabling On-Device AI then reveals its connection method. Real browser model performance has not been measured here. Manual checks: confirm both switches default off after upgrading an existing installation; enable each in sequence; prepare and translate using a real supported browser; turn either switch off during preparation and translation; verify cancellation and synchronized popup/setup views; confirm Translator API remains available independently.
