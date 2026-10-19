# Subscription integration review

Reviewed 2026-10-16. This is an implementation comparison, not confirmation of provider authorization or a prediction of store approval.

## Current implementation

- extension/lib/oauth.mjs uses a fixed public Codex client ID, the /oauth/authorize endpoint, and a localhost:1455 callback.
- extension/lib/auth.mjs observes that callback in a dedicated browser tab. No callback listener or companion executable is installed. Tokens are kept in trusted-context chrome.storage.local.
- In subscription mode, extension/lib/provider.mjs calls the ChatGPT Codex backend with account-bound credentials. It does not call the public Responses endpoint using a separately registered application's plan-usage permission.

## Official documentation comparison

OpenAI documents ChatGPT-plan access for eligible open-source integrations. Its current direct registration flow issues an application client ID, uses explicit plan-usage scopes, and describes a 127.0.0.1 callback listener plus protected local credentials. Those details differ from this extension. The documentation reviewed does not establish support for this extension's browser-only callback observation and fixed Codex-client route. [Registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [Open-source integration overview](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt).

## Outstanding release decision

Obtain confirmation of a supported browser-extension-only route, including client registration, callback handling and credential storage, before representing the integration as officially supported. Preserve the product requirement that no local companion be installed. Do not silently substitute the documented local-listener design or change billing methods. An explicit API-key mode was added at the user's request on 2026-10-18; it uses the public OpenAI API and does not resolve support questions about the separate subscription route.

The subscription route has been left intact. Preparing store files cannot resolve provider eligibility. No approval request was sent, no account was registered, and no credentials were transmitted during this review. The store description and reviewer notes explicitly identify the product as independent and disclose the subscription requirement.
