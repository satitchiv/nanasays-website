// Module-resolver hook for tests:
//   1. Stub bare 'server-only' import to a no-op module (Next.js marker)
//   2. Resolve extensionless relative imports like './pack-redactors' to
//      the corresponding .ts file. The website project uses Next.js bundler
//      resolution (extensionless), but Node's strict ESM doesn't follow that
//      out of the box — so when running these tests via `node --test`, we
//      need to map ./foo → ./foo.ts ourselves.

import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    const url = new URL('./_test-stub-server-only-noop.mjs', import.meta.url).href
    return { url, format: 'module', shortCircuit: true }
  }
  // Extensionless relative imports → try .ts / .mts
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !path.extname(specifier)) {
    const parent = context.parentURL ? fileURLToPath(context.parentURL) : process.cwd()
    const baseDir = path.dirname(parent)
    for (const ext of ['.ts', '.mts', '.tsx']) {
      const cand = path.resolve(baseDir, specifier + ext)
      if (existsSync(cand)) {
        return { url: pathToFileURL(cand).href, format: 'module', shortCircuit: true }
      }
    }
  }
  return nextResolve(specifier, context)
}
