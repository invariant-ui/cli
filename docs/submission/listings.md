# Directory and awesome-list submissions

Use the same one-sentence definition everywhere (it is the first paragraph of `README.md`):

> Invariant is a source-available CLI and MCP server that compiles a design system (React, Vue, Angular, Storybook, design tokens) and approved UX patterns into one machine-readable JSON contract. AI coding agents read the contract before they write UI, and Invariant checks the code against it in CI.

## 1. Official MCP registry (do first)

`server.json` at the repo root is the manifest. `build-npm.ts` writes `mcpName` into the published package, which the registry checks. Release-please keeps both versions in `server.json` in step.

```bash
# after a release that includes mcpName is on npm
brew install mcp-publisher
mcp-publisher login github      # must be a member of the invariant-ui org
mcp-publisher publish
```

Re-run `mcp-publisher publish` after each release.

## 2. Pull requests (one line each)

- `punkpeye/awesome-mcp-servers`, section Developer Tools:
  `- [invariant-ui/cli](https://github.com/invariant-ui/cli) 📇 🏠 - Serves a compiled design-system contract (components, props, tokens, UX patterns) to AI agents, read-only, and validates UI code against it.`
- `awesome-design-systems` (alexpate): add under Tools: `[Invariant](https://invariant-ui.com/) - Compiles a design system into a machine-readable contract for AI coding agents and checks code against it in CI.`
- `awesome-design-tokens`, `awesome-storybook`, `awesome-claude-code`: same line, adjusted to the list's format. Read each CONTRIBUTING first.

## 3. Forms

Smithery, Glama (glama.ai/mcp/servers), mcp.so, PulseMCP, cursor.directory. Use the definition above, `npx @invariant-ui/cli mcp` as the run command, and the site URL.

## 4. Do not

Invent stars, users or reviews in any listing. Say Figma and zeroheight are not supported if a form asks about sources.
