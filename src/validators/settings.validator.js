import { AppError } from '../utils/errors.js';
import { parseId } from '../utils/ids.js';
const invalid = () => { throw new AppError(422, 'INVALID_SETTINGS', 'Invalid cafe settings'); };
export function settingsInput(req, res, next) {
  if (Object.keys(req.query).length) invalid();
  const body = req.body ?? {};
  const fields = ['cafe_name','cafe_address','phone','email','currency','timezone','default_tax_id','receipt_footer','receipt_paper_mm','order_prefix','cashier_can_discount','cashier_can_cancel'];
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !fields.includes(k))) invalid();
  const patch = { ...body };
  if (req.method !== 'PATCH' && Object.keys(body).length) invalid();
  if (req.method === 'PATCH' && !Object.keys(body).length) invalid();
  for (const [key,max,nullable] of [['cafe_name',180,false],['cafe_address',4000,true],['phone',50,true],['email',190,true],['receipt_footer',500,true],['order_prefix',15,false]]) {
    const value = body[key];
    if (value !== undefined && !(nullable && value === null) && (typeof value !== 'string' || (!nullable && !value.trim()) || [...value].length > max)) invalid();
  }
  if (body.email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) invalid();
  if (body.currency !== undefined && body.currency !== 'IDR') invalid();
  if (body.timezone !== undefined && body.timezone !== 'Asia/Jakarta') invalid();
  for (const key of ['cashier_can_discount','cashier_can_cancel']) if (body[key] !== undefined && typeof body[key] !== 'boolean') invalid();
  if (body.receipt_paper_mm !== undefined) { if (!['58','80'].includes(body.receipt_paper_mm)) invalid(); patch.receipt_paper_mm = `value_${body.receipt_paper_mm}`; }
  if (body.default_tax_id !== undefined && body.default_tax_id !== null) patch.default_tax_id = parseId(body.default_tax_id);
  req.input = patch; next();
}
