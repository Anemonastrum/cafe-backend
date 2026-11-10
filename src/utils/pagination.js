import { AppError } from './errors.js';
export function parsePage(query, allowedSort) {
  const invalid = () => { throw new AppError(422, 'INVALID_PAGINATION', 'Invalid pagination or sorting'); };
  const integer = (value, fallback) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) invalid();
    const number = Number(value);
    if (!Number.isSafeInteger(number)) invalid();
    return number;
  };
  const page = integer(query.page, 1), limit = integer(query.limit, 20);
  const skip = (page - 1) * limit;
  const sort = query.sort_by ?? 'id', direction = query.sort_order ?? 'asc';
  if (limit > 100 || !Number.isSafeInteger(skip) || !['asc', 'desc'].includes(direction)
      || (sort !== 'id' && !allowedSort.includes(sort))) invalid();
  return { page, limit, skip, orderBy: sort === 'id' ? [{ id: direction }] : [{ [sort]: direction }, { id: direction }] };
}
