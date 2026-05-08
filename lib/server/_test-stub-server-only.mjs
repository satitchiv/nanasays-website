// Loader hook that resolves 'server-only' to a no-op module, so we can
// import lib/server/*.ts files in node --test runs without bundling Next.
// Used only by *.test.mts files in this directory.
//
// Usage:  node --import ./lib/server/_test-stub-server-only.mjs path/to/file.test.mts

import { register } from 'node:module'

register('./_test-stub-server-only-resolver.mjs', import.meta.url)
