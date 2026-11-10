export async function lockCafe(tx) {
  const rows = await tx.$queryRaw`SELECT * FROM cafe_settings WHERE id = 1 FOR UPDATE`;
  if (!rows[0]) throw new Error('Cafe settings missing');
  return rows[0];
}
