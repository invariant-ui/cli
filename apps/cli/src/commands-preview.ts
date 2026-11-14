import type { Context } from "./commands.js"
import { loadConfig } from "./config.js"
import { CliError } from "./errors.js"
import { CLI_NAME } from "./version.js"

/**
 * `invariant preview <file>`: render a snippet in a headless browser with its findings drawn on it. Rendering runs
 * the project's component code, so it runs only when the project opts in (docs/decisions/0004-rendered-preview.md).
 * Rendering itself is not built yet: this command enforces the opt-in and says so.
 */
export async function previewCommand(c: Context): Promise<number> {
  const [, file] = c.args.positionals
  if (!file) throw new CliError(`usage: ${CLI_NAME} preview <file>`)
  const loaded = await loadConfig({ cwd: c.cwd, trustConfig: false })
  if (!loaded) throw new CliError(`no invariant.config.json in ${c.cwd}. Run \`${CLI_NAME} init\` first.`)
  if (loaded.config.preview?.enabled !== true)
    throw new CliError(
      `preview is off for this project. Rendering runs the project's component code, so a person must turn it on: set "preview": { "enabled": true } in invariant.config.json.`
    )
  throw new CliError("preview rendering is not built yet; only the opt-in is in place")
}
