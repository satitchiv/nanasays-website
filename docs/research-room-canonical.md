# Canonical Research Room

The only deployable Research Room is the Next.js route at
`app/nana/research-room/page.tsx`. It imports
`components/nana/ResearchRoom.tsx`, whose root element carries:

```text
data-research-room-version="canonical-simplified-v1"
```

The comparison interface keeps verified database topics inside
**+ Add comparison row**. The retired standalone section headed **More verified
comparisons** / **Topics parents can explore** must not return.

## Deployment rule

- `main` is the production and scheduled-workflow branch.
- Feature branches and backup refs are never deployment sources.
- The pre-canonical `main` is preserved only as the Git tag
  `archive/research-room-old-main-2026-07-25`.
- The canonical guard runs on every pull request and push to `main`. It rejects
  duplicate Research Room page routes, the wrong component wiring, a missing
  version marker, missing topic plumbing, or retired standalone-topic copy.

Run the same guard locally:

```sh
npm run verify:research-room:canonical
```

Start the confirmed local page from this repository only:

```sh
npm run dev:research-room
```

Then open `http://192.168.1.143:3003/nana/research-room` from the MacBook.
The command uses an isolated build directory and refuses to start if the
canonical guard fails.

Historical clones, backup branches, mockup HTML files, and archive tags are
reference material only. They must never be used to start or deploy the site.
