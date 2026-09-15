# Zima Nodes

Zima Nodes is a Chrome extension for managing and opening multiple ZimaOS devices from one compact dashboard.

## Features

- Add, edit, switch, open, and remove multiple ZimaOS devices
- Check every device in parallel and show its latest connectivity state
- Keep an independent access and refresh token for each device
- Refresh an expired session or sign in again with that device's credentials
- Open the selected ZimaOS dashboard and installed apps
- Follow the system theme or select light/dark mode

## Install for development

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this repository.
4. Reload the extension after changing source files.

Chrome 88 or newer is required because the extension uses Manifest V3.

Run the core regression tests with:

```sh
node --test tests/core.test.js
```

## Device data and security

Device addresses, usernames, passwords, and sessions are stored in `chrome.storage.local`. They stay in the current browser profile and are not synced through the Google account. Existing installations are migrated once from the former sync-based storage.

Chrome extension storage is not a password vault. Credentials remain available to this extension and to anyone with access to the browser profile; storing them enables per-device automatic sign-in when refresh tokens expire.

## Scope

The extension is intentionally a multi-device dashboard: it tracks device availability and opens ZimaOS dashboards/apps from LAN, VPN, or other user-provided HTTP(S) addresses. Native peer networking, drive mounting, PeerDrop, and backup orchestration require operating-system integration and remain outside the browser extension's scope.

Zima Nodes needs access to HTTP and HTTPS hosts because ZimaOS devices may use arbitrary LAN addresses, ports, and domains. It only requests Chrome's `storage` permission; unrelated recording and active-tab permissions are not used.

## Project structure

```text
.
├── manifest.json
├── popup.html
├── options.html
├── background.js
├── scripts/
│   ├── device-store.js
│   ├── zimaos-api.js
│   ├── popup.js
│   └── options.js
└── styles/
    ├── popup.css
    └── options.css
```

## Debugging

- Popup: right-click the extension popup and choose **Inspect**.
- Options: open the extension details, then **Extension options**.
- Background worker: use **Inspect views** on `chrome://extensions/`.

Connection checks use `/v2/zimaos/device/info`, so a device is only marked online after an authenticated response. A stored token by itself is not treated as proof that the device is reachable.

## License

Apache License 2.0
