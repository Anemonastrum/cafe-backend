import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateSelections } from '../../src/services/selection.service.js';
const option=(id,price_delta='0',is_enabled=true)=>({id:BigInt(id),name:'Option',price_delta,is_enabled});
const product={base_price:'100.00',variant_groups:[{id:1n,name:'Size',is_required:true,options:[option(1,'-10'),option(2),option(3,'0',false)]},{id:2n,name:'Extra',is_required:false,options:[option(4,'-95')]}]};
test('variant selection enforces ownership, cardinality, availability and nonnegative sale unit',()=>{
 for(const ids of [[],['99'],['1','2'],['1','1'],['3'],['1','4'],[0],[1.5]])assert.throws(()=>validateSelections(product,{variant_option_ids:ids,addons:[]}));
 const result=validateSelections(product,{variant_option_ids:['1'],addons:[]});
 assert.equal(result.variants[0].variant_option_id,1n);assert.equal(result.variants[0].option_name,'Option');assert.equal(result.variant_unit_total.toFixed(2),'-10.00');
 assert.equal(validateSelections({...product,base_price:'10'},{variant_option_ids:[1]}).variant_unit_total.toFixed(2),'-10.00');
 assert.throws(()=>validateSelections({...product,promo_price:'5',promo_active:true},{variant_option_ids:[1]}));
 assert.equal(validateSelections({...product,promo_price:'5',promo_active:false},{variant_option_ids:[1]}).variants.length,1);
});
test('addon quantity sums enforce min/max, ownership, duplicates and enabled options',()=>{
 const p={base_price:'100',addon_groups:[{id:5n,name:'Extras',min_select:2,max_select:3,options:[{id:10n,name:'Milk',price:'2.50',is_enabled:true},{id:11n,name:'Sugar',price:'0',is_enabled:true},{id:12n,name:'Hidden',price:'1',is_enabled:false}]}]};
 for(const addons of [[],[{addon_option_id:10,quantity:0}],[{addon_option_id:10,quantity:4}],[{addon_option_id:10,quantity:1}],[{addon_option_id:10,quantity:1},{addon_option_id:10,quantity:1}],[{addon_option_id:99,quantity:2}],[{addon_option_id:12,quantity:2}],[{addon_option_id:10,quantity:1.5}],[{addon_option_id:10,quantity:2,price:'0'}]])assert.throws(()=>validateSelections(p,{addons}));
 const result=validateSelections(p,{addons:[{addon_option_id:10,quantity:2},{addon_option_id:11,quantity:1}]});
 assert.equal(result.addons[0].quantity,2);assert.equal(result.addons[0].addon_option_id,10n);assert.equal(result.addon_unit_total.toFixed(2),'5.00');
 assert.equal(validateSelections(p,{addons:[{addon_option_id:10,quantity:3}]}).addon_unit_total.toFixed(2),'7.50');
 assert.throws(()=>validateSelections(p,{addons:'bad'}));
});
