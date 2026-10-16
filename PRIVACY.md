# Privacy Notice

Yongil Translator does not collect page content or account information on developer-operated servers.

When a translation requires a new result, the extension sends the selected page or block text, target language, selected model, and enabled custom instructions directly to OpenAI's subscription service. Input forms, passwords, content being edited, and hidden elements are excluded from collection. The source URL's query string and fragment are not attached to translation requests.

OAuth sign-in uses OpenAI's sign-in page. The extension does not read or store your password. It receives an authorization code from the dedicated sign-in tab, exchanges it using PKCE, and validates the ID token's signature, issuer, audience, expiration, and nonce. It does not collect sign-in codes from other tabs or browsing history.

Tokens needed to maintain the session are stored in the browser's extension local storage. Access from content scripts is restricted, but this storage is not an encrypted credential vault equivalent to an OS credential store. Signing out deletes local credentials and the model cache. Authorization on the provider's servers can be managed separately in the provider's account settings.

User settings, including the UI language preference, are kept in the browser's local storage. Selecting text alone does not send it to OpenAI; selected-text translation starts only after clicking its translation button. The result popup and its selected text remain in the current document's memory. Original text, translations, and node references used for restoration are kept only in the document's memory. Restored blocks reuse matching successful translations from this memory cache without sending the text again. The cache is scoped to the current document and is never persisted to disk. Refreshing the page, changing its URL, or closing it discards these cached translations. Clearing the temporary translation cache preserves the original-text snapshots needed to restore the current document.

Restoring original text does not send a new translation request. This does not mean usage from requests already sent to OpenAI is canceled or refunded. Setting store=false and avoiding local translation history do not replace OpenAI's data processing and retention policies.

## Permissions

- storage: settings, authentication state, and temporary sign-in state
- scripting: inject translation functionality only on websites with granted host access
- tabs: identify the dedicated sign-in tab and the current target tab
- alarms: check sign-in timeouts and missed callbacks
- webNavigation: enumerate accessible frames, invalidate requests when documents navigate, and detect the designated sign-in callback
- auth.openai.com and chatgpt.com: authentication, model discovery, and subscription-backed translation
- Website access: required before page, block, and selected-text translation can be used. The popup offers access to the current site only or all HTTP and HTTPS websites; broader access is requested only when the all-sites button is clicked. The extension does not request temporary activeTab access

The extension contains no analytics SDKs, advertisements, remotely executed code, or developer-operated proxy.
