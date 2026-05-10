// Chat-related types extracted from components/nana/DecisionHub.tsx as
// part of slice 3d (chat extraction). These are the public types the
// useNanaChat hook + NanaBubble component speak in. Keep behaviour-
// preserving — same shapes, same fields, same optionality as the original
// definitions so existing JSX that references them does not need to
// change.

export interface ParsedSections {
  short_answer?:        string
  confirmed_facts?:     string
  what_this_means?:     string
  tradeoff?:            string
  what_we_dont_know?:   string
  sources?:             string
  you_might_also_ask?:  string
}

export interface SourceUsed {
  section_id:    string
  section_label: string
  source_url:    string
  source_type:   string
}

export interface RecommendedSchool {
  slug:    string
  name:    string
  why:     string
  concern?: string
}

// Slice 5: Nana emits proposals into parsed_answer.proposed_actions when a
// chat answer surfaces a comparison-worthy dimension. The user clicks
// "+ Add as row" to confirm; the server-side function reconstructs the
// proposal from this JSON and writes the row. Nana herself never writes.
export interface ProposedAddRow {
  kind:        'propose_add_row'
  row_name:    string
  group_name:  string
  weight?:     number
  cell_data:   Record<string, { value: string | number | null; source?: string | null; note?: string }>
}

// Slice 6: re-rank and create-lens proposals. Both carry a view_spec
// (base lens + per-row weights + optional row-name allowlist for
// visibility). Re-rank is ephemeral — applied client-side, no DB write
// — until the user opts to save it as a lens. Create-lens is durable
// from first click.
//
// Row keys in `view_spec.weights` are CANONICAL row labels exactly as
// they appear on the comparison table (the validator does the
// canonicalisation; UI can do a direct row-name lookup).
export interface ProposeViewSpec {
  base_lens_kind: 'general' | 'child_fit'
  weights:        Record<string, number>
  visible_rows?:  string[]
}

export interface ProposeReRank {
  kind:       'propose_re_rank'
  label:      string
  rationale?: string
  view_spec:  ProposeViewSpec
}

export interface ProposeCreateLens {
  kind:           'propose_create_lens'
  lens_name:      string
  lens_question?: string
  view_spec:      ProposeViewSpec
}

// Slice 7: bounded text Nana can propose for the parent-facing partner
// brief. Confirmation is still pointer-only: the server re-reads this
// proposal from the persisted chat message before appending it.
export interface ProposeAddToLetter {
  kind:          'propose_add_to_letter'
  label:         string
  section:       'opening' | 'why_it_matters' | 'tradeoffs' | 'questions' | 'next_step'
  body_markdown: string
  rationale?:    string
}

export type ProposedAction = ProposedAddRow | ProposeReRank | ProposeCreateLens | ProposeAddToLetter
// Keyed by short proposal_id (^[a-zA-Z0-9_-]{1,40}$). Function reads
// parsed_answer.proposed_actions[proposal_id] when confirming.
export type ProposedActions = Record<string, ProposedAction>

export interface ParsedAnswer {
  sections:             ParsedSections
  confidence:           'high' | 'medium' | 'low' | 'none'
  follow_ups?:          string[]
  tour_question?:       string | null
  tour_target?:         string | null
  sources_used?:        SourceUsed[]
  recommended_schools?: RecommendedSchool[]
  answer_markdown?:     string
  proposed_actions?:    ProposedActions
}

export interface ResearchMessage {
  id:          string
  question:    string
  parsed:      ParsedAnswer | null
  rawText?:    string
  parseError?: string
  shareToken?: string
  createdAt:   string
  // Slice 5-FU2: proposal_ids whose corresponding comparison_row is currently
  // active (undone_at IS NULL) in the table. Server-derived; lets the chat
  // bubble's "+ Add as row" button flip between "+ Add" / "✓ Added" based on
  // table truth instead of local click history. Empty for non-rehydrated
  // messages (streaming chat in this session) — they fall back to local state.
  activeProposalIds?: string[]
  // Slice 7: add-to-letter proposal_ids already appended to partner_briefs.
  // Derived from research_session_messages.actions on page load.
  activeLetterProposalIds?: string[]
}

export interface ToolStep {
  id:              string
  name:            string
  args:            Record<string, unknown>
  status:          'started' | 'completed'
  result_summary?: string
}

export interface DecisionSummary {
  what_we_know:           string[]
  outstanding_questions:  string[]
  signals:                'positive' | 'mixed' | 'negative' | 'insufficient'
  one_liner:              string
}

export interface Session {
  id:              string
  title:           string | null
  summary:         DecisionSummary | null
  created_at:      string
  last_active_at:  string
}

// Stream format flag emitted by the intent router BEFORE any tokens.
// 'structured' = legacy multi-section JSON; 'prose' = plain markdown.
export type StreamFormat = 'structured' | 'prose'

// UI intent emitted on the `final` event. DecisionHub uses these to
// auto-switch tabs / show candidate cards. Research Room read-only mode
// will ignore them.
export type NanaUiIntent =
  | { action: 'show_verdict';    schoolSlug: string }
  | { action: 'show_compare';    schoolSlugs: string[] }
  | { action: 'show_candidates'; candidates: RecommendedSchool[] }

// Error surface — bubbled up by useNanaChat for the caller to render.
export interface AskError {
  status?: number
  message: string
}
