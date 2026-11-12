import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,writeFile,mkdir,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {verifyMedia} from '../../ops/verify-media.mjs';
test('restore media compares referenced bytes and rejects missing, changed or unsafe files',async()=>{
 const root=await mkdtemp(join(tmpdir(),'cafe-restore-media-')),a=join(root,'a'),b=join(root,'b'),name='12345678-1234-1234-1234-123456789abc.webp',url='/media/'+name;
 try{await mkdir(a);await mkdir(b);await writeFile(join(a,name),'source');await writeFile(join(b,name),'source');
 assert.equal((await verifyMedia(a,b,[url,url])).length,1);
 await writeFile(join(b,name),'changed');await assert.rejects(verifyMedia(a,b,[url]),/Media differs/);
 await rm(join(b,name));await assert.rejects(verifyMedia(a,b,[url]));
 await symlink(join(a,name),join(b,name));await assert.rejects(verifyMedia(a,b,[url]),/regular file/);
 for(const unsafe of ['/media/../secret','https://example.com/x','/media/%2e%2e'])await assert.rejects(verifyMedia(a,b,[unsafe]),/managed media/);
 await assert.rejects(verifyMedia(a,a,[url]),/distinct/);
 }finally{await rm(root,{recursive:true,force:true});}
});
