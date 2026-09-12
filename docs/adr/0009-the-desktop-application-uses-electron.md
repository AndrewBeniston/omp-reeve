---
status: accepted
---

# The desktop application uses Electron

The interface requires Chromium's `corner-shape: superellipse(1.5)` rendering. The macOS system webview does not support that property. Electron 44 provides Chromium 152 and keeps the Bun server as a packaged child process.

## Consequences

The desktop package is larger than a system-webview package. The web application and Bun runtime remain shared with the browser version.
The launcher copies `.next` into versioned application data. This keeps Next runtime caches outside the signed application.
One Electron instance owns the window and Bun process.
Production always uses `127.0.0.1:30142`, so browser preferences keep one origin.
`desktop/targets.json` names every supported target, and controls Bun runtimes,
native packages, package arguments, and output directories. Read that file for
the list rather than a copy of it.
Staging validates a temporary directory before one atomic rename publishes it.
The completion manifest binds the stage to its package version, build identifier, and target.
Release automation accepts only a matching version tag.
macOS releases require signing and Apple notarization.
Windows ships unsigned until a certificate exists. See `RELEASING.md`.
Electron sends a fresh challenge before trusting the stable origin.
The Bun server proves that it knows the private launch secret with an HMAC-SHA256 response.
The request never exposes the launch secret to another process occupying the port.
A release publishes only after each package it carries is built and verified.
ADR-0013 decides which platforms a release must carry.
