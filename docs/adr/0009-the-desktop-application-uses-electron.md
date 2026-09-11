# The desktop application uses Electron

The interface requires Chromium's `corner-shape: superellipse(1.5)` rendering. The macOS system webview does not support that property. Electron 44 provides Chromium 152 and keeps the Bun server as a packaged child process.

## Consequences

The desktop package is larger than a system-webview package. The web application and Bun runtime remain shared with the browser version.
The launcher copies `.next` into versioned application data. This keeps Next runtime caches outside the signed application.
One Electron instance owns the window and Bun process.
Production always uses `127.0.0.1:30142`, so browser preferences keep one origin.
Supported packages are macOS ARM, macOS Intel, universal macOS, and Windows x64.
`desktop/targets.json` controls Bun runtimes, native packages, package arguments, and output directories.
Staging validates a temporary directory before one atomic rename publishes it.
The completion manifest binds the stage to its package version, build identifier, and target.
Release automation accepts only a matching version tag.
macOS releases require signing and Apple notarization.
Windows releases require Authenticode signing.
Electron sends a fresh challenge before trusting the stable origin.
The Bun server proves that it knows the private launch secret with an HMAC-SHA256 response.
The request never exposes the launch secret to another process occupying the port.
One release job publishes only after every platform build and verification succeeds.
