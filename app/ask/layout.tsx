import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Ask Nana — AI School Advisor | NanaSays',
  description: 'Ask Nana anything about international schools. Get instant recommendations matched to your budget, curriculum preference, and location — free, no sign-up needed.',
  robots: { index: false, follow: false },
}

export default function AskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
