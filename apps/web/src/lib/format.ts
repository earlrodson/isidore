/** Rounds to 1 decimal place and drops a trailing ".0" (`5` not `5.0`, `5.5` stays `5.5`). */
export function formatHours(hours: number): string {
  return (Math.round(hours * 10) / 10).toString();
}

export function formatDrift(hours: number): string {
  const formatted = formatHours(hours);
  return hours > 0 ? `+${formatted}` : formatted;
}
