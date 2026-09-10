# HTTP proxy

Reeve reads `HTTP_PROXY` and `HTTPS_PROXY` for server requests. Set them before Reeve starts.

On macOS or Linux:

```bash
HTTP_PROXY=http://127.0.0.1:7890 \
HTTPS_PROXY=http://127.0.0.1:7890 \
reeve
```

On Windows PowerShell:

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7890"
$env:HTTPS_PROXY = "http://127.0.0.1:7890"
reeve
```

Requests to loopback addresses are never proxied, so a local provider (Ollama, LM Studio, llama.cpp) keeps working with a proxy configured. Note that Bun does **not** currently honour `NO_PROXY` for other hosts.
