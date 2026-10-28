import { extractYouTubeId } from '@/lib/youtube'

/** Training hub; `?lesson=<id>` opens one lesson. */
export const TRAINING_PATH = '/dashboard/system/training'

/** YouTube thumbnail for a video link, or null when it isn't a YouTube URL. */
export function thumbFor(url: string | null | undefined): string | null {
  const id = url ? extractYouTubeId(url) : null
  return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null
}

/** "Day 3 · Prospecting", unless the title already names its day. */
export function dayCaption(day: number, title: string): string {
  return /^day\s*\d/i.test(title.trim()) ? title : `Day ${day} · ${title}`
}
