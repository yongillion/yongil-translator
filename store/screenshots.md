# English screenshot capture plan

All screenshots must use the **English UI**. Set Settings → Data & appearance → UI language → English and Theme → Light. Set target language to English (United States), concurrency to 16, and use the current Alt-based defaults. Translation targets and foreign-language source examples may vary; every extension control and promotional caption remains English.

## Capture status

Actual browser screenshots were not produced in this environment. The computer-use inventory has no connected browser; the in-app browser is unavailable. Isolated Chrome and Edge render attempts both terminated with GPU-process errors. No screenshot-shaped mockup is mislabeled as a captured extension screen.

The supplied promotional PNGs are artwork, not screenshots. A local English capture fixture is supplied in capture/page.html. The manifest in assets.json records screenshots as pending until real PNG files exist and have been reviewed.

## Capture procedure

1. Reload the extension and refresh the test page after updating the code.
2. Start the repository's local capture page: python -m http.server 8765 --bind 127.0.0.1 --directory store/capture
3. Open http://127.0.0.1:8765/page.html in Chrome. Sign in to the extension and explicitly allow this site. The fixture has no external resources or private data.
4. Set the English UI and the defaults listed above. Select a model actually returned by the account. Do not fabricate model names or speed claims.
5. Capture a 1280×800 image with square corners and no added padding. Chrome DevTools Device Toolbar can provide a 1280×800 page viewport and Capture screenshot; close DevTools before taking any desktop screenshot that includes the extension popup. Use native capture for the popup itself, keeping the resulting store image within the required aspect ratio without stretching.
6. Avoid personal email addresses, account avatars, unrelated tabs, credentials, and private website content in every capture. Prefer the account-neutral translation/settings areas. Do not alter functional controls in the capture.
7. Save the five English PNGs below under store/assets/screenshots/en/. Review at both full size and 640×400. Do not upload the fixture HTML as a screenshot.

## Shot list

| Filename | Actual screen to capture | Suggested caption in the listing |
|---|---|---|
| 01-page-translation.png | Fixture translated to English, with the real on-page toolbar, Translate page button, top-edge progress bar and completed/total Blocks count and circular X overlapping its upper-right corner | Read the whole page in your language. |
| 02-block-selection.png | Real block selection outline and English hint on one block; preserve other source paragraphs | Translate one block. Restore it with Alt+click. |
| 03-selection-popup.png | A selected passage and the actual translated-result popup, with drag and close controls | A translation that moves with you. |
| 04-settings.png | Actual options page showing GitHub in the sidebar, target/model controls, concurrency 16, maximum retries 4 and custom instructions | Your language. Your model. Your style. |
| 05-shortcuts.png | Actual options Shortcuts panel showing Alt+T, Alt+R, Alt and Escape, with English labels | Translate and restore with a keystroke. |

Optional popup detail: capture Translate page, Translate block and Restore original with their configured shortcut labels and GitHub/Settings icons. Keep the account email out of the frame or use an authorized, nonpersonal demonstration account. Do not create an invented signed-in state and present it as a real account test.

The Chrome Web Store requires at least one screenshot; up to five are supported. Use 1280×800 (preferred) or 640×400. [Official image requirements](https://developer.chrome.com/docs/webstore/images).
