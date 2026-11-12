import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell } from '../../src/utils/csv.js';
test('CSV quotes delimiters, quotes, unicode and multiline values; neutralizes formula prefixes',()=>{
 assert.equal(csvCell('café,"tea"\r\nnew'),'"café,""tea""\r\nnew"');
 for(const v of ['=HYPERLINK("bad")',' +1','-2','@SUM(A1)','\tformula',' \rhello'])assert.ok(csvCell(v).startsWith(`"'`));
 assert.equal(csvCell('18446744073709551615'),'"18446744073709551615"');assert.equal(csvCell('999999999999.99'),'"999999999999.99"');assert.equal(csvCell(null),'""');
});
