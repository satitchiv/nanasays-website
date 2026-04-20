/**
 * <DailyLifeGrid> — Grid of 6-8 "daily life" cards (wellbeing, phones, food, boarding, bullying, etc.)
 *
 * Data: school_structured_data (wellbeing_staffing, policies_summary) + sensibly-authored fallback cards
 *
 * For MVP we render the cards we have data for. A card that's null in the data renders with a
 * "we couldn't find this — ask on tour" gap state, preserving the honest-about-gaps tone.
 */

type Wellbeing = {
  team?: Array<{ role: string; count?: number }>
  total_staff?: number | null
  ratio_per_pupil?: number | null
  notes?: string
}

type Policies = {
  phone_device_rules?: string | null
  phone_policy_url?: string | null
  bullying_policy_published?: boolean | null
  bullying_policy_url?: string | null
  other_policies?: Array<{ name: string; url?: string | null }>
  notes?: string
}

type Props = {
  wellbeing?: Wellbeing | null
  policies?: Policies | null
  boarding?: boolean | null
  totalPupils?: number | null
}

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="daily-card">
      <h4><span className="icon">{icon}</span> {title}</h4>
      {children}
    </div>
  )
}

export default function DailyLifeGrid({ wellbeing, policies, boarding, totalPupils }: Props) {
  // Compute mental-health ratio if we have both inputs
  let ratioLabel: string | null = null
  if (wellbeing?.total_staff && totalPupils) {
    const ratio = Math.round(totalPupils / wellbeing.total_staff)
    ratioLabel = `1 staff member per ${ratio} pupils`
  } else if (wellbeing?.ratio_per_pupil) {
    ratioLabel = `1 staff member per ${wellbeing.ratio_per_pupil} pupils`
  }

  return (
    <section className="block" id="daily-life">
      <h2 className="block-title">Daily life at the school</h2>
      <p>What a day actually looks like — the things parents worry about at 2am.</p>

      <div className="daily-grid">
        <Card icon="💚" title="Wellbeing & mental health">
          {wellbeing?.team && wellbeing.team.length > 0 ? (
            <>
              <p>
                The school publishes a named wellbeing team of{' '}
                <strong>{wellbeing.total_staff || wellbeing.team.length} staff</strong>:{' '}
                {wellbeing.team.map(t => t.count && t.count > 1 ? `${t.count} × ${t.role}` : t.role).join(', ')}.
              </p>
              {ratioLabel && <p><strong>Ratio:</strong> {ratioLabel}.</p>}
              <p style={{ background: 'var(--teal-bg)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: 'var(--navy)' }}>
                <strong>Sector benchmark:</strong> UK boarding schools typically aim for 1 counsellor per 150–300 pupils. NHS CAMHS target is a 4-week wait from referral.
              </p>
            </>
          ) : (
            <p className="gap">
              <strong>Staffing not published.</strong> Ask: "How many trained counsellors do you employ, what is the ratio per pupil, and what is the typical wait between a pupil asking for help and her first session?" Sector benchmark: 1 counsellor per 150–300 pupils at UK boarding schools.
            </p>
          )}
        </Card>

        <Card icon="📱" title="Phone & device policy">
          {policies?.phone_device_rules ? (
            <p>{policies.phone_device_rules}</p>
          ) : (
            <p className="gap">
              <strong>Published phone policy not found in our data.</strong> Most top UK boarding schools operate phone-free dorms after lights-out. Ask on tour what happens to phones from 9pm to 7am, and whether rules differ by year group.
            </p>
          )}
          {policies?.phone_policy_url && (
            <p style={{ fontSize: 13 }}>
              <a href={policies.phone_policy_url}>Read the published policy →</a>
            </p>
          )}
        </Card>

        <Card icon="🛡️" title="Bullying policy">
          {policies?.bullying_policy_url ? (
            <p>
              Anti-bullying policy is published online.{' '}
              <a href={policies.bullying_policy_url}>Read it →</a>
            </p>
          ) : policies?.bullying_policy_published === false ? (
            <p className="gap">
              <strong>Policy available on request only</strong> — not published publicly. Ask admissions for a copy before registration.
            </p>
          ) : (
            <p className="gap">
              <strong>No bullying policy URL found.</strong> Ask admissions directly for a copy of the current anti-bullying policy and confirm whether it is published or on-request only.
            </p>
          )}
        </Card>

        {boarding && (
          <>
            <Card icon="🏠" title="Boarding structure">
              <p>
                The school operates boarding. Ask on tour about house structure (single-age vs mixed-age rooms),
                typical house size, ratio of houseparents to pupils, and what happens at weekends for pupils
                who can't go home.
              </p>
            </Card>

            <Card icon="💛" title="Homesickness — first weeks">
              <p>
                Ask: "What does the first two weeks look like for a Year 7 arriving from overseas, who is the
                point-of-contact for parents, and what's the escalation path if she's struggling at 2am?"
              </p>
            </Card>

            <Card icon="🌙" title="Prep, sleep, supervision">
              <p className="gap">
                Published prep hours, lights-out times, and overnight adult cover aren't usually in public
                materials. Ask the Houseparent directly: "What time is lights-out for a Year 7 in her first term,
                and who is on the house overnight?"
              </p>
            </Card>
          </>
        )}

        <Card icon="🍽️" title="Food & catering">
          <p className="gap">
            The catering partner and dietary accommodations aren't usually published. Time your tour visit for
            lunchtime to see the food yourself, and ask about allergy protocols.
          </p>
        </Card>
      </div>

      <div className="translate">
        <p><strong>Treat the tour as your interview of the school.</strong> Each gap above is a litmus test. A well-run school gives confident, specific answers. A school that deflects is telling you something.</p>
      </div>
    </section>
  )
}
