# Reviewer instructions

## Access requirements

Yongil Translator is an independent open-source extension. Choose a compatible ChatGPT subscription account with available usage or an OpenAI API key with model access and quota. API usage is billed separately by OpenAI. The extension does not provide a subscription or credits and does not charge its own fee. No companion executable is installed.

No credentials are included in this repository or submission kit. If review requires special account access, arrange a provider-permitted review method through the dashboard's private Test instructions field. Do not publish or supply a personal account's password, session cookies, API keys, or OAuth tokens in these files. The maintainer has not yet established a dedicated review access arrangement.

## Test flow

1. Install the submitted extension and pin it to the toolbar. Open a normal HTTP/HTTPS page with readable text. Browser-internal pages and the built-in PDF viewer are unsupported.
2. Open the popup. Before sign-in, the brand, Settings button, GitHub icon link, and connection-method choices are visible. Select ChatGPT subscription and follow Continue with ChatGPT, or select OpenAI API, enter a review key privately, and click Connect OpenAI API.
3. After sign-in, an unapproved site shows a highlighted access card. Choose Allow only this site. Declining access keeps translation controls hidden. Allow all sites is a separate optional choice.
4. Open Settings → Data & appearance → UI language → English to use the English interface regardless of browser language. Settings has a GitHub entry in its left navigation.
5. Pick a target language different from the source text. The model list comes from the connected account. The first returned model is selected when no choice has been saved; models vary by account.
6. Click Translate page or focus the webpage and press Alt+T. Page text is translated in place. The bottom-right toolbar also has a Translate page button, a progress bar on its top edge, and a completed/total block count such as 16/120 Blocks. The page button is disabled while translating; failed or restored blocks do not count as completed. Press Alt+R to stop pending work and restore all translated blocks.
7. Hold Alt and click a readable block to translate it. Alt-click the translated block to restore it. Ordinary hover does not show restore/retranslate controls.
8. Click Translate block in the popup to enter persistent selection mode. Click several blocks to translate or restore them. The mode remains active until Escape or an explicit exit.
9. Drag across a short text passage and click Translate selection. Check the result popup, drag its title, resize its lower corner, and close it. Merely selecting text does not start a request.
10. Restore and translate the same block again. Matching results are reused from document memory. Refresh the page and repeat to start a fresh request.
11. In Settings, change concurrency within 1–64 (default 16), record different shortcuts, try a regional target language, and enable/save custom instructions. Saved values persist; already saved concurrency values are not overwritten by a changed default.
12. Disconnect the account. The selected method's local credential and cached model metadata are removed; the other saved connection is preserved. Original text already tracked in the current page can still be restored using the on-page controls.
13. Check that both GitHub links open https://github.com/yongillion/yongil-translator in a new tab.
14. Repeat connection, page/block/selection translation, restoration, and model refresh using the other connection method. Each method keeps its model choice; switching cancels current work. In API mode, test Replace API key, a rejected key, rate/quota errors, and Disconnect. The saved key is never prefilled or exported. Verify logs contain no key or authentication header. Neither method falls back to the other after an error.

## Technical notes for review

The current implementation uses a Codex-compatible public-client OAuth flow with PKCE and observes http://localhost:1455/auth/callback only in its dedicated sign-in tab; it does not run a localhost server. It checks state and verifies the ID token's signature, issuer, audience, expiry, and nonce. Tokens are stored in trusted-context extension storage, which is not an OS credential vault.

Subscription model discovery and translation use https://chatgpt.com/backend-api/codex. API mode uses https://api.openai.com/v1/models and /v1/responses with a user-supplied API key and a strict JSON output schema. Translation calls send store=false and stream=true. There is no developer proxy, remote executable code, analytics, or advertising. See auth-integration-review.md for the differences from the currently documented third-party OpenAI integration. This submission kit does not claim OpenAI approval of the current browser-only route.

## Known limits and support

Image text, inaccessible frames, closed Shadow DOM, browser-protected pages, form/editable text, hidden content, and code are outside the processing scope. AI output quality and service limits vary. Errors are shown in the UI; server rate limits do not imply unlimited retries.

Source: https://github.com/yongillion/yongil-translator

Support: https://github.com/yongillion/yongil-translator/issues

Do not include credentials or private page content in support issues.

Reference: [Chrome Web Store Test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions).

## Retry and diagnostic checks

Verify maximum retries (0–10, default 4 retries after the initial attempt). Complete JSON with only redundant closing delimiters at the end is recovered after full block/node validation without another request. Unrecoverable malformed or incomplete output still follows the configured retry policy. When recording is enabled, recovered responses retain their raw text and include a separate `translation.recovered` log entry. Enable Developer mode under Data & appearance and use the LOG icon to open the native browser side panel. Inspect request bodies, streaming responses, errors, and retries; search or clear the retained local history. Tokens and API keys are excluded, but request/response text can contain private content. Use only the supplied fixture. Disabling developer mode stops recording and disables the panel; it does not clear history. Site-access grants should activate Alt shortcuts without a page reload once focus returns to the webpage. The floating toolbar's circular X overlaps its upper-right corner.

Developer log retention defaults to 4,000 entries and can be set from 1 to 1,000,000 while Developer mode is enabled. Lowering the limit trims old history immediately. Logs share the standard local storage quota with preferences and credentials; oldest records are removed when either limit is reached. No unlimitedStorage permission is requested. The upper-right X closes the panel without clearing history or stopping recording; use LOG to reopen it. Clicking LOG while the panel is open closes it, both in the popup and settings. The action targets only the current browser window and preserves logging/history.
