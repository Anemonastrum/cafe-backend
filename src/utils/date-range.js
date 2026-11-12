import { AppError } from './errors.js';
const day=86400000,offset=7*3600000;
const invalid=()=>{throw new AppError(422,'INVALID_RANGE','Expected timezone-bearing timestamps, ascending range up to 366 days');};
export function parseRange(query,now=new Date()){
 const today=new Date(Math.floor((now.getTime()+offset)/day)*day-offset);
 const parse=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(v))invalid();const calendar=new Date(v.slice(0,19)+'Z'),d=new Date(v);if(!Number.isFinite(d.getTime())||!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,19)!==v.slice(0,19)||d.getUTCFullYear()<1000||d.getUTCFullYear()>9999)invalid();return d;};
 if(query.timezone!==undefined&&query.timezone!=='Asia/Jakarta')invalid();
 const from=query.from===undefined?today:parse(query.from),to=query.to===undefined?new Date(today.getTime()+day):parse(query.to);
 if(to<=from||to-from>366*day)invalid();return{from,to};
}
export function bucketStart(date,group='day'){const d=new Date(date.getTime()+offset);d.setUTCHours(0,0,0,0);if(group==='week')d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);if(group==='month')d.setUTCDate(1);return new Date(d.getTime()-offset);}
export function nextBucket(date,group){const d=new Date(date.getTime()+offset);if(group==='month')d.setUTCMonth(d.getUTCMonth()+1);else d.setUTCDate(d.getUTCDate()+(group==='week'?7:1));return new Date(d.getTime()-offset);}
