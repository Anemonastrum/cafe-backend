import { AppError } from '../utils/errors.js';
export async function nextOrderNumber(tx){
 const settings=await tx.cafe_settings.findUnique({where:{id:1}}),counter=settings.next_order_number;
 if(counter>=18446744073709551615n)throw new AppError(409,'ORDER_NUMBER_EXHAUSTED','Order number exhausted');
 await tx.cafe_settings.update({where:{id:1},data:{next_order_number:counter+1n}});
 return `${settings.order_prefix}-${counter.toString().padStart(8,'0')}`;
}
