import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pdfText } from '../../src/integrations/pdf.js';
import { escapeHtml } from '../../src/helpers/receipt.helper.js';
test('receipt formatting escapes HTML and marks unsupported PDF glyphs',()=>{
 assert.equal(escapeHtml('<script>"&\''),'&lt;script&gt;&quot;&amp;&#39;');
 assert.equal(pdfText('Café Tiếng Việt\n茶 😀\u0000'),'Café Tiếng Việt\n[U+8336] [U+1F600]');
});
