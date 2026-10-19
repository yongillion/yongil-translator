# Chrome Web Store submission kit

Prepared for Yongil Translator 0.1.0 on 2026-10-18. All screenshot UI and artwork copy are English. Store descriptions are supplied in English and Korean.

A convenience bundle is available at [../dist/chrome-web-store-kit-0.1.0.zip](../dist/chrome-web-store-kit-0.1.0.zip). It includes these materials, the privacy page, and the installable extension ZIP. Upload only the nested extension ZIP to the Package field, not this documentation bundle.

## Files

| File | Use |
|---|---|
| [listing.en.md](listing.en.md) | English name, short description, detailed description, and suggested dashboard fields |
| [listing.ko.md](listing.ko.md) | Korean store listing localization |
| [privacy-and-permissions.md](privacy-and-permissions.md) | Single purpose, each permission justification, remote-code declaration and data handling guidance |
| [reviewer-instructions.md](reviewer-instructions.md) | Login requirements, reviewer test steps and implementation notes |
| [auth-integration-review.md](auth-integration-review.md) | Current subscription integration compared with official documentation |
| [screenshots.md](screenshots.md) | English-only capture procedure, five shots and exact output filenames |
| [capture/page.html](capture/page.html) | Original, nonpersonal sample text for capturing actual translation behavior |
| [assets/](assets/) | Promotional PNGs, editable SVGs and store icon |
| [assets.json](assets.json) | Image dimensions, language and screenshot completion state |
| [../PRIVACY.md](../PRIVACY.md) | Canonical updated privacy policy |
| [../docs/privacy.html](../docs/privacy.html) | Public web page ready to host |
| [release-validation.json](release-validation.json) | Tests, syntax/package checks and outstanding browser checks |
| [commit-message.txt](commit-message.txt) | Suggested English commit message |

## Prepared locally

- English and Korean store text, including subscription/API billing and data-transfer disclosure.
- Permission justifications matched to the current manifest; no activeTab, cookies, history or nativeMessaging permission.
- Updated privacy notice with retention, recipients, local processing and Limited Use statement; a generated HTML version for hosting.
- English reviewer instructions covering Alt+T, Alt+R, Alt+click, restoration, caching, site access and configurable concurrency (1–64, default 16).
- A 440×280 promotional image, optional 1400×560 marquee, and a padded 128×128 PNG store icon. SVG sources are included for further artwork edits.
- Latest extension ZIP in ../dist/yongil-translator-0.1.0.zip. Only the contents of extension/ and the project LICENSE are packaged; store fixtures and artwork stay out of the runtime ZIP.

The current kit also covers retries (0–10, default 4), opt-in developer diagnostics in a native side panel, immediate activation after site-access grants, and updated local-log privacy/permission disclosures.

## Not completed by creating these files

- **Actual English browser screenshots:** capture is blocked by unavailable browser control and GPU-process failures in the isolated Chrome/Edge renderers. Follow screenshots.md; no fabricated screenshot is supplied as a captured product screen.
- **Provider support for the current browser-only login route:** the official flow and current implementation differ. The comparison and unresolved confirmation are documented in auth-integration-review.md.
- **Public hosting of this revision:** push the reviewed privacy files, verify the repository is public, and confirm the privacy/support URLs are accessible without signing in. GitHub Pages may host docs/privacy.html, or the public GitHub Markdown URL may be used. No push or deployment was performed.
- **Reviewer access:** supply a provider-permitted way to exercise account-dependent functionality if requested. This kit contains no credentials and no review-access arrangement has been established.
- **Developer registration and submission:** complete registration, any dashboard-required identity/contact fields, the one-time fee, and Google two-step verification. Enter legal/account details directly in the dashboard. No payment, agreement acceptance, upload or publish action was performed.

## Submission sequence

1. Resolve the integration support question and complete actual Chrome verification with the final package.
2. Produce and review the English screenshots; update assets.json with their real filenames and capture status.
3. Publish the privacy notice and verify all public URLs. Confirm dashboard data declarations against the current code and policy wording.
4. Run npm test, npm run check, and npm run package using Node.js 20 or later.
5. Open the [developer dashboard](https://chrome.google.com/webstore/devconsole), add an item and upload the extension ZIP.
6. Paste the listing, purpose/permission explanations, privacy link and reviewer instructions. Upload PNG assets, not their SVG sources. Add the Korean text localization; keep the screenshots in English as requested.
7. Choose distribution visibility/countries, review the dashboard checklist and submit for review. Deferred publishing allows a separate manual publication step after approval.

## Regeneration

- Privacy HTML and high-resolution brand source: node scripts/prepare-store.mjs
- Promotional artwork on Windows: run scripts/render-store-assets.ps1 in a PowerShell environment permitted to execute local scripts. It uses built-in System.Drawing and the existing project icon, with no external assets or network calls.
- Extension package: npm run package

After changing PRIVACY.md, regenerate the HTML so the published versions agree. After changing the UI or defaults, recapture screenshots rather than editing labels into old captures.

## Official sources

- [Registration](https://developer.chrome.com/docs/webstore/register)
- [Two-step verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification)
- [Publishing and review](https://developer.chrome.com/docs/webstore/publish)
- [Image requirements](https://developer.chrome.com/docs/webstore/images)
- [Privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Test instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions)
