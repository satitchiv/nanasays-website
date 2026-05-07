import { notFound, redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { isResearchRoomEnabled } from '@/lib/feature-flags'
import { getUnlockedUser } from '@/lib/paid-status'
import { supabaseService } from '@/lib/supabase-admin'
import { loadComparisonData, type LensKind } from '@/lib/research-comparison'
import { loadShortlistContext, seedResearchSession } from '@/lib/research-room/seed-rows'
import { loadActiveChildren } from '@/lib/children'
import { ONBOARDING_FIELDS } from '@/lib/onboarding-fields'
import ResearchRoom from '@/components/nana/ResearchRoom'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Research Room — Nanasays',
  robots: { index: false, follow: false },
}

// Next 14.2.x: searchParams is synchronous. The Promise-shape is
// Next 15+; using it here would silently leave the value un-resolved.
type SearchParams = { lens?: string }

export default async function ResearchRoomPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  if (!isResearchRoomEnabled()) {
    notFound()
  }

  const { isPaid } = await getUnlockedUser()
  if (!isPaid) {
    redirect('/unlock?next=/nana/research-room')
  }

  // Slice 5.5a: lens read from URL search param. Defaults to 'general'.
  // Tab clicks call router.replace('?lens=...') so the server re-renders
  // with the active lens scope.
  const lens: LensKind = searchParams.lens === 'child_fit' ? 'child_fit' : 'general'

  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll() {} } },
  )
  const { data: { user } } = await authClient.auth.getUser()

  // Slice 3.2: read active_child_id from parent_profiles (persisted),
  // load active children, and scope the comparison data fetch to the
  // active child. NULL active_child_id falls back to parent-wide rows
  // (legacy behavior — pre-multi-child shortlist data).
  // Slice 5.5 round-4 fix (Codex F3): comparisonData starts as an explicit
  // empty payload, never undefined, so a load error doesn't fall through
  // to ComparisonView's PLACEHOLDER_DATA demo schools. comparisonError
  // surfaces a banner.
  let comparisonData: import('@/components/nana/comparison-placeholder').ComparisonData =
    { schools: [], rows: [] }
  let comparisonError: string | null = null
  let children: Awaited<ReturnType<typeof loadActiveChildren>> = []
  let activeChildId: string | null = null
  let familyPreferences: Record<string, string | null> | undefined

  if (user) {
    try {
      children = await loadActiveChildren(supabaseService(), user.id)
    } catch (e) {
      console.error('[research-room loadActiveChildren]', e)
    }

    // Read parent_profiles for active_child_id (persisted) AND for the
    // family-preferences card on the Brief tab. Stale active_child_id
    // (archived/deleted child) falls back to the first active child.
    const profileFields = ['active_child_id', ...ONBOARDING_FIELDS.map(f => f.field)]
    const { data: profile } = await supabaseService()
      .from('parent_profiles')
      .select(profileFields.join(', '))
      .eq('id', user.id)
      .maybeSingle<Record<string, string | null>>()

    const persisted = (profile?.active_child_id as string | null) ?? null
    const stillActive = persisted && children.some(c => c.id === persisted)
    activeChildId = stillActive ? persisted : (children[0]?.id ?? null)

    if (profile) {
      familyPreferences = {}
      for (const f of ONBOARDING_FIELDS) {
        const v = profile[f.field]
        familyPreferences[f.field] = (typeof v === 'string' && v) ? v : null
      }
    }
  }

  // Slice 5.5 prereq order:
  //   1. Resolve session  (was: after loadComparisonData; moved up because
  //      the lens-aware loader needs sessionId).
  //   2. Load shortlist context  (used by both seeder and loader).
  //   3. Seed General-lens rows  (idempotent; no-op after the first run).
  //   4. Lens-aware loadComparisonData  (reads comparison_rows by lens).
  //   5. Load messages + activeProposalIds for the chat panel.
  let initialSession: import('@/lib/nana/types').Session | null = null
  let initialMessages: import('@/lib/nana/types').ResearchMessage[] = []
  let activeLensId: string | null = null
  // Slice 6 close — saved lenses available to the lens picker dropdown.
  // weights are UUID-keyed (resolved by confirm_lens_from_proposal at
  // save time); visible_rows is a UUID array. ResearchRoom maps both
  // back to row IDs to drive the comparison overlay client-side.
  type SavedLens = {
    id:             string
    lens_name:      string
    lens_question:  string | null
    base_lens_kind: 'general' | 'child_fit'
    weights:        Record<string, number>
    visible_rows:   string[] | null
    created_at:     string
  }
  let savedLenses: SavedLens[] = []

  if (user && activeChildId) {
    const svc = supabaseService()
    const { data: sessions } = await svc
      .from('research_sessions')
      .select('id, title, summary, created_at, last_active_at, active_lens_id')
      .eq('user_id', user.id)
      .eq('child_id', activeChildId)
      .order('last_active_at', { ascending: false })
      .limit(1)

    if (sessions && sessions[0]) {
      initialSession = {
        id:             sessions[0].id,
        title:          sessions[0].title,
        summary:        sessions[0].summary as import('@/lib/nana/types').DecisionSummary | null,
        created_at:     sessions[0].created_at,
        last_active_at: sessions[0].last_active_at,
      }
      activeLensId = (sessions[0].active_lens_id as string | null) ?? null
    }

    // Load shortlist context once. Both the seeder and (in future) the
    // child-fit cell-builder consume it.
    let ctx: Awaited<ReturnType<typeof loadShortlistContext>> | null = null
    try {
      ctx = await loadShortlistContext(svc, user.id, activeChildId)
    } catch (e) {
      console.error('[research-room loadShortlistContext]', e)
    }

    // Seed only when there's an active session AND a non-empty shortlist.
    // Brand-new users without a session yet get an empty comparison until
    // their first chat lazily creates the session.
    if (initialSession && ctx && ctx.slugs.length > 0) {
      try {
        await seedResearchSession(svc, user.id, initialSession.id, ctx)
      } catch (e) {
        console.error('[research-room seedResearchSession]', e)
      }
    }

    // Slice 6 close — load saved lenses for the picker dropdown. Order
    // by created_at so the most recent saves appear at the top of the
    // list. Lookup is scoped to the session, so cross-session leakage
    // is impossible (and the DB triggers in slice 6 enforce the same
    // invariant at the database layer).
    if (initialSession) {
      const { data: lensRows } = await svc
        .from('comparison_lenses')
        .select('id, lens_name, lens_question, base_lens_kind, weights, visible_rows, created_at')
        .eq('session_id', initialSession.id)
        .order('created_at', { ascending: false })
      type LensRow = {
        id:             string
        lens_name:      string
        lens_question:  string | null
        base_lens_kind: 'general' | 'child_fit'
        weights:        Record<string, number> | null
        visible_rows:   string[] | null
        created_at:     string
      }
      savedLenses = ((lensRows ?? []) as LensRow[]).map(r => ({
        id:             r.id,
        lens_name:      r.lens_name,
        lens_question:  r.lens_question,
        base_lens_kind: r.base_lens_kind,
        weights:        (r.weights ?? {}) as Record<string, number>,
        visible_rows:   r.visible_rows,
        created_at:     r.created_at,
      }))
    }

    // If a saved lens is active, the comparison rows we load must
    // belong to that lens's base_lens_kind — its weights/visible_rows
    // are UUID-keyed against rows in that base. URL-driven lens stays
    // the source of truth when active_lens_id is null.
    const activeLens = activeLensId
      ? savedLenses.find(l => l.id === activeLensId) ?? null
      : null
    const effectiveLens: LensKind = activeLens ? activeLens.base_lens_kind : lens

    // Lens-aware comparison load. With no session, the loader returns
    // schools but no rows (the seeder hasn't run yet). On error, keep
    // comparisonData as the empty default + flag the error so the UI
    // can surface a banner instead of falling through to demo data.
    try {
      comparisonData = await loadComparisonData(
        svc,
        user.id,
        activeChildId,
        effectiveLens,
        initialSession?.id ?? null,
      )
    } catch (e) {
      console.error('[research-room loadComparisonData]', e)
      comparisonError = 'Could not load your comparison. Refresh the page; if the problem persists, contact support.'
    }

    if (initialSession) {
      const { data: msgs } = await svc
        .from('research_session_messages')
        .select('id, question, parsed_answer, share_token, created_at, actions')
        .eq('session_id', initialSession.id)
        .order('created_at', { ascending: true })

      // Slice 5-FU2: derive activeProposalIds per message so the chat
      // bubble's "✓ Added" badge tracks the table's actual contents.
      // Soft-deleted (× removed) rows fall out, flipping the bubble button
      // back to "+ Add" and unblocking re-add via auto-restore.
      //
      // Round-4 fix (Codex F1): a chat row whose row_name collides with
      // BOTH base lenses (general AND child_fit) is hidden in every tab —
      // the loader's base-wins de-dup drops it. Marking it "Added" in chat
      // would be a lie ("you can't see it anywhere"). Filter such rows out
      // of activeProposalIds so the bubble shows "+ Add" again.
      const { data: activeRows } = await svc
        .from('comparison_rows')
        .select('lens_kind, row_name, idempotency_key, source_message_id')
        .eq('session_id', initialSession.id)
        .is('undone_at', null)
      type ActiveRow = {
        lens_kind:        'general' | 'child_fit' | 'chat'
        row_name:         string
        idempotency_key:  string | null
        source_message_id: string | null
      }
      const allActive = (activeRows ?? []) as ActiveRow[]
      const norm = (s: string) => s.trim().toLowerCase()
      const generalNames  = new Set(allActive.filter(r => r.lens_kind === 'general').map(r => norm(r.row_name)))
      const childFitNames = new Set(allActive.filter(r => r.lens_kind === 'child_fit').map(r => norm(r.row_name)))
      const activeIdempotencyKeys = new Set(
        allActive
          .filter(r => r.lens_kind === 'chat')
          .filter(r => r.idempotency_key != null && r.source_message_id != null)
          .filter(r => {
            const n = norm(r.row_name)
            // Hidden in EVERY tab iff both base lenses shadow it.
            return !(generalNames.has(n) && childFitNames.has(n))
          })
          .map(r => r.idempotency_key as string)
      )

      type StampedAction = { kind?: string; proposal_id?: string; idempotency_key?: string }

      // Round-5 polish: a proposal counts as "Added" if EITHER (a) its own
      // chat row is active and visible in some tab, OR (b) ANY active row
      // (seeded or chat) in the session has the same row_name. Without
      // (b), a proposal whose row_name matches a seeded row would render
      // "+ Add" — confusing, since the dimension is already in the
      // comparison. The route's F1 cross-lens block would then 409 the
      // click, surfacing an error the user shouldn't have hit.
      const allActiveRowNames = new Set(allActive.map(r => norm(r.row_name)))

      initialMessages = (msgs ?? []).map(m => {
        const stamps = (m.actions ?? []) as StampedAction[]
        const activeProposalIds: string[] = []
        const seen = new Set<string>()

        // (a) chat row exists active and visible.
        for (const a of stamps) {
          if (a.kind !== 'add_row') continue
          if (!a.proposal_id || !a.idempotency_key) continue
          if (!activeIdempotencyKeys.has(a.idempotency_key)) continue
          if (seen.has(a.proposal_id)) continue
          seen.add(a.proposal_id)
          activeProposalIds.push(a.proposal_id)
        }

        // (b) any active row covers the proposal's row_name.
        type ProposalLite = { row_name?: unknown }
        const proposals = (((m.parsed_answer as { proposed_actions?: Record<string, ProposalLite> } | null)?.proposed_actions) ?? {}) as Record<string, ProposalLite>
        for (const [pid, prop] of Object.entries(proposals)) {
          if (seen.has(pid)) continue
          const rn = typeof prop?.row_name === 'string' ? norm(prop.row_name) : null
          if (!rn) continue
          if (!allActiveRowNames.has(rn)) continue
          seen.add(pid)
          activeProposalIds.push(pid)
        }

        return {
          id:                 m.id,
          question:           m.question,
          parsed:             (m.parsed_answer ?? null) as import('@/lib/nana/types').ParsedAnswer | null,
          shareToken:         m.share_token ?? undefined,
          createdAt:          m.created_at,
          activeProposalIds,
        }
      })
    }
  }

  const childSummaries = children.map(c => ({
    id: c.id,
    name: c.name,
    date_of_birth: c.date_of_birth,
    child_profile: (c.child_profile ?? {}) as Record<string, string | null>,
    is_archived: c.is_archived,
  }))

  return (
    <ResearchRoom
      childOptions={childSummaries.map(c => ({ id: c.id, name: c.name }))}
      childSummaries={childSummaries}
      familyPreferences={familyPreferences}
      initialActiveChildId={activeChildId}
      comparisonData={comparisonData}
      comparisonError={comparisonError}
      lens={lens}
      initialSession={initialSession}
      initialMessages={initialMessages}
      savedLenses={savedLenses}
      activeLensId={activeLensId}
    />
  )
}
