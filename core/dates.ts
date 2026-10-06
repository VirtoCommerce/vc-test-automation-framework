const DAYS_MS = 86_400_000;

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAYS_MS);
}
