# Documentation assets

This folder holds screenshots and any other static assets the README links to.

## Expected screenshots

The top-level [`README.md`](../README.md) references these files. Drop the PNGs
in here with the exact names below — no other changes needed.

| File                         | Suggested size        | What to capture                                                                                         |
| ---------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------- |
| `screenshot-popup.png`       | 380×500 (popup width) | The popup on a real broken page with at least 3 ranked suggestions. Include the footer summary.        |
| `screenshot-settings.png`    | 700×900               | The settings page with all fields filled, plus a few recently-allowed entries and one muted suggestion. |
| `screenshot-wildcard.png`    | 380×220               | A single popup row with the "Allow whole site (*.example.com)" toggle clearly visible.                  |
| `screenshot-badge.png`       | 400×80                | Just the toolbar area — icon with a number badge visible. Crop tight.                                  |

## Capturing tips

- Use Firefox's built-in screenshot tool (`Ctrl+Shift+S` → *Save full page* or
  drag a region). For the popup, right-click the toolbar icon → **Inspect**
  → screenshot the popup window node from DevTools.
- Use a real Pi-hole instance, not mocked data — reviewers and users notice.
- Hide your client IP address in the settings screenshot (blur or change it to
  `192.168.1.42`).
- Light mode is generally clearer for AMO listing thumbnails; dark mode looks
  nicer in the README. Take both if you can.
