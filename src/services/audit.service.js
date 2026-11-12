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

import { auditRows,auditById } from '../models/audit.model.js';
import { requireAdmin,snapshot,paged } from './report-query.service.js';
import { AppError } from '../utils/errors.js';
// Only known domain fields survive old/raw snapshots, at every nesting level.
const auditFields=new Set(`id name username role is_active status is_held order_id order_number order_type cashier_id shift_id cash_register_id product_id category_id category_name product_name group_id option_id quantity amount grand_total subtotal item_discount_total order_discount_total tax_total service_charge_total cash_received cash_change payment_status receipt_id confirming_shift_id reason notes special_instructions opened_at closed_at created_at updated_at paid_at cancelled_at cancelled_by_user_id cancel_approved_by_user_id cancel_reason is_enabled is_archived description image_path base_price promo_price promo_starts_at promo_ends_at sort_order price_delta price min_select max_select is_required rate_percent is_inclusive calculation value is_automatic starts_at ends_at code provider cafe_name cafe_address cafe_phone receipt_footer currency timezone tax_id details items variants addons discounts taxes service_charges before after`.split(' '));
export function sanitizeAudit(value,depth=0){if(depth>20)return null;if(Array.isArray(value))return value.map(v=>sanitizeAudit(v,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>auditFields.has(k)).map(([k,v])=>[k,sanitizeAudit(v,depth+1)]));return value;}
const auditView=row=>({...row,before_data:sanitizeAudit(row.before_data),after_data:sanitizeAudit(row.after_data)});
export async function listAuditLogs(db,actor,q){requireAdmin(actor);return snapshot(db,async tx=>{const rows=await auditRows(tx,q);return paged(rows.data.map(auditView),rows.total,q);});}
export async function getAuditLog(db,actor,id){requireAdmin(actor);const row=await auditById(db,id);if(!row)throw new AppError(404,'NOT_FOUND','Audit log not found');return auditView(row);}
export async function queryAuditLogs(tx,q){const rows=await auditRows(tx,q);return paged(rows.data.map(auditView),rows.total,q);}
