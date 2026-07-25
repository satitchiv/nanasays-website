import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const canonicalRoute = 'app/nana/research-room/page.tsx'
const canonicalShell = 'components/nana/ResearchRoom.tsx'
const canonicalComparison = 'components/nana/ComparisonView.tsx'
const canonicalVersion = 'canonical-simplified-v1'
const failures = []

function read(relativePath) {
  const absolutePath = path.join(root, relativePath)
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing canonical file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(absolutePath, 'utf8')
}

function collectResearchRoomPages(directory, found = []) {
  if (!fs.existsSync(directory)) return found
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      collectResearchRoomPages(entryPath, found)
    } else if (
      entry.name === 'page.tsx'
      && entryPath.split(path.sep).includes('research-room')
    ) {
      found.push(path.relative(root, entryPath))
    }
  }
  return found
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    failures.push(`${label} is missing: ${expected}`)
  }
}

function rejectText(source, forbidden, label) {
  if (source.includes(forbidden)) {
    failures.push(`${label} contains retired UI copy: ${forbidden}`)
  }
}

const routePages = collectResearchRoomPages(path.join(root, 'app')).sort()
if (
  routePages.length !== 1
  || routePages[0] !== canonicalRoute
) {
  failures.push(
    `Expected exactly one Research Room page at ${canonicalRoute}; found: ${
      routePages.join(', ') || 'none'
    }`,
  )
}

const route = read(canonicalRoute)
const shell = read(canonicalShell)
const comparison = read(canonicalComparison)

requireText(
  route,
  "import ResearchRoom from '@/components/nana/ResearchRoom'",
  canonicalRoute,
)
requireText(
  route,
  'parentDemandTopics={parentDemandTopics}',
  canonicalRoute,
)
requireText(
  shell,
  `data-research-room-version="${canonicalVersion}"`,
  canonicalShell,
)
requireText(
  shell,
  'parentDemandTopics={parentDemandTopics}',
  canonicalShell,
)
requireText(
  comparison,
  "'+ Add comparison row'",
  canonicalComparison,
)
requireText(
  comparison,
  'const databaseTopics = parentDemandTopics.filter',
  canonicalComparison,
)

for (const retiredCopy of [
  'More verified comparisons',
  'Topics parents can explore',
  'Backed by information already verified in our database.',
]) {
  rejectText(comparison, retiredCopy, canonicalComparison)
}

if (failures.length > 0) {
  console.error('Research Room canonical verification failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Research Room canonical verification passed: ${canonicalVersion} `
  + `(${canonicalRoute})`,
)
