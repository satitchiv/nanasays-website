'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const navy = '#1B3252'
const teal = '#34C3A0'
const tealDk = '#239C80'
const tealBg = '#E8FAF6'
const border = '#E2E8F0'
const muted = '#6B7280'
const off = '#F6F8FA'

// Only these fields can be written back to the DB — never spreads raw form state
const EDITABLE_FIELDS = [
  'description', 'hero_image', 'logo_url', 'gallery_images', 'school_video_url',
  'instagram_url', 'youtube_url', 'unique_selling_points', 'curriculum',
  'founded_year', 'school_type', 'languages', 'accreditations', 'school_motto',
  'religious_affiliation', 'student_count', 'teacher_count', 'student_teacher_ratio',
  'typical_class_size', 'nationalities_count', 'international_student_percent',
  'acceptance_rate', 'fees_usd_min', 'fees_usd_max', 'boarding_fees_usd',
  'application_fee_usd', 'rolling_admissions', 'accepts_mid_year',
  'entrance_exam_required', 'visa_support', 'admissions_process',
  'university_placement_rate', 'top_universities', 'ib_pass_rate', 'ap_pass_rate',
  'a_level_results', 'gcse_results', 'oxbridge_rate', 'boarding', 'boarding_type',
  'boarding_capacity', 'single_rooms', 'sports_facilities', 'arts_programs',
  'academic_facilities', 'extracurriculars', 'ccf', 'duke_of_edinburgh',
  'sen_support', 'sen_cost_usd', 'eal_support', 'eal_cost_usd', 'eal_hours_per_week',
  'scholarship_available', 'scholarship_details', 'bursary_available',
  'bursary_details', 'mental_wellbeing', 'contact_email', 'contact_phone',
  'official_website', 'head_of_school', 'open_day_text',
] as const

const NUMBER_FIELDS = new Set([
  'founded_year', 'student_count', 'teacher_count', 'typical_class_size',
  'nationalities_count', 'international_student_percent', 'acceptance_rate',
  'fees_usd_min', 'fees_usd_max', 'boarding_fees_usd', 'application_fee_usd',
  'university_placement_rate', 'ib_pass_rate', 'ap_pass_rate', 'oxbridge_rate',
  'boarding_capacity', 'sen_cost_usd', 'eal_cost_usd', 'eal_hours_per_week',
])

const BOOLEAN_FIELDS = new Set([
  'rolling_admissions', 'accepts_mid_year', 'entrance_exam_required', 'visa_support',
  'boarding', 'single_rooms', 'ccf', 'duke_of_edinburgh',
  'sen_support', 'eal_support', 'scholarship_available', 'bursary_available',
])

const ARRAY_FIELDS = new Set([
  'gallery_images', 'curriculum', 'languages', 'accreditations', 'top_universities',
  'sports_facilities', 'arts_programs', 'academic_facilities', 'extracurriculars',
])

interface FormState {
  logo_url: string
  hero_image: string
  gallery_images: string[]
  school_video_url: string
  instagram_url: string
  youtube_url: string
  description: string
  unique_selling_points: string
  curriculum: string[]
  founded_year: string
  school_type: string
  languages: string[]
  accreditations: string[]
  school_motto: string
  religious_affiliation: string
  head_of_school: string
  student_count: string
  teacher_count: string
  student_teacher_ratio: string
  typical_class_size: string
  nationalities_count: string
  international_student_percent: string
  acceptance_rate: string
  fees_usd_min: string
  fees_usd_max: string
  boarding_fees_usd: string
  application_fee_usd: string
  rolling_admissions: boolean
  accepts_mid_year: boolean
  entrance_exam_required: boolean
  visa_support: boolean
  admissions_process: string
  university_placement_rate: string
  top_universities: string[]
  ib_pass_rate: string
  ap_pass_rate: string
  a_level_results: string
  gcse_results: string
  oxbridge_rate: string
  boarding: boolean
  boarding_type: string
  boarding_capacity: string
  single_rooms: boolean
  sports_facilities: string[]
  arts_programs: string[]
  academic_facilities: string[]
  extracurriculars: string[]
  ccf: boolean
  duke_of_edinburgh: boolean
  sen_support: boolean
  sen_cost_usd: string
  eal_support: boolean
  eal_cost_usd: string
  eal_hours_per_week: string
  scholarship_available: boolean
  scholarship_details: string
  bursary_available: boolean
  bursary_details: string
  mental_wellbeing: string
  contact_email: string
  contact_phone: string
  official_website: string
  open_day_text: string
}

const EMPTY_FORM: FormState = {
  logo_url: '', hero_image: '', gallery_images: [], school_video_url: '',
  instagram_url: '', youtube_url: '',
  description: '', unique_selling_points: '',
  curriculum: [], founded_year: '', school_type: 'Co-educational',
  languages: [], accreditations: [], school_motto: '', religious_affiliation: '',
  head_of_school: '',
  student_count: '', teacher_count: '', student_teacher_ratio: '',
  typical_class_size: '', nationalities_count: '', international_student_percent: '',
  acceptance_rate: '',
  fees_usd_min: '', fees_usd_max: '', boarding_fees_usd: '', application_fee_usd: '',
  rolling_admissions: false, accepts_mid_year: false,
  entrance_exam_required: false, visa_support: false, admissions_process: '',
  university_placement_rate: '', top_universities: [],
  ib_pass_rate: '', ap_pass_rate: '', a_level_results: '', gcse_results: '', oxbridge_rate: '',
  boarding: false, boarding_type: '', boarding_capacity: '', single_rooms: false,
  sports_facilities: [], arts_programs: [], academic_facilities: [], extracurriculars: [],
  ccf: false, duke_of_edinburgh: false,
  sen_support: false, sen_cost_usd: '', eal_support: false, eal_cost_usd: '',
  eal_hours_per_week: '',
  scholarship_available: false, scholarship_details: '',
  bursary_available: false, bursary_details: '',
  mental_wellbeing: '',
  contact_email: '', contact_phone: '', official_website: '', open_day_text: '',
}

// Image upload to Supabase Storage
function ImageUpload({ schoolId, onUrl, disabled }: {
  schoolId: string, onUrl: (url: string) => void, disabled?: boolean
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !schoolId) return
    setUploading(true)
    setUploadError('')
    try {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `${schoolId}/${Date.now()}.${ext}`
      const { data, error } = await supabase.storage
        .from('school-images')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('school-images')
        .getPublicUrl(data.path)
      onUrl(publicUrl)
    } catch {
      setUploadError('Upload failed. Try again or paste a URL.')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  if (disabled) return null

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '9px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
        background: off, border: `1.5px solid ${border}`, color: navy,
        cursor: uploading ? 'default' : 'pointer', whiteSpace: 'nowrap',
        opacity: uploading ? 0.6 : 1,
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        {uploading ? 'Uploading...' : 'Upload file'}
        <input
          type="file"
          accept="image/jpeg,image/jpg,image/png,image/webp"
          onChange={handleFile}
          disabled={uploading}
          style={{ display: 'none' }}
        />
      </label>
      {uploadError && (
        <span style={{ fontSize: 11, color: '#c0392b' }}>{uploadError}</span>
      )}
    </div>
  )
}

// Helper components

function TagInput({ tags, onChange, placeholder, disabled }: {
  tags: string[], onChange: (v: string[]) => void, placeholder?: string, disabled?: boolean
}) {
  const [val, setVal] = useState('')
  function add() {
    const t = val.trim()
    if (t && !tags.includes(t)) onChange([...tags, t])
    setVal('')
  }
  return (
    <div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {tags.map(t => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: tealBg, border: '1px solid rgba(52,195,160,0.3)',
              color: tealDk, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700,
            }}>
              {t}
              {!disabled && (
                <button
                  onClick={() => onChange(tags.filter(x => x !== t))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: tealDk, padding: 0, fontSize: 14, lineHeight: 1 }}
                >×</button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={val}
            onChange={e => setVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            placeholder={placeholder ?? 'Add item...'}
            style={{
              flex: 1, border: `1.5px solid ${border}`, borderRadius: 8,
              padding: '8px 12px', fontSize: 13, color: navy, outline: 'none',
              fontFamily: "'Nunito Sans', sans-serif", background: '#fff',
            }}
          />
          <button
            onClick={add}
            style={{
              padding: '9px 14px', borderRadius: 8, background: navy, color: '#fff',
              border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap',
            }}
          >+ Add</button>
        </div>
      )}
    </div>
  )
}

function Toggle({ value, onChange, disabled }: {
  value: boolean, onChange: (v: boolean) => void, disabled?: boolean
}) {
  return (
    <div
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 40, height: 22, background: value ? teal : '#D1D5DB', borderRadius: 11,
        position: 'relative', transition: 'background 0.2s',
        cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 16, height: 16, background: '#fff', borderRadius: '50%',
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
      }} />
    </div>
  )
}

function Field({ label, hint, children }: { label: string, hint?: string, children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: navy, marginBottom: hint ? 4 : 6 }}>
        {label}
      </label>
      {hint && <p style={{ fontSize: 12, color: muted, marginBottom: 8, lineHeight: 1.5, marginTop: 0 }}>{hint}</p>}
      {children}
    </div>
  )
}

function ToggleRow({ label, value, onChange, hint, disabled }: {
  label: string, value: boolean, onChange: (v: boolean) => void, hint?: string, disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: navy }}>{label}</div>
        {hint && <div style={{ fontSize: 12, color: muted, marginTop: 2 }}>{hint}</div>}
      </div>
      <Toggle value={value} onChange={onChange} disabled={disabled} />
    </div>
  )
}

function Section({ title, num, children }: { title: string, num: string, children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '26px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
        <div style={{
          width: 28, height: 28, background: off, border: `1px solid ${border}`,
          borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 11, color: tealDk }}>{num}</span>
        </div>
        <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 15, color: navy }}>{title}</div>
      </div>
      {children}
    </div>
  )
}

export default function EditProfilePage() {
  const [schoolId, setSchoolId] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [isPartner, setIsPartner] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [galleryInput, setGalleryInput] = useState('')

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
  }

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data } = await supabase
        .from('schools')
        .select('*')
        .eq('admin_email', session.user.email)
        .single()

      if (!data) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s: any = data
      const active = s.is_partner && s.partner_expires && new Date(s.partner_expires) > new Date()
      setSchoolId(s.id)
      setSchoolName(s.name ?? '')
      setIsPartner(!!active)

      setForm({
        logo_url: s.logo_url ?? '',
        hero_image: s.hero_image ?? '',
        gallery_images: s.gallery_images ?? [],
        school_video_url: s.school_video_url ?? '',
        instagram_url: s.instagram_url ?? '',
        youtube_url: s.youtube_url ?? '',
        description: s.description ?? '',
        unique_selling_points: s.unique_selling_points ?? '',
        curriculum: s.curriculum ?? [],
        founded_year: s.founded_year?.toString() ?? '',
        school_type: s.school_type ?? 'Co-educational',
        languages: s.languages ?? [],
        accreditations: s.accreditations ?? [],
        school_motto: s.school_motto ?? '',
        religious_affiliation: s.religious_affiliation ?? '',
        head_of_school: s.head_of_school ?? '',
        student_count: s.student_count?.toString() ?? '',
        teacher_count: s.teacher_count?.toString() ?? '',
        student_teacher_ratio: s.student_teacher_ratio ?? '',
        typical_class_size: s.typical_class_size?.toString() ?? '',
        nationalities_count: s.nationalities_count?.toString() ?? '',
        international_student_percent: s.international_student_percent?.toString() ?? '',
        acceptance_rate: s.acceptance_rate?.toString() ?? '',
        fees_usd_min: s.fees_usd_min?.toString() ?? '',
        fees_usd_max: s.fees_usd_max?.toString() ?? '',
        boarding_fees_usd: s.boarding_fees_usd?.toString() ?? '',
        application_fee_usd: s.application_fee_usd?.toString() ?? '',
        rolling_admissions: s.rolling_admissions ?? false,
        accepts_mid_year: s.accepts_mid_year ?? false,
        entrance_exam_required: s.entrance_exam_required ?? false,
        visa_support: s.visa_support ?? false,
        admissions_process: s.admissions_process ?? '',
        university_placement_rate: s.university_placement_rate?.toString() ?? '',
        top_universities: s.top_universities ?? [],
        ib_pass_rate: s.ib_pass_rate?.toString() ?? '',
        ap_pass_rate: s.ap_pass_rate?.toString() ?? '',
        a_level_results: s.a_level_results ?? '',
        gcse_results: s.gcse_results ?? '',
        oxbridge_rate: s.oxbridge_rate?.toString() ?? '',
        boarding: s.boarding ?? false,
        boarding_type: s.boarding_type ?? '',
        boarding_capacity: s.boarding_capacity?.toString() ?? '',
        single_rooms: s.single_rooms ?? false,
        sports_facilities: s.sports_facilities ?? [],
        arts_programs: s.arts_programs ?? [],
        academic_facilities: s.academic_facilities ?? [],
        extracurriculars: s.extracurriculars ?? [],
        ccf: s.ccf ?? false,
        duke_of_edinburgh: s.duke_of_edinburgh ?? false,
        sen_support: s.sen_support ?? false,
        sen_cost_usd: s.sen_cost_usd?.toString() ?? '',
        eal_support: s.eal_support ?? false,
        eal_cost_usd: s.eal_cost_usd?.toString() ?? '',
        eal_hours_per_week: s.eal_hours_per_week?.toString() ?? '',
        scholarship_available: s.scholarship_available ?? false,
        scholarship_details: s.scholarship_details ?? '',
        bursary_available: s.bursary_available ?? false,
        bursary_details: s.bursary_details ?? '',
        mental_wellbeing: s.mental_wellbeing ?? '',
        contact_email: s.contact_email ?? '',
        contact_phone: s.contact_phone ?? '',
        official_website: s.official_website ?? '',
        open_day_text: s.open_day_text ?? '',
      })
      setLoading(false)
    }
    load()
  }, [])

  async function save() {
    if (!schoolId || !isPartner) return
    setSaving(true)
    setError('')
    setSaved(false)

    // Build update object — only whitelisted fields, with correct types
    const safeUpdate: Record<string, unknown> = {}
    const formAsRecord = form as unknown as Record<string, unknown>
    for (const key of EDITABLE_FIELDS) {
      const val = formAsRecord[key]
      if (BOOLEAN_FIELDS.has(key)) {
        safeUpdate[key] = val as boolean
      } else if (ARRAY_FIELDS.has(key)) {
        safeUpdate[key] = (val as string[]).length > 0 ? val : null
      } else if (NUMBER_FIELDS.has(key)) {
        const s = val as string
        safeUpdate[key] = s === '' ? null : Number(s)
      } else {
        const s = (val as string).trim()
        safeUpdate[key] = s || null
      }
    }

    const { error: updateError } = await supabase
      .from('schools')
      .update(safeUpdate)
      .eq('id', schoolId)

    setSaving(false)
    if (updateError) {
      setError('Could not save changes. Please try again.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 3500)
    }
  }

  function i(extra?: object) {
    return {
      width: '100%', boxSizing: 'border-box' as const,
      border: `1.5px solid ${border}`, borderRadius: 9,
      padding: '10px 13px', fontSize: 13, color: navy, outline: 'none',
      fontFamily: "'Nunito Sans', sans-serif",
      background: isPartner ? '#fff' : off,
      cursor: isPartner ? 'auto' : 'default',
      ...extra,
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div style={{ width: 36, height: 36, border: `3px solid ${tealBg}`, borderTop: `3px solid ${teal}`, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 32px 80px' }}>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: tealDk, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 6 }}>
          School Portal
        </div>
        <h1 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 26, color: navy, letterSpacing: '-0.02em', margin: 0 }}>
          Edit Profile
        </h1>
        <div style={{ fontSize: 13, color: muted, marginTop: 6 }}>{schoolName}</div>
      </div>

      {!isPartner && (
        <div style={{
          background: '#fff', border: `1px solid ${border}`, borderRadius: 12,
          padding: '28px 28px', marginBottom: 28, textAlign: 'center',
        }}>
          <h3 style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 18, color: navy, marginBottom: 10, marginTop: 0 }}>
            Partner feature
          </h3>
          <p style={{ fontSize: 14, color: muted, lineHeight: 1.7, marginBottom: 20 }}>
            Profile editing is available on the Partner plan. Upgrade to control exactly how your school appears to thousands of parents searching NanaSays.
          </p>
          <a
            href="/partners#pricing"
            style={{
              display: 'inline-block', padding: '11px 28px', borderRadius: 10,
              background: teal, color: '#fff', textDecoration: 'none',
              fontSize: 13, fontWeight: 800, fontFamily: 'Nunito, sans-serif',
            }}
          >
            Upgrade to Partner
          </a>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* 01 — Media & Brand */}
        <Section title="Media &amp; Brand" num="01">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Logo URL" hint="Square PNG or SVG, min 200×200px">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                  <input
                    type="url"
                    value={form.logo_url}
                    onChange={e => setField('logo_url', e.target.value)}
                    disabled={!isPartner}
                    placeholder="https://..."
                    style={{ ...i(), flex: 1 }}
                  />
                  {form.logo_url ? (
                    <img src={form.logo_url} alt="Logo" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'contain', border: `1px solid ${border}`, flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: 44, height: 44, borderRadius: 8, background: off, border: `1px solid ${border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 9, color: muted, fontWeight: 700 }}>LOGO</span>
                    </div>
                  )}
                </div>
                <ImageUpload schoolId={schoolId} onUrl={url => setField('logo_url', url)} disabled={!isPartner} />
              </Field>
              <Field label="School video URL" hint="YouTube or Vimeo embed link">
                <input
                  type="url"
                  value={form.school_video_url}
                  onChange={e => setField('school_video_url', e.target.value)}
                  disabled={!isPartner}
                  placeholder="https://youtube.com/embed/..."
                  style={i()}
                />
              </Field>
            </div>

            <Field label="Hero image" hint="1200×675px recommended. First image parents see on your profile.">
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <input
                  type="url"
                  value={form.hero_image}
                  onChange={e => setField('hero_image', e.target.value)}
                  disabled={!isPartner}
                  placeholder="https://..."
                  style={{ ...i(), flex: 1 }}
                />
                <ImageUpload schoolId={schoolId} onUrl={url => setField('hero_image', url)} disabled={!isPartner} />
              </div>
              {form.hero_image && (
                <div style={{ borderRadius: 10, overflow: 'hidden', maxHeight: 200 }}>
                  <img src={form.hero_image} alt="Hero preview" style={{ width: '100%', objectFit: 'cover', display: 'block', maxHeight: 200 }} />
                </div>
              )}
            </Field>

            <Field label="Gallery images" hint="Add up to 8 photos shown in the carousel on your profile page.">
              {form.gallery_images.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 10 }}>
                  {form.gallery_images.map((url, idx) => (
                    <div key={idx} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', aspectRatio: '4/3' }}>
                      <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      {isPartner && (
                        <button
                          onClick={() => setField('gallery_images', form.gallery_images.filter((_, j) => j !== idx))}
                          style={{
                            position: 'absolute', top: 4, right: 4, width: 20, height: 20,
                            borderRadius: '50%', background: 'rgba(0,0,0,0.55)', color: '#fff',
                            border: 'none', cursor: 'pointer', fontSize: 12,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {isPartner && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      value={galleryInput}
                      onChange={e => setGalleryInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const t = galleryInput.trim()
                          if (t) { setField('gallery_images', [...form.gallery_images, t]); setGalleryInput('') }
                        }
                      }}
                      type="url"
                      placeholder="Paste image URL and press Enter..."
                      style={i({ flex: 1 })}
                    />
                    <button
                      onClick={() => {
                        const t = galleryInput.trim()
                        if (t) { setField('gallery_images', [...form.gallery_images, t]); setGalleryInput('') }
                      }}
                      style={{
                        padding: '9px 14px', borderRadius: 8, background: navy, color: '#fff',
                        border: 'none', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                        fontFamily: 'Nunito, sans-serif',
                      }}
                    >+ Add URL</button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: muted }}>or</span>
                    <ImageUpload
                      schoolId={schoolId}
                      onUrl={url => setField('gallery_images', [...form.gallery_images, url])}
                      disabled={!isPartner}
                    />
                  </div>
                </div>
              )}
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Instagram URL">
                <input type="url" value={form.instagram_url} onChange={e => setField('instagram_url', e.target.value)} disabled={!isPartner} placeholder="https://instagram.com/yourschool" style={i()} />
              </Field>
              <Field label="YouTube channel URL">
                <input type="url" value={form.youtube_url} onChange={e => setField('youtube_url', e.target.value)} disabled={!isPartner} placeholder="https://youtube.com/@yourschool" style={i()} />
              </Field>
            </div>

          </div>
        </Section>

        {/* 02 — School Overview */}
        <Section title="School Overview" num="02">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <Field label="School description" hint="2–4 sentences about your school's character and strengths. First thing parents read on your profile.">
              <textarea
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                disabled={!isPartner}
                rows={4}
                placeholder="Our school is known for..."
                style={{ ...i(), resize: 'vertical', lineHeight: 1.65 }}
              />
            </Field>

            <Field label="Unique selling points" hint="1–3 standout facts shown on your listing card. Keep to 150 characters.">
              <textarea
                value={form.unique_selling_points}
                onChange={e => setField('unique_selling_points', e.target.value)}
                disabled={!isPartner}
                rows={3}
                style={{ ...i(), resize: 'vertical', lineHeight: 1.65 }}
              />
              <div style={{ fontSize: 11, color: form.unique_selling_points.length > 150 ? '#c0392b' : muted, marginTop: 5, textAlign: 'right' }}>
                {form.unique_selling_points.length} / 150
              </div>
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Founded year">
                <input type="number" value={form.founded_year} onChange={e => setField('founded_year', e.target.value)} disabled={!isPartner} min="1800" max="2030" style={i()} />
              </Field>
              <Field label="School type">
                <select value={form.school_type} onChange={e => setField('school_type', e.target.value)} disabled={!isPartner} style={{ ...i(), appearance: 'auto' as const }}>
                  <option>Co-educational</option>
                  <option>All-boys</option>
                  <option>All-girls</option>
                </select>
              </Field>
              <Field label="Head of school">
                <input value={form.head_of_school} onChange={e => setField('head_of_school', e.target.value)} disabled={!isPartner} style={i()} />
              </Field>
              <Field label="School motto">
                <input value={form.school_motto} onChange={e => setField('school_motto', e.target.value)} disabled={!isPartner} placeholder="Aiming Higher" style={i()} />
              </Field>
              <Field label="Religious affiliation">
                <input value={form.religious_affiliation} onChange={e => setField('religious_affiliation', e.target.value)} disabled={!isPartner} placeholder="None / Catholic / Anglican..." style={i()} />
              </Field>
            </div>

            <Field label="Curriculum">
              <TagInput tags={form.curriculum} onChange={v => setField('curriculum', v)} placeholder="e.g. IB Diploma, A-Levels, IGCSE..." disabled={!isPartner} />
            </Field>
            <Field label="Languages of instruction">
              <TagInput tags={form.languages} onChange={v => setField('languages', v)} placeholder="e.g. English, French, Mandarin..." disabled={!isPartner} />
            </Field>
            <Field label="Accreditations">
              <TagInput tags={form.accreditations} onChange={v => setField('accreditations', v)} placeholder="e.g. CIS, WASC, BSO, NEASC..." disabled={!isPartner} />
            </Field>

          </div>
        </Section>

        {/* 03 — Key Stats */}
        <Section title="Key Stats" num="03">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Number of students">
              <input type="number" value={form.student_count} onChange={e => setField('student_count', e.target.value)} disabled={!isPartner} style={i()} />
            </Field>
            <Field label="Number of teachers">
              <input type="number" value={form.teacher_count} onChange={e => setField('teacher_count', e.target.value)} disabled={!isPartner} style={i()} />
            </Field>
            <Field label="Student-teacher ratio">
              <input value={form.student_teacher_ratio} onChange={e => setField('student_teacher_ratio', e.target.value)} disabled={!isPartner} placeholder="e.g. 10:1" style={i()} />
            </Field>
            <Field label="Typical class size">
              <input type="number" value={form.typical_class_size} onChange={e => setField('typical_class_size', e.target.value)} disabled={!isPartner} style={i()} />
            </Field>
            <Field label="Nationalities represented">
              <input type="number" value={form.nationalities_count} onChange={e => setField('nationalities_count', e.target.value)} disabled={!isPartner} style={i()} />
            </Field>
            <Field label="International student %">
              <input type="number" value={form.international_student_percent} onChange={e => setField('international_student_percent', e.target.value)} disabled={!isPartner} min="0" max="100" style={i()} />
            </Field>
            <Field label="Acceptance rate %">
              <input type="number" value={form.acceptance_rate} onChange={e => setField('acceptance_rate', e.target.value)} disabled={!isPartner} min="0" max="100" style={i()} />
            </Field>
          </div>
        </Section>

        {/* 04 — Fees & Admissions */}
        <Section title="Fees &amp; Admissions" num="04">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Annual fees USD — from">
                <input type="number" value={form.fees_usd_min} onChange={e => setField('fees_usd_min', e.target.value)} disabled={!isPartner} style={i()} />
              </Field>
              <Field label="Annual fees USD — to">
                <input type="number" value={form.fees_usd_max} onChange={e => setField('fees_usd_max', e.target.value)} disabled={!isPartner} style={i()} />
              </Field>
              <Field label="Boarding fees USD (annual)">
                <input type="number" value={form.boarding_fees_usd} onChange={e => setField('boarding_fees_usd', e.target.value)} disabled={!isPartner} placeholder="Leave blank if day-only" style={i()} />
              </Field>
              <Field label="Application fee USD">
                <input type="number" value={form.application_fee_usd} onChange={e => setField('application_fee_usd', e.target.value)} disabled={!isPartner} style={i()} />
              </Field>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderTop: `1px solid ${border}`, paddingTop: 16 }}>
              <ToggleRow label="Rolling admissions" value={form.rolling_admissions} onChange={v => setField('rolling_admissions', v)} hint="Accept applications year-round" disabled={!isPartner} />
              <ToggleRow label="Accepts mid-year entry" value={form.accepts_mid_year} onChange={v => setField('accepts_mid_year', v)} disabled={!isPartner} />
              <ToggleRow label="Entrance exam required" value={form.entrance_exam_required} onChange={v => setField('entrance_exam_required', v)} disabled={!isPartner} />
              <ToggleRow label="Visa support available" value={form.visa_support} onChange={v => setField('visa_support', v)} hint="School assists with student visa applications" disabled={!isPartner} />
            </div>

            <Field label="Admissions process" hint="Describe the steps a family takes from application to enrolment.">
              <textarea
                value={form.admissions_process}
                onChange={e => setField('admissions_process', e.target.value)}
                disabled={!isPartner}
                rows={4}
                placeholder="Applications reviewed on a rolling basis. Assessment day required for Years 7+. Decisions within 2 weeks."
                style={{ ...i(), resize: 'vertical', lineHeight: 1.65 }}
              />
            </Field>

          </div>
        </Section>

        {/* 05 — Academic Results */}
        <Section title="Academic Results" num="05">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="University placement rate %">
                <input type="number" value={form.university_placement_rate} onChange={e => setField('university_placement_rate', e.target.value)} disabled={!isPartner} min="0" max="100" style={i()} />
              </Field>
              <Field label="Oxbridge / Ivy acceptance rate %">
                <input type="number" value={form.oxbridge_rate} onChange={e => setField('oxbridge_rate', e.target.value)} disabled={!isPartner} min="0" max="100" style={i()} />
              </Field>
              <Field label="IB pass rate %">
                <input type="number" value={form.ib_pass_rate} onChange={e => setField('ib_pass_rate', e.target.value)} disabled={!isPartner} min="0" max="100" style={i()} />
              </Field>
              <Field label="AP pass rate %">
                <input type="number" value={form.ap_pass_rate} onChange={e => setField('ap_pass_rate', e.target.value)} disabled={!isPartner} placeholder="Leave blank if n/a" style={i()} />
              </Field>
              <Field label="A-Level results summary">
                <input value={form.a_level_results} onChange={e => setField('a_level_results', e.target.value)} disabled={!isPartner} placeholder="A*/A: 70%, A*–B: 90%" style={i()} />
              </Field>
              <Field label="GCSE / IGCSE results summary">
                <input value={form.gcse_results} onChange={e => setField('gcse_results', e.target.value)} disabled={!isPartner} placeholder="9–7: 68%, 9–4: 96%" style={i()} />
              </Field>
            </div>

            <Field label="Top destination universities" hint="Shown as a tag list on your profile page.">
              <TagInput tags={form.top_universities} onChange={v => setField('top_universities', v)} placeholder="e.g. UCL, Edinburgh, NYU..." disabled={!isPartner} />
            </Field>

          </div>
        </Section>

        {/* 06 — Boarding */}
        <Section title="Boarding" num="06">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <ToggleRow label="Boarding available" value={form.boarding} onChange={v => setField('boarding', v)} disabled={!isPartner} />

            {form.boarding ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="Boarding type">
                    <input value={form.boarding_type} onChange={e => setField('boarding_type', e.target.value)} disabled={!isPartner} placeholder="Full boarding / Weekly / Flexi" style={i()} />
                  </Field>
                  <Field label="Boarding capacity">
                    <input type="number" value={form.boarding_capacity} onChange={e => setField('boarding_capacity', e.target.value)} disabled={!isPartner} placeholder="Max boarding students" style={i()} />
                  </Field>
                </div>
                <ToggleRow label="Single rooms available" value={form.single_rooms} onChange={v => setField('single_rooms', v)} disabled={!isPartner} />
              </>
            ) : (
              <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: 0 }}>
                Enable boarding above to add boarding details. Day-only schools can leave this section off.
              </p>
            )}

          </div>
        </Section>

        {/* 07 — Facilities & Co-curricular */}
        <Section title="Facilities &amp; Co-curricular" num="07">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <Field label="Sports facilities">
              <TagInput tags={form.sports_facilities} onChange={v => setField('sports_facilities', v)} placeholder="e.g. Swimming pool, Tennis courts..." disabled={!isPartner} />
            </Field>
            <Field label="Arts programmes">
              <TagInput tags={form.arts_programs} onChange={v => setField('arts_programs', v)} placeholder="e.g. Theatre, Music studio, Dance..." disabled={!isPartner} />
            </Field>
            <Field label="Academic facilities">
              <TagInput tags={form.academic_facilities} onChange={v => setField('academic_facilities', v)} placeholder="e.g. Science labs, Maker space, Library..." disabled={!isPartner} />
            </Field>
            <Field label="Clubs &amp; extracurriculars">
              <TagInput tags={form.extracurriculars} onChange={v => setField('extracurriculars', v)} placeholder="e.g. Model UN, Robotics, Yearbook..." disabled={!isPartner} />
            </Field>

            <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ToggleRow label="CCF / Cadet programme" value={form.ccf} onChange={v => setField('ccf', v)} disabled={!isPartner} />
              <ToggleRow label="Duke of Edinburgh Award" value={form.duke_of_edinburgh} onChange={v => setField('duke_of_edinburgh', v)} disabled={!isPartner} />
            </div>

          </div>
        </Section>

        {/* 08 — Support & Wellbeing */}
        <Section title="Support &amp; Wellbeing" num="08">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <ToggleRow label="SEN support available" value={form.sen_support} onChange={v => setField('sen_support', v)} hint="Special Educational Needs" disabled={!isPartner} />
              {form.sen_support && (
                <Field label="SEN additional cost USD (annual, 0 if included in fees)">
                  <input type="number" value={form.sen_cost_usd} onChange={e => setField('sen_cost_usd', e.target.value)} disabled={!isPartner} style={i()} />
                </Field>
              )}
              <ToggleRow label="EAL / ESL support available" value={form.eal_support} onChange={v => setField('eal_support', v)} hint="English as an Additional Language" disabled={!isPartner} />
              {form.eal_support && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="EAL additional cost USD (annual)">
                    <input type="number" value={form.eal_cost_usd} onChange={e => setField('eal_cost_usd', e.target.value)} disabled={!isPartner} style={i()} />
                  </Field>
                  <Field label="EAL hours per week">
                    <input type="number" value={form.eal_hours_per_week} onChange={e => setField('eal_hours_per_week', e.target.value)} disabled={!isPartner} style={i()} />
                  </Field>
                </div>
              )}
            </div>

            <div style={{ borderTop: `1px solid ${border}`, paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <ToggleRow label="Scholarships available" value={form.scholarship_available} onChange={v => setField('scholarship_available', v)} disabled={!isPartner} />
              {form.scholarship_available && (
                <Field label="Scholarship details">
                  <textarea
                    value={form.scholarship_details}
                    onChange={e => setField('scholarship_details', e.target.value)}
                    disabled={!isPartner}
                    rows={3}
                    style={{ ...i(), resize: 'vertical', lineHeight: 1.65 }}
                  />
                </Field>
              )}
              <ToggleRow label="Bursaries available" value={form.bursary_available} onChange={v => setField('bursary_available', v)} hint="Means-tested financial support" disabled={!isPartner} />
              {form.bursary_available && (
                <Field label="Bursary details">
                  <textarea
                    value={form.bursary_details}
                    onChange={e => setField('bursary_details', e.target.value)}
                    disabled={!isPartner}
                    rows={3}
                    style={{ ...i(), resize: 'vertical', lineHeight: 1.65 }}
                  />
                </Field>
              )}
            </div>

            <Field label="Mental health &amp; wellbeing provision">
              <input value={form.mental_wellbeing} onChange={e => setField('mental_wellbeing', e.target.value)} disabled={!isPartner} style={i()} />
            </Field>

          </div>
        </Section>

        {/* Contact & Admin */}
        <div style={{ background: '#fff', border: `1px solid ${border}`, borderRadius: 14, padding: '26px 28px' }}>
          <div style={{ fontFamily: 'Nunito, sans-serif', fontWeight: 900, fontSize: 15, color: navy, marginBottom: 20 }}>
            Contact &amp; Admin
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Website URL">
              <input type="url" value={form.official_website} onChange={e => setField('official_website', e.target.value)} disabled={!isPartner} placeholder="https://www.yourschool.com" style={i()} />
            </Field>
            <Field label="Admissions email">
              <input type="email" value={form.contact_email} onChange={e => setField('contact_email', e.target.value)} disabled={!isPartner} placeholder="admissions@yourschool.com" style={i()} />
            </Field>
            <Field label="Phone">
              <input type="tel" value={form.contact_phone} onChange={e => setField('contact_phone', e.target.value)} disabled={!isPartner} placeholder="+66 2 123 4567" style={i()} />
            </Field>
            <Field label="Open day / visit information">
              <input value={form.open_day_text} onChange={e => setField('open_day_text', e.target.value)} disabled={!isPartner} placeholder="Open Days: 15 March, 12 April. Book via admissions@..." style={i()} />
            </Field>
          </div>
        </div>

        {/* Save */}
        {isPartner && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 8 }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '13px 36px', borderRadius: 10,
                background: saving ? border : navy,
                color: saving ? muted : '#fff',
                border: 'none', fontSize: 14, fontWeight: 800,
                cursor: saving ? 'default' : 'pointer',
                fontFamily: 'Nunito, sans-serif',
              }}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            {saved && (
              <span style={{ fontSize: 13, color: tealDk, fontWeight: 700 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ verticalAlign: 'middle', marginRight: 4 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Profile updated
              </span>
            )}
            {error && <span style={{ fontSize: 13, color: '#c0392b' }}>{error}</span>}
          </div>
        )}

      </div>
    </div>
  )
}
