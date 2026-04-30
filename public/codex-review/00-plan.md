# Thai Caption Feature — Plan

## Goal

Add a per-draft "Generate Thai caption" button on the Queue page. One click
runs a single Claude translation of the existing `copy_en` into
parent-friendly Thai, saves it on the post row, and shows EN + TH
side-by-side. No change to album generation; translation is an opt-in
downstream step driven from the admin UI.

## Out of scope (on purpose)

- Auto-generating Thai at album creation time (wastes Claude calls on
  drafts that get rejected).
- Thai hashtags (stored separately, not part of the translated body).
- Thai alt text (`image_alt_en`) — future iteration if needed for IG
  accessibility.
- Any Facebook/Instagram scheduling wiring — that's the next build.

## Data model

Migration: `scripts/migrations/2026-04-24-thai-caption.sql` (idempotent).

Adds to `social_posts`:
- `copy_th text` — the Thai caption, nullable
- `copy_th_generated_at timestamptz` — when it was produced (audit)
- `copy_th_model text` — which Claude model produced it (audit)

Regenerating overwrites all three — we keep only the latest translation.
If we later want history we add a `social_post_translations` table; not
needed for this slice.

## Files

### New

1. **`scripts/migrations/2026-04-24-thai-caption.sql`**
   Idempotent ALTERs adding the three columns above.

2. **`scripts/social-media-planner/translate-caption.js`**
   CLI + module. Invokable as `node translate-caption.js --post=<uuid>`.
   - Loads the post (id, copy_en, source_data.school_snapshot, pillar_slug)
   - Builds the translation prompt
   - Calls Claude via the same CLI path (`/opt/homebrew/bin/claude`) and
     model the album generator uses (`SOCIAL_CLAUDE_MODEL` env, default
     `claude-sonnet-4-6`)
   - Writes `copy_th`, `copy_th_generated_at`, `copy_th_model` back
     to the post row
   - Exits 0 on success; non-zero + stderr on failure

3. **`website/app/admin/content/api/post/[id]/translate-caption/route.ts`**
   POST endpoint. verifyAdmin → spawn the CLI script with `--post=<id>`
   → parse exit code + final row → return `{ ok, copy_th }`. Mirrors the
   pattern in `api/generate/route.ts`.

### Modified

4. **`website/app/admin/content/page.tsx`**
   - Add `copy_th` to the select projection
   - Add `copy_th: string | null` to the Post type
   - Per-card: small button 🇹🇭 Generate Thai (or 🔄 Regenerate Thai
     when `copy_th` exists). Spinner while pending. Toast on error.
   - Render `copy_th` under `copy_en` when present, clipped the same
     way (120 chars + ellipsis) so cards stay balanced.

## Translation prompt — principles

```
You are translating a Facebook/Instagram caption about an international
school in Bangkok into Thai for local parents.

Rules:
  - Match the source tone: factual, no superlatives, parent-friendly.
  - Keep proper nouns in English (e.g. "Bangkok Patana School",
    "NIST International School").
  - Keep numbers in Arabic numerals (2,300 not ๒,๓๐๐).
  - Keep URLs, handles, dates exactly as-is.
  - Formality: neutral-polite. Use ค่ะ/ครับ sparingly (once at the end
    if it reads naturally, otherwise omit). Avoid stiff news-writing
    register; this is a parent talking to parents.
  - Length: similar to the English version. Not noticeably shorter or
    longer.
  - Return ONLY the Thai caption text. No preamble, no JSON, no
    explanation.

Input (English):
{copy_en}

Context (for cultural accuracy only, don't translate this):
  School: {school_name}, {school_city}
  Audience: parents considering international schools in Bangkok
  Pillar: {pillar_slug}
```

## UI sketch (desktop queue card)

```
┌─────────────────────────────────────────────────┐
│ [thumbnail]  Bangkok Patana School              │
│              📚 6 slides · school_spotlight     │
│              Apr 24 · pending review            │
│                                                 │
│  ⎸ EN  Bangkok Patana School has been           │
│        educating students in Thailand since…    │
│  ⎸ TH  โรงเรียนนานาชาติกรุงเทพพัฒนา เปิดสอน…    │
│                                                 │
│  [🔄 Regenerate Thai]   [Approve] [Reject]      │
└─────────────────────────────────────────────────┘
```

Before first generation, where "TH" row is, show instead:
```
  [🇹🇭 Generate Thai caption]
```

## Error handling

- No `copy_en` on the post → button disabled + tooltip "generate album
  first"
- Claude CLI failure → row unchanged, error surfaces in the same
  message bar the generate/delete actions use
- Timeout: inherit whatever child-process timeout
  `api/generate/route.ts` uses (currently 5 min via `maxDuration` —
  way more than a translation needs, but cheap to inherit)

## Build order (4-5 hours total)

**Slice 1 — backend (1.5h)**
- Migration + apply
- `translate-caption.js` module + CLI
- Manual test: `node translate-caption.js --post=<existing-uuid>` →
  row has `copy_th` populated

**Slice 2 — API (0.5h)**
- Next.js API route that spawns the CLI
- Verify via `curl` with admin session cookie

**Slice 3 — UI (1-2h)**
- Queue card button + row rendering
- Spinner state, error toast
- Visual check across 3-4 different posts

**Slice 4 — commit + hand off (0.5h)**
- Same two-commit-repo dance we've established
- Codex diff review before push

## Risks / things Codex should sanity-check

1. **Thai output quality** — Claude is good at Thai but has some known
   failure modes (over-formal, dropping English proper nouns). Is the
   prompt specific enough, or do we need few-shot examples?
2. **Spawning scope** — are we correctly limiting the scope of what the
   child process can do? (It's already scoped to one post by the
   `--post=<uuid>` arg, so no batch surprise.)
3. **Concurrency** — what if the user mashes the button twice? Should
   we dedupe at the API layer (e.g. return the existing in-flight
   promise) or rely on the UI disabling the button?
4. **Admin auth on the Next.js route** — matching the existing
   `verifyAdmin` pattern; is there anything post-specific we should
   check (ownership, post status)?
5. **Data model** — is three columns (copy_th + two audit fields) the
   right call, or is a single JSONB `translations` column cleaner?
