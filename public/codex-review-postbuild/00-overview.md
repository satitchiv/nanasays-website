# Thai Caption Feature — Post-Build Review Overview

## What was built

End-to-end Thai translation for social captions, admin-triggered (opt-in, not auto).

**Flow:**
1. Admin opens a post detail or queue card.
2. Clicks 🇹🇭 Generate Thai (or 🔄 Regenerate if `copy_th` already exists).
3. Next.js route spawns `translate-caption.js --post=<uuid>`.
4. CLI loads `copy_en` + school context, calls Claude Sonnet 4.6 via CLI binary, validates output (Thai unicode, URL/hashtag/number preservation, polite-particle at end), writes `copy_th` + `copy_th_generated_at` + `copy_th_model` back.
5. Route returns the saved Thai caption; UI updates optimistically.
6. Admin can inline-edit either EN or TH via textareas on the detail page (`PATCH /admin/content/api/post/[id]/caption` saves).

## File map

| File | Kind | Lines |
|---|---|---|
| `scripts/migrations/2026-04-24-thai-caption.sql` | new | 23 |
| `scripts/social-media-planner/translate-caption.js` | new | 266 |
| `website/app/admin/content/api/post/[id]/translate-caption/route.ts` | new | 104 |
| `website/app/admin/content/api/post/[id]/caption/route.ts` | new | 37 |
| `website/app/admin/content/[id]/page.tsx` | modified | +170/-40 |
| `website/app/admin/content/page.tsx` | modified | +80/-10 |
| `website/app/admin/layout.tsx` | modified | +30/-10 |
| `website/app/admin/content/plan/page.tsx` | modified | -6 |

## Risky spots I want you to pressure-test

### A. Validator regex for the polite particle
File: `01-translate-caption.js` — `validateTranslation()` near end.

The rule: every Thai caption body (after stripping trailing hashtags/URLs/punct/emoji) MUST end with one of `ค่ะ | ค่า | คะ | นะคะ | นะค่ะ`. First version only allowed 4 of those — rejected a legitimate `ลองเปิดดูสิคะ` ending. Now accepts all 5. Worried about:
- False negatives: caption with unusual trailing whitespace, multi-line endings with emoji after the particle.
- False positives: particles appearing mid-body but body ending on bare declarative.

### B. Child-process spawn + error surfacing
File: `02-translate-caption-route.ts`

If the CLI crashes hard vs returns an error message, the UI currently surfaces `stderr.split('\n').pop()`. Edge case: CLI prints a warning to stderr and succeeds — we'd show the warning as an error title. Haven't seen it in practice but worth checking.

### C. Race between EN edit and Thai regenerate
File: `05-diff-detail-page.patch` — see `handleTranslate()`.

If EN textarea is dirty and user clicks Regenerate Thai, we refuse client-side with "Save your English edit first, then translate." API doesn't enforce this. Deliberate — admin is trusted — but double-check the user journey makes sense.

### D. Auth token refresh
File: `05-diff-detail-page.patch` — all fetch calls use `supabase.auth.getSession()` and attach Bearer token. If token is expired at fetch time, we just 401 and show the error. Consider whether to trigger a refresh.

### E. Dirty-state tracking
File: `05-diff-detail-page.patch` — `const dirty = draftEn !== (post.copy_en || '') || draftTh !== (post.copy_th || '')`

Relies on `post` state being re-fetched after every save. If another action races, `dirty` could briefly show stale.

## Not risky — already verified

- **Migration applied**: `copy_th`, `copy_th_generated_at`, `copy_th_model` exist on `social_posts` in the live Supabase project `ckofdbjfbxoxxxtedmqa`. Confirmed via `information_schema.columns` query.
- **End-to-end live**: 3 posts currently have Thai captions generated via this pipeline. All read naturally; all end on polite particles.
- **Preservation rules**: manual inspection confirms school names, curriculum codes (IB/IGCSE/AP), URLs, hashtags, and Arabic numerals survive the round-trip.
- **Type-check passes**: the 2 website files I touched have zero errors under the project tsconfig.

## Out of scope (don't review)

- Auto-generating Thai at album creation time (deliberately opt-in).
- Thai hashtags (hashtags stay in English).
- Thai alt text (`image_alt_en`).
- Scheduling / Facebook auto-posting.
- Multi-language support beyond Thai (if we add Chinese/Japanese, we'd promote copy_th to a JSONB column — tracked as future work, not this review's concern).
