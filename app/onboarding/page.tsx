import { redirect } from 'next/navigation'
import { isUnlocked } from '@/lib/paid-status'
import OnboardingForm from './OnboardingForm'
import './onboarding.css'

export const metadata = { title: 'Set up your profile' }

export default async function OnboardingPage() {
  const unlocked = await isUnlocked()
  if (!unlocked) redirect('/unlock')

  return (
    <div className="onboarding-shell">
      <div className="onboarding-logo">
        nana<span>says</span>
      </div>
      <div className="onboarding-card">
        <OnboardingForm />
      </div>
    </div>
  )
}
