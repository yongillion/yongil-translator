# English store listing

## Name

Yongil Translator

## Short description

Translate webpages with ChatGPT, OpenAI API, or Claude API. Restore original text anytime.

## Detailed description

Read webpages in your preferred language with Yongil Translator. Translate an entire page, individual blocks, or selected text using your connected ChatGPT subscription account or your own OpenAI or Claude API key.

Choose a compatible ChatGPT subscription account or an OpenAI or Claude API key with model access and available quota. Subscription mode consumes the account's usage allowance; API mode is billed separately by the selected provider, OpenAI or Anthropic. Claude supports API keys only; Claude subscriptions cannot be used. The extension is free and open source and does not include a subscription or API credits. No companion application is required. Switch methods in the connection card; there is no automatic fallback between billing methods.

TRANSLATE YOUR WAY

- Translate readable page text in place while retaining its structure.
- Hold Alt and click a text block to translate it. Click a translated block with the same gesture to restore its original text.
- Enter block selection mode to translate or restore several blocks in succession.
- Select text and click its translation button to open a movable, resizable result popup.
- Restore the page's original text at any time.

MAKE IT YOURS

- Choose a target language from the editable list or enter your own target.
- Identify regional language choices by native and localized names.
- Choose a model available to the connected account.
- Set custom instructions for translation tone and style.
- Configure 1–64 concurrent translation requests, with 16 as the default. All tabs share the limit.
- Configure automatic retries from 0–10, with 4 retries after the initial request by default.
- Enable developer mode to inspect retained and live request/response diagnostics in a browser side panel.
- Use the English or Korean interface, following the browser language or your explicit preference.

DEFAULT SHORTCUTS

- Alt+T: translate the page.
- Alt+R: stop pending translation and restore the page.
- Alt+click: translate or restore a block.
- Escape: exit block selection.

Shortcuts are customizable and work while the webpage has focus. Browser or operating-system shortcuts can take precedence.

CONTROL AND PRIVACY

Choose access for the current site only or all HTTP/HTTPS sites. Translation requires site access and an explicit translation action. Selecting text alone does not send it for translation.

The extension sends text chosen for translation and enabled custom instructions directly to your selected provider, OpenAI or Anthropic, including configured retries that can consume additional usage. Authentication credentials and settings are stored locally in extension storage. Translation results and originals are cached in the current document's memory; reloading the page clears that cache. Optional developer mode also retains copies of request/response text locally (default 4,000 entries, configurable from 1 to 1,000,000, within the remaining default local storage quota); Clear logs deletes that history. Authentication tokens and API keys are excluded from logs. The extension has no developer-operated proxy, advertising, or analytics.

LIMITATIONS

Chrome internal pages, extension stores, the built-in PDF viewer, and text inside images are not supported. Model availability, translation quality, and service availability depend on the connected account and provider. No translation-speed multiplier or unlimited usage is promised.

Yongil Translator is an independent project and is not affiliated with or endorsed by OpenAI, Anthropic, Google, or GitHub.

Source and support: https://github.com/yongillion/yongil-translator

## Suggested dashboard fields

- Category: Productivity (select the closest available dashboard category).
- Language: English; add the Korean localization from listing.ko.md.
- Website: https://github.com/yongillion/yongil-translator
- Support: https://github.com/yongillion/yongil-translator/issues
- Privacy: https://github.com/yongillion/yongil-translator/blob/main/PRIVACY.md
- Extension price: Free; disclose the external subscription or API usage requirement above.

The URLs must be accessible without signing in after the release files are pushed. They are intended destinations, not a claim that this local revision has been published.

## Optional On-Device AI

A compatible browser-provided Prompt API can be used without an extension API key. The option is shown based on runtime API availability and language support, with no Chrome-only brand restriction. Unsupported browsers/devices and policy-blocked APIs keep it hidden. Samsung, Edge, and other compatible implementations are eligible, but actual model execution in those browsers has not been verified.

Click Open local model tab, then Prepare local model. Discovery does not download a model; preparation requires a user click. Keep the model tab open. Target languages are queried from the browser, including Korean when supported. Requests run one block at a time and use the existing retries, restoration, cache, and optional developer logs. No new host or offscreen permission is added.

The extension does not route these prompts through OpenAI or Anthropic or automatically switch to those connections. Prompt API availability does not guarantee on-device processing: the browser controls execution location and any model downloads or browser-managed transfers. Review the browser's privacy practices. Real device/browser tests remain required before claiming compatibility.

## Optional Translator API

A separate **Translator API** option appears only when the browser exposes compatible API methods and reports a supported listed language pair. It needs no account or API key and is independent of browser branding and Prompt API support. Open the browser translator tab, click **Prepare language pack**, keep the tab open, grant site access, and use the existing translation controls. Additional pairs may require another preparation click and retry.

Source languages are detected automatically. Text nodes are translated individually with original restoration and page caching preserved. Custom instructions are not applied. No new permissions or automatic cloud fallback are added. The browser controls downloads and processing location. Actual extension/model verification remains pending; test each intended browser and language pair before claiming support.
