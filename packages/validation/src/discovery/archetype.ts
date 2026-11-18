import type { Candidate } from "./model.js"

export type Archetype = NonNullable<Candidate["archetype"]>

const PAGE_PATH =
  /(^|\/)(pages?|routes?|views?|screens?)\/|(^|\/)app\/(.*\/)?page\.[jt]sx?$|\.page\.[jt]sx?$/i
const LAYOUT_PATH =
  /(^|\/)(layouts?|shells?|templates?)\/|(^|\/)app\/(.*\/)?layout\.[jt]sx?$|\.layout\.[jt]sx?$/i
const LAYOUT_NAME = /(layout|shell|template|scaffold)/i

/**
 * Reads where a candidate's files live and how they are named, and says whether it looks like a page or a layout.
 * It is a guess from file paths, always `inferred`, and a person confirms, denies or redirects it. Returns
 * undefined when the files give no signal, so nothing is claimed.
 */
export function classify(candidate: Pick<Candidate, "evidence" | "suggestedName">): Archetype | undefined {
  const files = [...new Set(candidate.evidence.map((e) => e.file.replace(/\\/g, "/")))]
  if (files.length === 0) return undefined
  const layouts = files.filter((f) => LAYOUT_PATH.test(f) || LAYOUT_NAME.test(f.split("/").pop() ?? ""))
  const pages = files.filter((f) => !layouts.includes(f) && PAGE_PATH.test(f))
  const pick = (category: "page" | "layout", hits: string[]): Archetype | undefined =>
    hits.length * 2 > files.length
      ? {
          category,
          basis: "inferred",
          confidence: Math.round((hits.length / files.length) * 100) / 100,
          reason: `${hits.length} of ${files.length} file(s) look like ${category === "page" ? "pages (pages/, routes/, views/, page.tsx)" : "layouts (layouts/, shell, template, layout.tsx)"}`,
          files: hits.slice(0, 5)
        }
      : undefined
  return pick("layout", layouts) ?? pick("page", pages)
}
