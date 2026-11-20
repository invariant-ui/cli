import { spawn } from "node:child_process"

/** Opens a link in the default browser. It only ever opens the local address setup prints; a failure is silent because the link is printed too. */
export function openBrowser(url: string): void {
  const [command, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]]
  try {
    const child = spawn(command, args, { stdio: "ignore", detached: true })
    child.on("error", () => {})
    child.unref()
  } catch {
    // The link is printed as well.
  }
}
