'use client';

import { OnboardingBanner } from '@/components/onboarding-banner';

type PainelWrapperProps = {
  userId: string;
  role?: string;
};

export function PainelWrapper({ userId, role = 'advertiser' }: PainelWrapperProps) {
  return <OnboardingBanner userId={userId} role={role} />;
}
