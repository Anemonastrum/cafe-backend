import { createHash } from 'node:crypto';
function canonical(value){
 if(typeof value==='bigint')return value.toString();
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
 return value;
}
export const canonicalHash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
