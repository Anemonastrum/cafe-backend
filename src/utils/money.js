import { Prisma } from '@prisma/client';
import { AppError } from './errors.js';
export const Decimal=Prisma.Decimal.clone({precision:50,rounding:Prisma.Decimal.ROUND_HALF_UP});
export const invalidMoney=()=>{throw new AppError(422,'INVALID_MONEY','Invalid or overflowing amount');};
export const roundMoney=value=>new Decimal(value).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
export function boundedMoney(value){const n=new Decimal(value);if(!n.isFinite()||n.lt(0)||n.gt('999999999999.99'))invalidMoney();return n;}
export function money(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,11})(\.\d{1,2})?$/.test(value))invalidMoney();return boundedMoney(value);}
