import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { TrainingDayView } from '@/components/training/TrainingDayView'

vi.mock('@/hooks/use-training-query', () => ({
  useMarkTrainingDayMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
  }),
  useUploadTrainingNotesMutation: () => ({
    mutateAsync: vi.fn(),
  }),
}))

describe('TrainingDayView', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows a friendly fallback when the audio file fails to load', () => {
    const { container } = render(
      <TrainingDayView
        video={{
          day_number: 7,
          title: 'Day 7 - Certification Prep',
          has_video: false,
          audio_url: '/uploads/training_audio/day_7.mp3',
          unlocked: true,
        }}
        completed={false}
        hasNotes={false}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        canBypassTrainingLocks={false}
      />,
    )

    const audio = container.querySelector('audio')
    expect(audio).not.toBeNull()
    fireEvent.error(audio as HTMLAudioElement)

    expect(
      screen.getByText(
        'Audio link exists, but this file is not loading right now. Training can continue while admin replaces the audio file.',
      ),
    ).toBeInTheDocument()
  })
})
