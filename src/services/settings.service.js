import { AppError } from '../utils/errors.js';
import { withWriteTx } from '../utils/transaction.js';
import { lockedActor } from './auth.service.js';
import { appendAudit } from './audit.service.js';
import { saveImage, removeManagedImage } from './media.service.js';
import * as model from '../models/settings.model.js';
const fields = ['id','cafe_name','cafe_address','phone','email','logo_url','currency','timezone','receipt_footer','receipt_paper_mm'];
const adminFields = [...fields,'default_tax_id','order_prefix','next_order_number','cashier_can_discount','cashier_can_cancel','created_at','updated_at'];
const project = (row, safe) => Object.fromEntries((safe ? fields : adminFields).map(k => [k, k === 'receipt_paper_mm' ? row[k].replace('value_', '') : row[k]]));
const admin = actor => { if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'Forbidden'); };
export async function getSettings(db, actor, { safe }) {
  if (!safe) admin(actor);
  return project(await model.readSettings(db), safe);
}
async function update(db, actor, patch, context) {
  admin(actor);
  return withWriteTx(db, async tx => {
    const { user } = await lockedActor(tx, actor); admin(user);
    const before = await model.readSettings(tx);
    if (patch.default_tax_id != null && !(await model.readTax(tx, patch.default_tax_id))?.is_active) throw new AppError(422, 'INVALID_TAX', 'Default tax must be active');
    const after = await model.writeSettings(tx, patch);
    await appendAudit(tx, { actor: user, action: 'settings.update', entityType: 'cafe_settings', entityId: 1, before: project(before,false), after: project(after,false), context });
    return { before, after };
  });
}
export async function updateSettings(db, actor, patch, context) { return project((await update(db,actor,patch,context)).after, false); }
async function cleanup(url, storageDir) {
  if (!url) return;
  try { await removeManagedImage(url, storageDir); }
  catch { console.error(JSON.stringify({ event: 'media_cleanup_required', url })); }
}
export async function replaceLogo(db, actor, file, context, storageDir) {
  admin(actor);
  const image = file ? await saveImage({ buffer: file.buffer, mime: file.mimetype, storageDir }) : null;
  let result;
  try { result = await update(db, actor, { logo_url: image?.url ?? null }, context); }
  catch (error) { if (image) await cleanup(image.url, storageDir); throw error; }
  await cleanup(result.before.logo_url, storageDir);
  return project(result.after, false);
}
