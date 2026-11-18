export type Tally = { checks: number; failed: number }

declare module "claude-code" {
  interface PluginState {
    invariant: { tally: Tally }
  }
}
