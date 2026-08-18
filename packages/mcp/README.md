# @yeeet.dev/mcp

Official Model Context Protocol server for Yeeet. It gives coding agents typed
tools to plan and deploy local static builds, inspect sites and immutable
versions, roll back production, manage channels and domains, retrieve private
share links, and perform explicitly confirmed cleanup.

```json
{
  "mcpServers": {
    "yeeet": {
      "command": "npx",
      "args": ["-y", "@yeeet.dev/mcp"],
      "env": {
        "YEEET_TOKEN": "yeeet_..."
      }
    }
  }
}
```

Create the API key in the Yeeet dashboard. Keep it in the MCP host's secret or
environment store—never in repository configuration. Set `YEEET_API` when
targeting a self-hosted control plane; it defaults to `https://yeeet.dev`.

For local repository development:

```sh
YEEET_TOKEN=yeeet_... node packages/mcp/bin/yeeet-mcp.js
```

The server uses stdio. Standard output is reserved for MCP JSON-RPC; operational
messages go to standard error. Destructive site and version tools require the
literal input `confirm: true`.
