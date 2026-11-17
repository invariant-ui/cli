// Regenerates the contract explorer data in site/index.html from a compiled golden fixture.
// Usage: node site/build/explorer.mjs   (run from the repo root; no dependencies)
import { readFileSync, writeFileSync } from "node:fs"

const dir = "fixtures/contract-golden/acme-ui"
const contract = JSON.parse(readFileSync(`${dir}/invariant.contract.json`, "utf8"))
const evidence = new Map(JSON.parse(readFileSync(`${dir}/invariant.evidence.json`, "utf8")).evidence.map((e) => [e.id, e]))

const where = (fact) => {
  const e = fact && evidence.get(fact.evidenceIds?.[0])
  return e ? { at: `${e.location.path}:${e.location.line}`, method: e.method, original: e.original ?? "" } : null
}

const components = contract.components.map((c) => ({
  name: c.name,
  description: c.description ?? null,
  descriptionFact: c.facts.description ? { status: c.facts.description.status, ...where(c.facts.description) } : null,
  props: (c.props ?? []).map((p) => {
    const fact = c.facts[`props.${p.name}.type.text`] ?? c.facts[`props.${p.name}.required`]
    return {
      name: p.name,
      type: p.type?.text ?? "",
      required: Boolean(p.required),
      status: fact?.status ?? null,
      confidence: fact?.confidence ?? null,
      ...where(fact),
    }
  }),
}))

const data = JSON.stringify({ fixture: "acme-ui", components }).replace(/</g, "\\u003c")
const page = "site/index.html"
const html = readFileSync(page, "utf8")
const re = /(<!-- explorer:data:start -->)[\s\S]*?(<!-- explorer:data:end -->)/
if (!re.test(html)) throw new Error("explorer data markers not found in " + page)
writeFileSync(page, html.replace(re, () => `<!-- explorer:data:start -->\n<script type="application/json" id="explorer-data">${data}</script>\n<!-- explorer:data:end -->`))
console.log(`wrote ${components.length} components, ${components.reduce((n, c) => n + c.props.length, 0)} props`)
