// The enforcement loop, end to end, in a scratch copy of the Acme fixture:
//   pnpm build && pnpm demo
import { setTimeout as sleep } from "node:timers/promises"
import { playLoop, prepare } from "./demo-loop.ts"

const line = "─".repeat(72)
const say = (text = ""): void => console.log(text)
// DEMO_PACE=1 is for the recording: each step gets its own screen and is held long enough to read. Output is unchanged.
const PACE = process.env.DEMO_PACE === "1"
const hold = async (ms: number): Promise<void> => {
  if (!PACE) return
  await sleep(ms)
  process.stdout.write("\x1b[2J\x1b[H")
}

say("An agent is asked: build a settings page with a delete button.\n")
const dir = await prepare()
const { steps, report } = await playLoop(dir)
for (const [i, step] of steps.entries()) {
  say(line)
  say(`${i + 1}. ${step.intent}`)
  say(
    step.blocked
      ? "   invariant blocked the write. The agent reads:\n"
      : "   the write landed. The agent reads:\n"
  )
  say(step.card.replace(/^/gm, "   "))
  say()
  await hold(5000)
}
say(line)
// Timestamps are the only thing that changes between runs, so the printed report drops them.
say(report.replace(/^\d{4}-\d{2}-\d{2}T\S+\s+/gm, ""))
