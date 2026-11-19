import { describe, expect, it } from "vitest"
import { detectReactComponents } from "./detect-file.js"

const find = (code: string) => detectReactComponents("src/X.tsx", code)

describe("detectReactComponents", () => {
  it("finds function, arrow, forwardRef, memo and class components, and says which are exported", () => {
    const found = find(`
      import { forwardRef, memo, Component } from "react"
      export function Card(props: { a: string }) { return <div /> }
      export const Button = forwardRef<HTMLButtonElement, {}>((p, ref) => <button ref={ref} />)
      const Hidden = () => <i />
      const Memoed = memo((p: {}) => <b />)
      export class Legacy extends Component<{}> { render() { return <u /> } }
      export { Memoed }
    `)
    expect(found.map((c) => [c.name, c.kind, c.exported, c.typedApi])).toEqual([
      ["Card", "function", true, true],
      ["Button", "forwardRef", true, true],
      ["Hidden", "function", false, false],
      ["Memoed", "memo", true, true],
      ["Legacy", "class", true, true]
    ])
  })
  it("ignores helpers, hooks, lowercase functions and non-JSX code", () => {
    expect(
      find(
        `export function useThing() { return 1 }\nexport const fmt = (x: number) => x\nexport function Util() { return 2 }`
      )
    ).toEqual([])
    expect(detectReactComponents("src/a.ts", "export const A = () => <div />")).toEqual([])
  })
})
