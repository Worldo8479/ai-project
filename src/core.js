export function calculate(row,target=50){
 const {fee,hours,rate,other}=row;
 if(![fee,hours,rate,other,target].every(Number.isFinite)||[fee,hours,rate,other].some(x=>x<0)||target<0||target>=100)throw Error('Use non-negative amounts and a target below 100%.');
 const cost=hours*rate+other,profit=fee-cost,margin=fee?profit/fee*100:null;
 const targetFee=cost/(1-target/100),gap=Math.max(0,targetFee-fee);
 if(![cost,profit,targetFee,gap].every(Number.isFinite))throw Error('Amounts are too large to calculate.');
 return {...row,cost,profit,margin,targetFee,gap,hourBudget:rate && other<=fee*(1-target/100)?(fee*(1-target/100)-other)/rate:null};
}
export function parseCSV(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||cell==='')quoted=!quoted;else throw Error('Unexpected quote in CSV.');}else if(c===','&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quoted)throw Error('CSV has an unclosed quote.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function importCSV(text){
 const rows=parseCSV(text.replace(/^\uFEFF/,''));const header=rows.shift()?.map(x=>x.trim().toLowerCase());const expected=['client','fee','hours','rate','other'];if(!header||header.join(',')!==expected.join(','))throw Error('Use these columns in order: client,fee,hours,rate,other');
 if(!rows.length)throw Error('Add at least one client.');if(rows.length>500)throw Error('Import up to 500 clients at a time.');const seen=new Set();return rows.map((r,i)=>{if(r.length!==5||!r[0].trim()||r[0].length>100)throw Error(`Check client name and columns on row ${i+2}.`);const client=r[0].trim();if(seen.has(client.toLowerCase()))throw Error(`Duplicate client on row ${i+2}. Combine their monthly totals first.`);seen.add(client.toLowerCase());if(r.slice(1).some(v=>!/^\d+(\.\d+)?$/.test(v.trim())))throw Error(`Use plain non-negative numbers on row ${i+2}.`);const result={client,fee:+r[1],hours:+r[2],rate:+r[3],other:+r[4]};calculate(result);return result;});
}
export function exportCSV(rows){const cell=v=>'"'+String(v).replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';return [['client','fee','hours','rate','other'],...rows.map(r=>[r.client,r.fee,r.hours,r.rate,r.other])].map(r=>r.map(cell).join(',')).join('\r\n');}
export const sample=[{client:'Northline Studio',fee:3200,hours:34,rate:45,other:80},{client:'Fieldwork Coffee',fee:1800,hours:36,rate:45,other:60},{client:'Common Ground',fee:2600,hours:22,rate:45,other:110},{client:'Good Things Co.',fee:1400,hours:19,rate:45,other:45}];
