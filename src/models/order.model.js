import { optionInclude,visibleProduct } from './products.model.js';
export const settingsForPricing=tx=>tx.cafe_settings.findUnique({where:{id:1}});
export const productForPricing=(tx,id)=>tx.products.findFirst({where:{id,...visibleProduct},include:{...optionInclude,fk_products_category:true}});
export const taxForPricing=(tx,id)=>id==null?null:tx.taxes.findUnique({where:{id}});
export const discountForPricing=(tx,id)=>tx.discounts.findUnique({where:{id}});
export const autoCharges=tx=>tx.service_charges.findMany({where:{is_active:true,is_auto_applied:true},orderBy:{id:'asc'}});
