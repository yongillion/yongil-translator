# Verification Record

Review date: 2026-10-16

## Completed checks

- Unit and regression tests: **38 passed**
- Mock service-worker integration tests: **22 passed**
- Page-job and block-interaction regression tests: **22 passed**
- UI state tests with mock DOM and browser APIs: **23 passed**
- Localization catalog and preference tests: **8 passed**
- Selected-text popup regression tests: **6 passed**
- Extension JavaScript syntax checks: **13 files passed**
- Brand PNG icon visual inspection: 128px output reviewed
- ZIP packaging: verified the installation file list and included manifest and icons

Tests ran in a local JavaScript execution environment. They do not replace actual extension E2E tests using a browser DOM or tests with a real provider account. Accounts, tokens, models, and inference responses in integration tests are mock test values, not real user information.

Key coverage:

- Standard PKCE test vector, exact callback address and state, signature, issuer, audience, expiration, and nonce
- Rejection of malformed translation structures, missing or duplicate IDs, and incomplete or failed streams
- Page and block restoration, restoration of selected blocks within a batch, and rejection of late results after restoration
- Document-local cache reuse after block/page restoration, retention across 240 blocks, mixed cached/edited batches, separate settings/account results, fresh-document cache misses, explicit cache clearing, and exclusion of late/cancelled results
- Independent Ctrl+Alt+T translation and Ctrl+Alt+R restoration, editable and disabled shortcuts, legacy settings/import defaults, suppression of repeat events, editor/composition exclusions, and separate settings rows
- Translation and restoration dispatch the requested action to all accessible frames regardless of existing translated blocks; content requests are confined to their authorized sender tab
- Ctrl+Alt defaults and one-time legacy migration; preserved custom/disabled shortcuts and later explicit Alt+Shift choices
- Ctrl+Alt-click and persistent button-activated block selection toggle translation/restoration using the actual click target; ordinary hover stays silent, including during translation
- Continued selection after multiple clicks, key release, and frame focus changes; coordinated cancellation through Escape, toolbar toggles, popup toggles, and tab visibility changes
- First available model selection only when no previous choice exists; saved choices and empty model lists remain unchanged
- Browser-language detection, English fallback, manual English/Korean selection, live updates across extension screens/content scripts, localized accessibility labels, and preservation of unsaved drafts
- Native and UI-localized language/country names, same-language deduplication, regional browser defaults, native/localized/code search, keyboard selection, custom targets, and stable saved targets across UI-language changes
- Selection popup requests only after a button click; plain-text output, dragging and viewport clamping, close/stop races, overlapping jobs, length limits, and editor exclusions
- Original text as the input for retranslation; preservation across site edits, node replacement, and DOM restructuring
- Configurable concurrency (1–16, default 8), shared limits across tabs, and draining active requests after a lower limit is selected
- Out-of-order batch completion, page and block restoration during parallel requests, cancellation, usage-limit failures, and recoverable batch errors
- Blocking account-management access from content scripts and keeping tokens private
- Recognizing the options page when Chrome supplies tab metadata, including query strings and hash anchors; sharing the popup account and settings; rejecting unrelated URLs and extension identities
- Rejecting job ID reuse across documents and fixing settings at job start
- Request handling for sign-out, excluded sites, and explicit original-text restoration
- Signed-out connection views; persistent popup title and Settings button; permission-only connected views; delayed access checks; grant, denial, and revocation; unsupported pages; and stale approval/check responses after sign-out
- Separate site-only and all-sites permission requests, successful activation with either scope, duplicate prompt suppression, and denial or stale approval handling for both buttons
- Translation cannot use earlier temporary activation: page actions and inference require granted host permissions, including the containing site for frames; granting permission activates the current page without inference

## User-reported verification

The user reported successful translation with GPT-6.1 Sol on 2026-10-15. This report predates the configurable concurrency and popup changes. No live latency measurements or browser automation results are inferred from it.

## Checks not yet completed

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
5. Translate the page and hover over a translated or translating block: no block action popup should appear. Restore one block with Ctrl+Alt-click, including without first moving the pointer, then restore another using block selection mode. Restore the entire page. Link click behavior and emphasis/table structure must be preserved.
6. Translate two blocks individually, then restore both using page restoration.
7. Restore the original text while page translation is in progress, and verify that late responses do not change the text afterward.
8. Use the site-text update button in a translated paragraph, then restore the original text. The site's new text must remain intact.
9. Verify that forms, editors, code, and hidden elements are not translated.
10. Check Ctrl+Alt+T, Ctrl+Alt+R, holding Ctrl+Alt and clicking, configured alternative shortcuts, and selection cancellation. Upgrade settings containing the old Alt+Shift default and verify the one-time Ctrl+Alt migration; retain other custom shortcuts and disabled keys. Enter block selection from both buttons, click several blocks to translate or restore them, and verify that the mode remains active. Verify Exit block selection, the configured cancel key with the toolbar focused, popup toggling, tab changes, and multi-frame cancellation.
11. Check refreshes, SPA navigation, frames, open Shadow DOM, sign-out, and offline restoration.
12. Review the popup and settings screen in light and dark themes at 100%, 125%, 150%, and 200% display scaling.
13. Verify that the signed-out popup retains its Yongil TRANSLATOR header and Settings button above the ChatGPT connection area, including during login. The options page should show its connection area until sign-in. Complete login and verify that controls appear. Open Settings from the signed-in popup and confirm that the existing account is recognized without signing in again, including when navigating directly to an options hash anchor. Sign out and confirm that controls hide again without briefly flashing.
14. Sign in on an unapproved website. Verify that only the header, Settings button, and highlighted access card appear, with no translation, settings, account, or footer controls. Verify the bold accent title, primary **Allow only this site** button, and outlined **Allow all sites** button in both themes and languages. Confirm the browser request covers only the current site for the first choice and HTTP/HTTPS websites for the second; both buttons stay disabled while the prompt is open. Repeat the following checks with each choice. Decline access: controls stay hidden and the denial message appears inside the card. Grant access: the card disappears, controls appear, and the page script activates without sending text. Revoke access: controls hide and jobs stop. Verify that delayed checks and approvals cannot reveal controls after sign-out. Restricted browser pages show an unsupported-page explanation without a permission button.
15. Set concurrent requests to 1, 8, and 16; start fresh translations across two tabs and verify the shared limit. Confirm that lowering the value drains requests already running without exceeding the new limit afterward. Verify that export/import preserves the setting and older settings receive the default of 8.
16. Compare time to first completed translation and time to full completion on the same page and model with cold caches. A concurrency increase does not imply an equal multiplier in live speed.
17. Verify popup, settings, page controls, accessibility labels, and errors with English and Korean browser UI languages. With an unsupported browser language, verify English fallback. In Settings → Data & appearance, choose each UI language and return to Follow browser settings. Open multiple extension screens and a translated page: verify immediate updates, preserved translation targets/models/drafts, and saved overrides after reopening, export/import, and reset. Browser-owned metadata continues to follow the browser language.
18. Drag to select supported page text. Confirm that a translation button appears but no request is sent until it is clicked. Verify the translated result, title dragging, native corner resizing, scrolling, Close, and Escape. Confirm that page text is unchanged and editor selections are ignored. Close during translation and immediately start another selection; late results must not reopen the popup or overwrite the newer result. Repeat in dark mode and narrow viewports. The resize handle and actual rendered layout require these browser checks; mock tests cover behavior and CSS configuration only.
19. Translate a block, restore it, and translate it again with both Ctrl+Alt-click and button-activated selection. Verify that the cached result appears without another inference request. Repeat with page restoration on a page containing more than 200 blocks. Change one source block and verify that only that block sends a new request. Change the target, model, enabled instructions, or account connection to verify separate cache entries. Refresh the page and verify that translation requires a fresh request. Clearing the cache must preserve restoration snapshots.
20. In Settings → Shortcuts, verify separate translation and restoration rows with the same recording/Clear controls as block selection and cancellation. Ctrl+Alt+T must translate on both an original page and a partially translated page without restoring completed blocks. Ctrl+Alt+R must stop pending work and restore all translated blocks, including accessible frames. Holding either shortcut must not repeat the action. Change and clear each shortcut independently, then verify reopening settings and export/import. Editors and the address bar must not trigger either action. Site access remains required.
21. In Korean UI, verify 한국어 appears once; English (United States), English (United Kingdom), English (Australia), Português (Brasil), and Português (Portugal) show native and Korean labels with regional names. Switch to English UI and confirm English entries appear once and the selected translation target keeps its country. Verify browser-language ordering, filtering by native/localized country names and locale codes, keyboard selection, and free-text targets. Review wrapping in the popup and options page.
22. Repeat equivalent checks in Edge and Brave and record the actual compatibility results.
