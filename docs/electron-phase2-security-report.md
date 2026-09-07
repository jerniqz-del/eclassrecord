# Electron Phase 2 Security Boundary Report

Date: 2026-09-06

## Process responsibilities

| Boundary | Responsibility | Explicitly excluded |
|---|---|---|
| Renderer | UI state, presentation, and user interaction on the trusted internal origin | Node.js, filesystem, operating-system APIs, raw IPC, trust decisions |
| Preload | Small context-bridge API that invokes named IPC operations and returns unsubscribe functions | QR/Sudoku computation, path authorization, profile authorization, network listeners |
| Main | Window lifecycle, trusted-frame validation, IPC validation, permissions, protocols, dialogs, files, printing, recovery, and operating-system integration | Rendering application HTML or trusting renderer assertions |
| Utility process | Reserved for Phase 6 CPU-heavy workload isolation; no authorization state belongs here | Filesystem authority and durable profile/session ownership |
| Companion service | Authenticated LAN/hotspot/Bluetooth transport, pairing, replay protection, profile scoping, and request timeouts | Bypassing main-process profile state or renderer sender checks |

## Threat model and controls

The primary risks are renderer compromise, unexpected navigation, hostile child frames, oversized or malformed IPC, prototype pollution, path traversal, permission abuse, unsafe external URLs, and altered packaged application code.

Controls implemented:

- The application is served from the privileged, secure `eclass-app://app` origin through a normalized asset resolver confined to the renderer root.
- The main and auxiliary windows are sandboxed, context isolated, Node-disabled, and protected by navigation, popup, and webview guards.
- IPC passes through a central trusted-main-frame validator, payload depth/size/string/array limits, prototype-key rejection, channel limits, and rate limits. Sensitive companion, export, attachment, and shared-sync channels additionally require an unlocked profile session in the main process.
- External links are parsed before use, permit HTTPS only, and reject embedded credentials. Fixed Windows Settings navigation has a dedicated command.
- Session permissions default to deny. Bluetooth and microphone require a stored preference plus a short-lived explicit user action. Their preferences can be reviewed and revoked in Settings.
- QR and Sudoku work moved out of preload into a validated main-process compute service. Phase 6 may move CPU-heavy implementations into utility processes without changing the bridge contract.
- Packaging disables RunAsNode, Node options, CLI inspection, file-protocol privileges, and the browser-specific V8 snapshot fuse; it enables cookie encryption, embedded ASAR integrity, and application-code-only-from-ASAR. The browser-specific snapshot fuse remains disabled because the packaged Electron 44 executable otherwise terminates while loading its startup snapshot.

## CSP compatibility decision

Script elements now use packaged files and `script-src 'self'`; `object-src 'none'` and `base-uri 'none'` are enforced. The legacy renderer still contains HTML event attributes and inline styles, so `script-src-attr 'unsafe-inline'` and `style-src 'self' 'unsafe-inline'` remain temporary compatibility exceptions. Their removal remains a Phase 2 follow-up and prevents Phase 2 from being marked Complete.

`connect-src` permits HTTPS/HTTP and WSS/WS because School Cloud endpoints can be configured and local companion networking can use private or hotspot addresses. Main-process companion authentication remains authoritative.

## Evidence

- `src/main/security-boundary.js`, `src/main/permission-service.js`, `src/main/compute-service.js`, `src/main/preload.js`, and `src/main/main.js`
- `src/renderer/js/session-bridge.js`, `src/renderer/js/early-startup.js`, `src/renderer/js/browser-mock.js`, and `src/renderer/js/startup.js`
- `electron-builder.yml`
- `npm run test:electron-phase2`
- `npm run electron:phase2:fuses -- <packaged executable>`
- Packaged and physical-device results are tracked in `docs/electron-manual-gates-checklist.md`.
