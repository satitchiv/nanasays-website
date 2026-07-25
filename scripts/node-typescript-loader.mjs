import { existsSync } from 'node:fs'
import { extname, resolve as resolvePath } from 'node:path'
import { pathToFileURL } from 'node:url'

const workspaceRoot = process.cwd()

function existingTypescriptUrl(path) {
  const candidates = extname(path) ? [path] : [`${path}.ts`, `${path}.tsx`, path]
  const match = candidates.find(candidate => existsSync(candidate))
  return match ? pathToFileURL(match).href : null
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'server-only') {
    return {
      url: 'data:text/javascript,export default {}',
      shortCircuit: true,
    }
  }

  if (specifier.startsWith('@/')) {
    const url = existingTypescriptUrl(
      resolvePath(workspaceRoot, specifier.slice(2)),
    )
    if (url) return { url, shortCircuit: true }
  }

  if (
    (specifier.startsWith('./') || specifier.startsWith('../'))
    && context.parentURL?.startsWith('file:')
  ) {
    const parentPath = new URL(context.parentURL).pathname
    const url = existingTypescriptUrl(
      resolvePath(parentPath, '..', specifier),
    )
    if (url) return { url, shortCircuit: true }
  }

  return nextResolve(specifier, context)
}
