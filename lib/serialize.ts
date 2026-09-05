/**
 * Prisma Decimal fields and Date objects can't cross the Server->Client
 * component boundary as-is. Decimal implements toJSON() (returns a string)
 * and Date serializes to an ISO string automatically, so a JSON round-trip
 * is a simple, reliable way to hand server-fetched rows to a "use client"
 * table/chart component.
 */
// Intentionally loose return type: the whole point is converting
// Decimal/Date fields into the string/number shape a client component's
// own prop types describe, which is a different TS shape than the Prisma
// input type. Callers should type their client component props explicitly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toPlain<T>(data: T): any {
  return JSON.parse(JSON.stringify(data));
}
