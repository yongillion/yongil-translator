# Chrome Web Store privacy fields

Prepared from the current source on 2026-10-19. Copy the field text below into the dashboard after reviewing the release package. This document does not itself submit or certify dashboard declarations.

## Single purpose

Translate user-selected webpage text, blocks, or pages into the user's preferred language through their selected ChatGPT subscription, OpenAI API key, or Claude API key, and let the user restore the original page text.

## Permission justifications

### storage

Stores user preferences, the connected account's OAuth session, user-supplied API key, selected connection method, and model preferences locally. Temporary sign-in state uses session storage. Developer mode, off by default, additionally retains translation request/response text and diagnostic events locally (default 4,000 entries, configurable from 1 to 1,000,000, within the remaining default local storage quota shared with preferences and credentials). 64 KiB is reserved for settings and token updates; no unlimitedStorage permission is requested. Credential and diagnostic storage is restricted to trusted extension contexts. Settings exports exclude credentials and logs. Clear logs deletes diagnostic history; disabling recording or clearing the document translation cache does not delete it.

### scripting

Injects the packaged page translation, block selection, and selected-text popup scripts into sites for which the user has granted host access. No remote script is downloaded or executed.

### tabs

Reads the active tab URL to determine site access and the translation target, identifies the dedicated OAuth sign-in tab, and handles its navigation and lifecycle. It does not read the browser's stored browsing history or send a browsing log to a server.

### offscreen

Hosts and scripts a packaged same-origin iframe that runs the browser's window-only Translator and Prompt APIs after the user closes the preparation tab. The iframe isolates model sessions from the preparation UI. Creation uses IFRAME_SCRIPTING; the host only communicates through runtime messaging. No external pages, remote code, API keys, or new website access are involved. Downloads still begin from an explicit preparation click; hidden execution is confirmed before the UI says the tab can be closed. Readiness identifiers and pending language options, without page text, are stored locally and removed on Disconnect. Unsupported hidden contexts fall back to the indicated visible setup tab.

### alarms

Checks the pending OAuth sign-in for timeout or a missed callback while the Manifest V3 service worker may be suspended. This alarm does not collect analytics or run periodic translation.

### webNavigation

Finds accessible page frames, cancels stale work when documents navigate, and detects the configured callback in the extension-created sign-in tab. Navigation events are used for these features, not retained as a browsing-history database.

### sidePanel

Displays opt-in developer diagnostics beside the webpage. The LOG button opens the browser's native side panel to inspect retained and streaming translation inputs, outputs, errors, and retries. This UI remains disabled when developer mode is off. The permission does not add website host access.

### https://auth.openai.com/*

Authenticates the user's ChatGPT account, exchanges and refreshes OAuth tokens, and retrieves the public signing keys used to verify identity tokens. The user's password is entered on OpenAI's sign-in page and is not read by the extension.

### https://api.openai.com/*

Validates the user-supplied API key, retrieves API models, and submits translations to the public Responses API when the user selects OpenAI API mode. Keys are sent only in the Authorization header to this fixed origin, with cookies omitted and redirects rejected. The key is never sent to a developer proxy or subscription backend. API usage is billed separately; no automatic provider fallback occurs.

### https://api.anthropic.com/*

Validates a user-supplied Claude API key, retrieves the paginated model catalogue, and sends translation requests to the Messages API when Claude API is selected. The key is sent in x-api-key only to this fixed origin, with cookies omitted and redirects rejected. Claude subscription/OAuth access is not implemented. Anthropic bills API usage separately. No key or request is forwarded to another provider after failure.

### https://chatgpt.com/*

Requests the connected account's available model list and submits translation requests directly to the subscription service. Requests contain text chosen for translation, the selected model and target language, and enabled custom instructions. Returned text is treated as data, not executable code.

### Optional http://*/* and https://*/* host access

Webpage text must be read and replaced to implement translation and restoration. After sign-in, the popup offers access to the current site only or all HTTP/HTTPS sites. Broader access is requested only when the user chooses the all-sites button. The feature remains unavailable on unapproved sites, and excluded domains are not processed. No activeTab, history, cookies, debugger, or nativeMessaging permission is requested.

## Remote code

Select: **No, I am not using remote code.**

All executable JavaScript is packaged with the extension. The service returns model metadata and translation text/JSON. The extension does not load remote JavaScript or WebAssembly, evaluate server-supplied code, or execute returned HTML. Local screenshot fixtures and store assets are not part of the extension ZIP.

## Data handling declaration

Do not declare that no user data is handled. Google requires disclosure even for local processing. Use this mapping when completing the current dashboard's categories:

| Category | Handling in this extension |
|---|---|
| Personally identifiable information | Account email and account identifiers are obtained through authentication and retained locally. Selected webpage text may also include identifying information. |
| Authentication information | OAuth authorization codes, access/refresh/identity tokens, and user-supplied OpenAI and Claude API keys are processed. Passwords and browser cookies are not read by the extension. |
| Website content | Text deliberately chosen for page, block, or selection translation is sent to the selected provider (OpenAI or Anthropic), including configured retries. Originals and results are held in document memory. Opt-in developer diagnostics separately retain copies of request and response text in local extension storage until cleared or evicted. |
| Web history / browsing activity | Current tab/frame URLs and navigation events are inspected locally for access, document lifetime, and sign-in. No stored browser-history API or browsing log is used. |
| User activity | Pointer, click, selection, and shortcut events are handled locally to operate translation. No interaction telemetry is sent to a developer server. |
| Personal communications | Visible messages or correspondence can be processed if the user chooses to translate a page or selection containing them. There is no separate mailbox collection. |
| Health, financial/payment, or location information | No dedicated collection or inference is performed. Such information can nevertheless be present in user-selected website content and is not semantically redacted before translation. Include the applicable categories if the dashboard asks about all content that can be processed. |

Describe the content-dependent categories honestly rather than claiming they are filtered. The extension excludes form/editable inputs, hidden elements and code, but those structural exclusions are not a sensitive-information classifier. The final declaration must match the dashboard wording and actual release behavior.

## Limited Use declarations

The extension uses data only to provide its disclosed translation, authentication, settings, and restoration features. It does not sell user data, use it for advertising, or use it to determine creditworthiness or lending eligibility. The developer operates no data collection server. OpenAI receives requests needed to provide translation under its own service terms and data practices.

The public privacy policy includes an affirmative Chrome Web Store Limited Use statement. Select the corresponding dashboard certifications only after reviewing them against this release.

## Privacy URL

Intended source URL after pushing this revision:

https://github.com/yongillion/yongil-translator/blob/main/PRIVACY.md

An equivalent static page is prepared at docs/privacy.html. If GitHub Pages is configured for the main branch's /docs directory, its intended URL is https://yongillion.github.io/yongil-translator/privacy.html. Neither destination is published by creating these local files. Confirm public access in a signed-out browser before submitting.

## Official references

- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [User Data FAQ, including local processing](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)
- [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Minimum permissions](https://developer.chrome.com/docs/webstore/program-policies/permissions)
- [Standard local storage quota](https://developer.chrome.com/docs/extensions/reference/api/storage#property-local)

## Optional On-Device AI

A compatible browser-provided Prompt API can be used without an extension API key. The option is shown based on runtime API availability and language support, with no Chrome-only brand restriction. Unsupported browsers/devices and policy-blocked APIs keep it hidden. Samsung, Edge, and other compatible implementations are eligible, but actual model execution in those browsers has not been verified.

Click Open local model tab, then Prepare local model. Discovery does not download a model; preparation requires a user click. After background readiness is confirmed, the setup tab can be closed. If the browser cannot run the hidden context, the page explicitly asks to keep the tab open. Target languages are queried from the browser, including Korean when supported. Requests run one block at a time and use the existing retries, restoration, cache, and optional developer logs. The offscreen permission hosts and scripts a bundled same-origin iframe for window-only browser AI APIs; no new host access is added.

The extension does not route these prompts through OpenAI or Anthropic or automatically switch to those connections. Prompt API availability does not guarantee on-device processing: the browser controls execution location and any model downloads or browser-managed transfers. Review the browser's privacy practices. Real device/browser tests remain required before claiming compatibility.

## Optional Translator API

A separate **Translator API** option appears only when the browser exposes compatible API methods and reports a supported listed language pair. It needs no account or API key and is independent of browser branding and Prompt API support. Open the browser translator tab, select Source and Target languages, click **Prepare language pack**, close the tab once background readiness is confirmed, and grant site access, and use the existing translation controls. Missing pairs automatically open the setup tab with the required source and target selected. Click Prepare, then retry translation.

The popup suggests the page source language when Translator API is supported; otherwise it defaults to Auto. Explicit choices apply to the current page until reload. Auto retains block-level detection. Both native modes use supported-language selects; cloud connections retain editable fields. Text nodes are translated individually with original restoration and page caching preserved. Custom instructions are not applied. The two browser modes share the offscreen execution host. No automatic cloud fallback is added. The browser controls downloads and processing location. Actual extension/model verification remains pending; test each intended browser and language pair before claiming support.

Settings lists language pairs prepared by this extension, refreshes their availability, and offers Add language pair and Remove from list. The browser API has no full installed-pack inventory or file-uninstall operation; removal forgets the extension record and does not reclaim browser disk space. Source overrides and their page URL/document identifier are scoped to trusted session storage and cleared on page reload, navigation, or tab closure. Prepared-pair records persist locally without page text.
