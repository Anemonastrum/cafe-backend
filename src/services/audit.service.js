import { insertAudit } from '../models/audit.model.js';
import { toWire } from '../utils/serialize.js';
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/password|secret|token|cookie|authorization/i.test(key)).map(([k, v]) => [k, sanitize(v)]));
  return value;
}
export function appendAudit(tx, { actor, action, entityType, entityId, before, after, context = {} }) {
  return insertAudit(tx, { user_id: actor?.id ?? null, action, entity_type: entityType,
    entity_id: entityId == null ? null : String(entityId), ip_address: context.ip ?? null,
    ...(before == null ? {} : { before_data: sanitize(toWire(before)) }),
    ...(after == null ? {} : { after_data: sanitize(toWire(after)) }) });
}
