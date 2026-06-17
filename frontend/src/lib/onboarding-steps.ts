import type { OnboardingStep } from '@/components/onboarding/OnboardingTour'

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Myle!',
    description:
      'This quick tour will show you around the dashboard so you can start your journey. Let\'s go step by step.',
    icon: '👋',
  },
  {
    id: 'dashboard',
    title: 'Your Dashboard',
    description:
      'This is your command center. Track your daily stats — calls made, leads in pipeline, payments collected, and your current rank.',
    selector: '[data-tour="dashboard"]',
    placement: 'bottom',
    icon: '📊',
  },
  {
    id: 'daily-report',
    title: 'Daily Report',
    description:
      'Submit your daily report here. Every day, log your activity so your record stays up to date. A green check means today is done!',
    selector: '[data-tour="daily-report"]',
    placement: 'bottom',
    icon: '📋',
  },
  {
    id: 'work',
    title: 'Work Section',
    description:
      'Manage your leads and calls here. Claim new leads, log calls, and track your progress through the pipeline stages.',
    selector: '[data-tour="work"]',
    placement: 'right',
    icon: '💼',
  },
  {
    id: 'wallet',
    title: 'Wallet & Earnings',
    description:
      'Track your earnings, request withdrawals, and recharge your wallet. All your financial activity in one place.',
    selector: '[data-tour="wallet"]',
    placement: 'right',
    icon: '💰',
  },
  {
    id: 'intelligence',
    title: 'Intelligence',
    description:
      'View your performance analytics, trends over time, and insights to help you improve. Data-driven growth starts here.',
    selector: '[data-tour="intelligence"]',
    placement: 'right',
    icon: '📈',
  },
  {
    id: 'team',
    title: 'Team (for Leaders)',
    description:
      'If you are a leader, track your team members, their performance, and manage your downline from this section.',
    selector: '[data-tour="team"]',
    placement: 'right',
    icon: '👥',
  },
  {
    id: 'profile',
    title: 'Your Profile',
    description:
      'Manage your account settings, notification preferences, and view your training certificate here.',
    selector: '[data-tour="profile"]',
    placement: 'right',
    icon: '⚙️',
  },
  {
    id: 'done',
    title: 'You\'re All Set!',
    description:
      'You now know the key parts of Myle. Start exploring, submit your reports, and keep growing. Good luck!',
    icon: '🎉',
  },
]
