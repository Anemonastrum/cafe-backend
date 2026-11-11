import { menuRows } from '../models/products.model.js';
import { productView } from './products.service.js';
export async function getMenu(db,actor,query){
  const result=await menuRows(db),now=new Date();
  return{categories:result.categories,products:result.products.map(row=>productView(row,now))};
}
