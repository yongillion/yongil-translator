# Privacy Notice

Last updated: October 18, 2026. Applies to Yongil Translator 0.1.0.

Yongil Translator is an independent, open-source browser extension maintained through [the project repository](https://github.com/yongillion/yongil-translator). Its purpose is to translate user-chosen webpage text and restore the original text when requested.

Yongil Translator does not collect page content or account information on developer-operated servers.

When a translation requires a new result, the extension sends the selected page or block text, target language, selected model, and enabled custom instructions directly to the selected OpenAI subscription service or public API. Input forms, passwords, content being edited, and hidden elements are excluded from collection. The source URL's query string and fragment are not attached to translation requests.

OAuth sign-in uses OpenAI's sign-in page. The extension does not read or store your password. It receives an authorization code from the dedicated sign-in tab, exchanges it using PKCE, and validates the ID token's signature, issuer, audience, expiration, and nonce. It does not collect sign-in codes from other tabs or browsing history.

OAuth tokens and user-supplied API keys needed to maintain the selected connection are stored in the browser's extension local storage. Access from content scripts is restricted, but this storage is not an encrypted credential vault equivalent to an OS credential store. Disconnecting deletes the selected connection's credential and the model cache. Switching methods preserves the saved credential for the other method; disconnect each method to remove both. API keys are validated through api.openai.com and sent only as authentication to that API, never to the subscription backend or a developer-operated server. Authorization on the provider's servers can be managed separately in the provider's account settings.

User settings, including the UI language preference, are kept in the browser's local storage. Selecting text alone does not send it to OpenAI; selected-text translation starts only after clicking its translation button. The result popup and its selected text remain in the current document's memory. The translation cache and original-text snapshots used for restoration are kept only in the document's memory. Restored blocks reuse matching successful translations from this memory cache without sending the text again. The cache is scoped to the current document and is never persisted to disk. Refreshing the page, changing its URL, or closing it discards these cached translations. Clearing the temporary translation cache preserves the original-text snapshots needed to restore the current document.

Restoring original text does not send a new translation request. Automatic retries can send the same original text and instructions again after a failed response, up to the configured retry limit (4 retries by default). Retries can consume additional subscription usage or API charges. Stopping or restoring text does not mean usage from requests already sent to OpenAI is canceled or refunded. Setting store=false does not replace OpenAI's data processing and retention policies.

## Optional developer diagnostics

Developer mode is off by default. Enabling it records extension actions, translation request bodies (including original text, target language, model, and custom instructions), model-list responses, streamed translation responses, errors, retries, and local tab/frame identifiers. These diagnostics are stored only in trusted browser extension local storage and displayed in a native side panel. They are not sent to the developer or to another logging service. Authentication headers, cookies, API key verification payloads, and OAuth token exchange payloads are not recorded. Recognized credential fields and API key strings are redacted from diagnostic records. Raw API HTTP error bodies are omitted because they can echo credentials.

Diagnostic copies of source text and responses can contain personal or sensitive webpage content. These copies are separate from the document-only translation cache and restoration snapshots. The retained log count is configurable from 1 to 1,000,000, with a default of 4,000. Recent entries within the configured count and the remaining default local storage quota are retained across page refreshes and browser restarts. This quota is shared with settings and authentication data, with 64 KiB reserved for their updates. Lowering the entry limit immediately removes older entries above the new limit. No expanded storage permission is requested. Old entries are evicted automatically; exceptionally large entries are replaced by a size-limit notice. Recording starts when enabled and cannot reconstruct earlier requests. Disabling developer mode stops new recording but does not delete retained history. Use Clear logs in the side panel to delete the history, or remove the extension. Sign-out and clearing the translation cache do not delete diagnostic history. Resetting settings restores the default retention limit and may remove older entries above that limit; it does not explicitly clear all logs. Settings exports do not include logs.

## Permissions

- storage: settings, authentication state, temporary sign-in state, and opt-in local developer diagnostics
- scripting: inject translation functionality only on websites with granted host access
- tabs: identify the dedicated sign-in tab and the current target tab
- alarms: check sign-in timeouts and missed callbacks
- webNavigation: enumerate accessible frames, invalidate requests when documents navigate, and detect the designated sign-in callback
- sidePanel: show retained and live developer diagnostics alongside the current webpage when developer mode is enabled
- auth.openai.com and chatgpt.com: authentication, model discovery, and subscription-backed translation
- api.openai.com: validate the user-supplied API key, discover API models, and submit API-backed translations
- Website access: required before page, block, and selected-text translation can be used. The popup offers access to the current site only or all HTTP and HTTPS websites; broader access is requested only when the all-sites button is clicked. The extension does not request temporary activeTab access

The extension contains no analytics SDKs, advertisements, remotely executed code, or developer-operated proxy.

## Data use and recipients

OpenAI receives the requests needed for authentication, model discovery, and translation. The developer does not receive a copy of these requests. Account email and identifiers received during subscription sign-in are used to display and maintain that connection. API mode does not request or store an account email. Current tab/frame URLs and navigation events are inspected locally to enforce site permissions, track document changes, and complete the designated sign-in flow; they are not retained as a browsing-history database. Mouse, selection, and shortcut events are processed locally to operate the interface, not recorded as interaction analytics.

Text chosen for translation can contain personal communications or sensitive information already visible on a page. Structural exclusions for form inputs, editors, hidden content, and code do not detect or redact every kind of sensitive text. Enabled custom instructions are included in translation requests. Ordinary network requests also expose connection information, such as the source IP address, to the service receiving them.

The extension does not sell user data, use it for advertising, build behavioral profiles, or use it for creditworthiness or lending decisions. OpenAI processes requests under its own applicable terms and privacy practices. The extension does not promise a particular provider-side retention period or that setting store=false disables all provider logging or training. Refer to [OpenAI's Privacy Policy](https://openai.com/policies/privacy-policy/) and the controls applicable to the connected account.

## Retention and deletion

- Settings remain in browser extension storage until reset, changed, or removed with the extension. Resetting settings is separate from disconnecting an account.
- Authentication tokens and API keys remain locally until that connection is disconnected, credentials are replaced, or the extension is removed. Disconnecting removes the selected connection's local credential and cached model metadata; it does not by itself revoke all provider-side sessions or delete requests already sent.
- Temporary sign-in attempts expire after five minutes and are cleared when completed or canceled. Session storage is not a persistent translation history.
- Page originals, translation cache entries, and selection-result text remain in the current document's memory as described above. Refreshing or closing the document clears that memory. Changing its URL invalidates the translation cache. Restoring text does not delete requests already processed by OpenAI.
- Optional diagnostic copies of translation requests and responses follow the separate developer-log retention and deletion controls above.
- Exported settings files are created only at the user's request and may include custom instructions and excluded sites. The user controls and deletes those files; they do not contain account credentials.

The developer has no server-side user database from which to delete translation or account data. Requests concerning provider-held data must be directed to that provider.

## Chrome Web Store Limited Use

Yongil Translator's use and transfer of user data comply with the Chrome Web Store User Data Policy, including its Limited Use requirements. Data is used only for the disclosed translation and related authentication, settings, and restoration functions. Transfers to OpenAI are limited to what is needed to provide those functions. The developer does not provide human access to a collected translation database because no such developer-operated database exists.

## External links and contact

GitHub source/support links and OpenAI usage-management links open the respective websites only when clicked. Those websites have their own privacy practices. GitHub is not an authentication or translation backend for this extension.

For project questions or privacy-related product issues, use [GitHub Issues](https://github.com/yongillion/yongil-translator/issues). Issues are public: include a general description rather than credentials, private page text, or personal account details. Updates to this notice are published with the project.
