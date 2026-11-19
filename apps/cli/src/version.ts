export const CLI_NAME = "invariant"
export const CLI_VERSION = "0.13.1" // x-release-please-version
/** The name this is published under on npm (`invariant` belongs to an unrelated package). */
export const NPM_PACKAGE = "@invariant-ui/cli"

/**
 * The version written into compiled artifacts. Tests pin it (vitest.config.ts) so golden files do not change with every
 * release; nothing else sets it.
 */
export const artifactVersion = (): string => process.env.INVARIANT_COMPILER_VERSION || CLI_VERSION
