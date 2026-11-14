import path from "node:path"
import { build } from "esbuild"

export interface BundleInput {
  /** The project root: imports in the snippet resolve from here, so the customer's own packages and components are used. */
  projectDir: string
  /** The snippet, relative to projectDir. */
  file: string
  /** Stylesheets the page loads, relative to projectDir, so token variables exist. */
  stylesheets: readonly string[]
  /** An optional module exporting providers a snippet needs, relative to projectDir. */
  wrapper?: string
}

export interface Bundle {
  js: string
  css: string
}

/**
 * Bundles a snippet with the project's own imports and stylesheets into one browser script. The script only loads
 * the modules and exposes them on globalThis.__invariantPreview; rendering is a separate step. Nothing is written
 * to the project: the entry lives in memory, and esbuild resolves imports from the project root.
 */
export async function bundleSnippet(input: BundleInput): Promise<Bundle> {
  const at = (rel: string): string => JSON.stringify(path.resolve(input.projectDir, rel))
  const lines = [`import * as snippet from ${at(input.file)}`]
  if (input.wrapper) lines.push(`import * as wrapper from ${at(input.wrapper)}`)
  for (const sheet of input.stylesheets) lines.push(`import ${at(sheet)}`)
  lines.push(`globalThis.__invariantPreview = { snippet${input.wrapper ? ", wrapper" : ""} }`)
  const entry = `${lines.join("\n")}\n`
  try {
    const result = await build({
      stdin: {
        contents: entry,
        resolveDir: input.projectDir,
        sourcefile: "invariant-preview-entry.js",
        loader: "js"
      },
      absWorkingDir: input.projectDir,
      // A virtual output path: CSS imports need one, and it names the outputs. write: false keeps the disk untouched.
      outfile: path.join(input.projectDir, ".invariant/preview/bundle.js"),
      bundle: true,
      write: false,
      format: "iife",
      platform: "browser",
      target: "es2022",
      minify: false,
      logLevel: "silent"
    })
    const text = (ext: string): string => result.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? ""
    return { js: text(".js"), css: text(".css") }
  } catch (error) {
    // esbuild's first error is the one a person can act on: the unresolved import, the bad syntax, with its location.
    const first = (
      error as { errors?: Array<{ text: string; location?: { file: string; line: number } | null }> }
    ).errors?.[0]
    if (!first) throw error
    const where = first.location ? ` (${first.location.file}:${first.location.line})` : ""
    throw new Error(`the snippet does not bundle: ${first.text}${where}`)
  }
}
