export interface School {
  id: string
  slug: string
  name: string
  country: string | null
  city: string | null
  region: string | null
  address: string | null

  // Fees
  fees_usd_min: number | null
  fees_usd_max: number | null
  fees_currency: string | null
  fees_original: string | null
  fees_local_min: number | null
  fees_local_max: number | null
  fees_local_currency: string | null
  boarding_fees_usd: number | null
  fees_includes_boarding: boolean | null
  application_fee_usd: number | null
  admission_deposit_usd: number | null
  fees_by_grade: Record<string, unknown> | null

  // School info
  school_type: string | null
  founded_year: number | null
  student_count: number | null
  teacher_count: number | null
  student_teacher_ratio: string | null
  campus_size_hectares: number | null
  governance: string | null

  // Academic
  curriculum: string[] | null
  age_min: number | null
  age_max: number | null
  grade_min: string | null
  grade_max: string | null
  languages: string[] | null
  university_placement_rate: number | null
  top_universities: string[] | null
  ap_pass_rate: number | null
  ib_pass_rate: number | null
  curriculum_results: Record<string, unknown> | null
  stages: string[] | null

  // Boarding
  boarding: boolean | null
  boarding_capacity: number | null
  single_rooms: boolean | null
  boarding_facilities: string | null
  boarding_arrangements: string | null

  // Diversity
  nationalities_count: number | null
  international_student_percent: number | null
  thai_students: number | null
  gender_split: string | null

  // Admissions
  admissions_open_month: string | null
  rolling_admissions: boolean | null
  application_deadline: string | null
  entrance_exam_required: boolean | null
  admissions_process: string | null
  waitlist: string | null

  // Scholarships
  scholarship_available: boolean | null
  scholarship_details: string | null
  scholarship_total_usd: string | null

  // Facilities & programs
  sports_facilities: string[] | null
  academic_facilities: string[] | null
  arts_programs: string[] | null
  extracurriculars: string[] | null
  clubs: string[] | null

  // Contact
  official_website: string | null
  virtual_tour_url: string | null
  head_of_school: string | null
  contact_email: string | null
  contact_phone: string | null

  // Quality & reviews
  accreditations: string[] | null
  review_score: number | null
  review_count: number | null
  awards: string[] | null
  strengths: string[] | null

  // Support
  sen_support: boolean | null
  sen_cost_usd: number | null
  eal_support: boolean | null
  eal_cost_usd: number | null
  sel_support: boolean | null
  mental_wellbeing: string | null
  safeguarding: string | null
  visa_support: boolean | null

  // Content
  description: string | null
  unique_selling_points: string | null
  uniform_requirement: string | null
  religious_affiliation: string | null
  country_affiliation: string | null
  school_day_structure: string | null
  food_options: string | null
  house_system: string | null
  hero_image: string | null
  logo_url: string | null
  gallery_images: string[] | null
  images_crawled_at: string | null
  distance_city: string | null
  distance_airport: string | null
  open_day_text: string | null
  open_day_url: string | null
  prospectus_url: string | null

  // Location helpers
  bus_service: boolean | null
  nearest_airport: string | null
  flight_hours_from_bkk: number | null

  // Academic extras
  acceptance_rate: number | null
  sat_avg: number | null
  act_avg: number | null
  typical_class_size: number | null
  ib_authorized_year: number | null
  inspection_rating: string | null
  inspection_body: string | null
  pastoral_care_rating: string | null

  // ISI Inspection (UK schools)
  isi_report_url: string | null
  isi_report_date: string | null
  isi_report_type: string | null
  isi_report_text: string | null
  isi_standards_met: boolean | null
  isi_summary: string | null
  isi_boarding_quality: string | null
  isi_pastoral_care: string | null
  isi_academic_quality: string | null
  isi_key_strengths: string[] | null
  isi_areas_for_improvement: string[] | null

  // Boarding extras
  boarding_type: string | null

  // Admissions extras
  entry_exam_type: string | null

  // Fees extras
  sibling_discount: boolean | null

  // Support extras
  eal_hours_per_week: number | null

  // Student life extras
  sports_excellence_programmes: string[] | null
  alumni_notable: string | null
  thai_community: string | null
  house_names: string[] | null

  // Student opportunities
  ccf: boolean | null               // Combined Cadet Force programme
  duke_of_edinburgh: boolean | null // Duke of Edinburgh Award

  // School character
  school_motto: string | null

  // Bursaries (means-tested financial aid, separate from merit scholarships)
  bursary_available: boolean | null
  bursary_details: string | null

  // Academic performance extras (UK schools)
  a_level_results: string | null       // e.g. "82% A*–B grades"
  a_level_results_pct: number | null   // numeric companion for future filtering
  gcse_results: string | null          // e.g. "91% grades 9–4"
  gcse_results_pct: number | null      // numeric companion for future filtering
  oxbridge_rate: number | null         // % accepted to Oxford/Cambridge (numeric for decimals)
  russell_group_rate: number | null    // % accepted to Russell Group (numeric for decimals)

  accepts_mid_year: boolean | null

  // Data provenance
  wikipedia_last_scraped: string | null

  // Media
  school_video_url: string | null
  instagram_url: string | null
  youtube_url: string | null

  // Partner
  is_partner: boolean | null
  partner_tier: string | null
  partner_since: string | null
  partner_expires: string | null
  admin_email: string | null
  claimed_at: string | null

  // Meta
  source: string | null
  confidence_score: number | null
  verified_at: string | null
  last_crawled_at: string | null
  created_at: string | null
}

export interface SchoolSummary {
  id: string
  slug: string
  name: string
  country: string | null
  city: string | null
  region: string | null
  school_type: string | null
  curriculum: string[] | null
  fees_usd_min: number | null
  fees_usd_max: number | null
  boarding: boolean | null
  university_placement_rate: number | null
  hero_image: string | null
  logo_url: string | null
  review_score: number | null
  verified_at: string | null
  is_partner: boolean | null
  partner_tier: string | null
}

export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  category: 'thai' | 'guide' | 'picks' | 'visa' | 'scholar'
  readTime: number
  author: string
  publishedAt: string
  image?: string
}

export interface Region {
  id: string
  name: string
  countries: CountrySummary[]
}

export interface CountrySummary {
  name: string
  code: string
  flag: string
  schoolCount: number
  featured?: boolean
  nanaNote?: string
}

export interface SchoolListItem {
  id: string
  slug: string
  name: string
  country: string | null
  city: string | null
  school_type: string | null
  curriculum: string[] | null
  fees_usd_min: number | null
  fees_usd_max: number | null
  fees_original: string | null
  fees_currency: string | null
  age_min: number | null
  age_max: number | null
  boarding: boolean | null
  hero_image: string | null
  thai_students: number | null
  unique_selling_points: string | null
  strengths: string[] | null
  scholarship_available: boolean | null
  nationalities_count: number | null
  international_student_percent: number | null
  confidence_score: number | null
  latitude: number | null
  longitude: number | null
  sen_support: boolean | null
  eal_support: boolean | null
  is_partner: boolean | null
  partner_tier: string | null
}
