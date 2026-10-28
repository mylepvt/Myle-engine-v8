/** Training hub; `?lesson=<id>` opens one lesson. */
export const TRAINING_PATH = '/dashboard/system/training'

/** "Day 3 · Prospecting", unless the title already names its day. */
export function dayCaption(day: number, title: string): string {
  return /^day\s*\d/i.test(title.trim()) ? title : `Day ${day} · ${title}`
}

