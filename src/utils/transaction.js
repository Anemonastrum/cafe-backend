export async function withWriteTx(db, fn) {
  for (let attempt = 1; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 10000 }); }
    catch (error) { if (error.code !== 'P2034' || attempt === 3) throw error; }
  }
}
