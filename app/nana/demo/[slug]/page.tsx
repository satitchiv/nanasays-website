import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getDemoQuestions } from '@/lib/demo-questions'
import type { DemoAnswerFile } from '@/lib/demo-questions'
import NanaDemoClient from './NanaDemoClient'
import type { Metadata } from 'next'
import fs from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const { data: school } = await supabase
    .from('schools').select('name').eq('slug', slug).maybeSingle()
  const name = school?.name ?? 'School'
  return {
    title: `Try Nana — ${name} | Nanasays`,
    description: `See how Nana answers real parent questions about ${name}. Free demo — no login required.`,
    robots: { index: false, follow: false },
  }
}

function loadDemoAnswers(slug: string): DemoAnswerFile | null {
  try {
    const filePath = path.join(process.cwd(), 'data', 'demo-answers', `${slug}.json`)
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw) as DemoAnswerFile
  } catch {
    return null
  }
}

export default async function NanoDemoPage({ params }: Props) {
  const { slug } = await params
  const questions = getDemoQuestions(slug)
  if (!questions.length) notFound()

  const { data: school } = await supabase
    .from('schools').select('name, hero_image').eq('slug', slug).maybeSingle()
  if (!school) notFound()

  const demoFile = loadDemoAnswers(slug)

  return (
    <NanaDemoClient
      slug={slug}
      schoolName={school.name ?? slug}
      heroImage={school.hero_image ?? null}
      questions={questions}
      demoAnswers={demoFile?.answers ?? {}}
    />
  )
}
