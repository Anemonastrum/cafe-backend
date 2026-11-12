import { publishSignals } from './signals.js';
export async function withWriteTx(db, fn) {
  for (let attempt = 1; ; attempt++) {
    try { let txRef;const result=await db.$transaction(tx=>{txRef=tx;return fn(tx);}, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 });await publishSignals(txRef);return result; }
    catch (error) { if (error.code !== 'P2034' || attempt === 3) throw error; }
  }
}
