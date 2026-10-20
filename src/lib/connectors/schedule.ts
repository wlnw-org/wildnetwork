/** Whether a rate-limited connector is due. After an error it backs off to four times the interval. */
export function isDue(minutes: number | undefined, lastRunAt: Date | null, lastError: string | null, now = new Date()): boolean {
  if (!minutes || !lastRunAt) return true;
  return now.getTime() - lastRunAt.getTime() >= minutes * (lastError ? 4 : 1) * 60_000;
}
