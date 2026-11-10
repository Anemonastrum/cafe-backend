import { Prisma } from '@prisma/client';
export function toWire(value) {
  if (Prisma.Decimal.isDecimal(value)) return value.toFixed(2);
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toWire(entry)]));
  }
  return value;
}
