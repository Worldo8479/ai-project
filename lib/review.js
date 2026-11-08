import {calculate} from '../src/core.js';
export function validateReview(input){
 if(!input||typeof input!=='object'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||!['USD','GBP','EUR','CAD','AUD'].includes(input.currency)||!Number.isInteger(input.target)||input.target<0||input.target>99||!Array.isArray(input.rows)||input.rows.length<1||input.rows.length>500)throw Error('Use a valid month, currency, target and 1–500 clients.');
 const names=new Set();const rows=input.rows.map(row=>{if(!row||typeof row.client!=='string'||!row.client.trim()||row.client.length>100)throw Error('Each client needs a name under 101 characters.');const client=row.client.trim();if(names.has(client.toLowerCase()))throw Error('Combine duplicate clients before saving.');names.add(client.toLowerCase());const clean={client,fee:row.fee,hours:row.hours,rate:row.rate,other:row.other};if([clean.fee,clean.hours,clean.rate,clean.other].some(x=>typeof x!=='number'||x>1e9))throw Error('Amounts must be numeric and below one billion.');calculate(clean,input.target);return clean;});
 return {month:input.month,currency:input.currency,target:input.target,rows};
}
export function compareReviews(current,previous){
 if(current.currency!==previous.currency)throw Error('Choose reviews in the same currency.');
 const totals=r=>r.rows.reduce((s,row)=>{const c=calculate(row,r.target);return{fee:s.fee+c.fee,profit:s.profit+c.profit,hours:s.hours+c.hours};},{fee:0,profit:0,hours:0});const now=totals(current),before=totals(previous);return {fee:now.fee-before.fee,profit:now.profit-before.profit,hours:now.hours-before.hours,margin:now.fee&&before.fee?(now.profit/now.fee-before.profit/before.fee)*100:null};
}
