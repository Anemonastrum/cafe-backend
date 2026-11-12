// Read-only managed-media verification; obtain references from recorded DB cutoff.
import assert from 'node:assert/strict';
import {lstat,readFile,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
export async function verifyMedia(source,target,references){
 assert.notEqual(await realpath(source),await realpath(target),'Media directories must be distinct');
 const result=[];
 for(const url of [...new Set(references)].sort()){
  assert.ok(typeof url==='string'&&/^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(url),'Expected managed media URL');
  const files=[source,target].map(root=>join(root,url.slice('/media/'.length)));
  for(const file of files)assert.ok((await lstat(file)).isFile(),'Expected regular file, not symlink');
  const [a,b]=await Promise.all(files.map(file=>readFile(file)));assert.deepEqual(b,a,'Media differs: '+url);
  result.push({url,bytes:a.length,sha256:createHash('sha256').update(a).digest('hex')});
 }
 return result;
}
