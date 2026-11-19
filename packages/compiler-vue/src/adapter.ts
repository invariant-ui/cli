import {
  DEFAULT_IGNORED_DIRS,
  type DiscoveredSource,
  hashText,
  IrBuilder,
  type PackageInfo,
  type ReadonlyFs,
  type SourceAdapter,
  walk
} from "@invariant/compiler-core"
import { type Diagnostic, hashJson } from "@invariant/shared"
import { analyzePackage } from "./analyze.js"
import { CAPABILITIES, emitComponent } from "./emit.js"

type Config = { packageId: string; files: string[] }

export const ADAPTER_ID = "vue"
export const ADAPTER_VERSION = "0.1.0"

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue)$|(?:^|\/)tsconfig[^/]*\.json$/
const MAX_FILE_BYTES = 1_000_000
const MAX_PACKAGE_FILES = 20_000

/**
 * Vue adapter. For every workspace package that declares Vue it reads single-file components with the
 * official SFC parser and analyzes their script with the TypeScript API (compile-time macros, options
 * objects, `defineComponent`), plus the template for slots, accessibility and composition. Nothing is
 * executed and `node_modules` is not read.
 */
export const vueAdapter: SourceAdapter<Config> = {
  id: ADAPTER_ID,
  version: ADAPTER_VERSION,
  type: "vue",

  async discover({ fs, project }) {
    const sources: DiscoveredSource<Config>[] = []
    const diagnostics: Diagnostic[] = []
    const used = new Set<string>()
    for (const pkg of project.packages.filter((p) => p.frameworks.some((f) => f.name === "vue"))) {
      const others = project.packages.filter(
        (p) => p.id !== pkg.id && p.dir !== "." && (pkg.dir === "." || p.dir.startsWith(`${pkg.dir}/`))
      )
      const { files, hashes, truncated } = await readPackageFiles(fs, pkg, others)
      if (truncated)
        diagnostics.push({
          code: "vue.walk-truncated",
          severity: "warning",
          message: `${pkg.dir} holds more than ${MAX_PACKAGE_FILES} files, so only the first ${MAX_PACKAGE_FILES} were read and components in the rest are missing from the contract`,
          location: { path: pkg.dir === "." ? "package.json" : `${pkg.dir}/package.json` }
        })
      const slug =
        (pkg.name ?? pkg.dir)
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/^[^a-z0-9]+|[-.]+$/g, "") || "root"
      let id = `vue-${slug}`
      for (let n = 2; used.has(id); n++) id = `vue-${slug}-${n}`
      used.add(id)
      sources.push({
        id,
        type: "vue",
        location: pkg.dir,
        config: { packageId: pkg.id, files: [...files.keys()] },
        ...(pkg.version ? { version: { kind: "package-version" as const, value: pkg.version } } : {}),
        inputHash: hashJson(hashes)
      })
    }
    return { sources, diagnostics }
  },

  async extract({ fs, project, source, clock }, config) {
    const pkg = project.packages.find((p) => p.id === config.packageId)
    if (!pkg) throw new Error(`Package ${config.packageId} is not in the project discovery`)
    const files = new Map<string, string>()
    for (const path of config.files) files.set(path, await fs.readFile(path))
    const analysis = analyzePackage({ packageDir: pkg.dir, entryPoints: pkg.entryPoints, files })
    const builder = new IrBuilder({
      source: {
        id: source.id,
        type: source.type,
        location: source.location,
        ...(source.version ? { version: source.version } : {}),
        inputHash: source.inputHash,
        adapter: { name: ADAPTER_ID, version: ADAPTER_VERSION }
      },
      extractor: { name: "vue-sfc", version: ADAPTER_VERSION },
      capabilities: CAPABILITIES,
      clock
    })
    for (const component of analysis.components) emitComponent(builder, component, pkg)
    for (const d of analysis.diagnostics) builder.diagnostic(d)
    return { ir: builder.build(analysis.components.some((c) => !c.propsComplete) ? "partial" : "complete") }
  },

  async validate({ ir }) {
    return ir.entities.length === 0
      ? [
          {
            code: "vue.no-components",
            severity: "info" as const,
            message: `No Vue components were found in the entry points of ${ir.source.id}`,
            sourceId: ir.source.id
          }
        ]
      : []
  }
}

async function readPackageFiles(
  fs: ReadonlyFs,
  pkg: PackageInfo,
  nested: readonly PackageInfo[]
): Promise<{ files: Map<string, string>; hashes: Array<[string, string]>; truncated: boolean }> {
  // An installed package (opted in through a declaration root) keeps its declaration files in build output.
  const installed = pkg.dir.split("/").includes("node_modules")
  const walked = await walk(fs, {
    ignoreDirs: new Set(
      installed
        ? DEFAULT_IGNORED_DIRS.filter((d) => !["dist", "build", "out"].includes(d))
        : DEFAULT_IGNORED_DIRS
    ),
    maxFiles: MAX_PACKAGE_FILES,
    start: pkg.dir,
    // Another package is read as its own source, so its folders do not count against this one.
    skip: (dir) => nested.some((n) => n.dir === dir)
  })
  const files = new Map<string, string>()
  const hashes: Array<[string, string]> = []
  for (const path of walked.files) {
    if (!SOURCE_FILE.test(path)) continue
    const text = await fs.readFile(path)
    if (text.length > MAX_FILE_BYTES) continue
    files.set(path, text)
    hashes.push([path, hashText(text)])
  }
  return { files, hashes, truncated: walked.truncated }
}
