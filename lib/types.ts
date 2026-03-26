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

  // Location helpers
  bus_service: boolean | null

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
}
