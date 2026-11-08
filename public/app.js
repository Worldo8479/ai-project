import {calculate,importCSV,exportCSV} from './core.js';
import {validateArchive,workingArchive} from './archive.js';
import {WorkingVersion} from './working-version.js';
export function initializeApp(){
const workingVersion=new WorkingVersion();
const $=id=>document.getElementById(id);let data=[],editIndex=null,target=50;const money=v=>new Intl.NumberFormat('en',{style:'currency',currency:$('currency').value,maximumFractionDigits:0}).format(v);const pct=v=>v===null?'—':v.toFixed(1)+'%';const message=t=>$('message').textContent=t;
function render(){if($('comparison'))$('comparison').textContent='';const rows=data.map(r=>calculate(r,target));const fee=rows.reduce((s,r)=>s+r.fee,0),profit=rows.reduce((s,r)=>s+r.profit,0);$('revenue').textContent=money(fee);$('profit').textContent=money(profit);$('margin').textContent=pct(fee?profit/fee*100:null);$('risk').textContent=rows.filter(r=>r.margin===null||r.margin<target).length+' / '+rows.length;$('rows').replaceChildren();
 rows.forEach((r,index)=>{const tr=document.createElement('tr');const values=[r.client,money(r.fee),r.hours.toFixed(1),money(r.cost),money(r.profit),pct(r.margin)];values.forEach((v,i)=>{const td=document.createElement('td');td.textContent=v;if(i)td.className='number';if(i===5){td.classList.add(r.margin!==null&&r.margin>=target?'good':'bad');const bar=document.createElement('div');bar.className='margin-bar';bar.setAttribute('aria-hidden','true');const span=document.createElement('span');span.style.width=Math.max(0,Math.min(100,r.margin??0))+'%';bar.append(span);td.append(bar);}tr.append(td);});const td=document.createElement('td'),button=document.createElement('button');button.textContent='Edit';button.setAttribute('aria-label','Edit '+r.client);button.onclick=()=>openEditor(index);td.append(button);tr.append(td);$('rows').append(tr);});
 const weakest=rows.toSorted((a,b)=>b.gap-a.gap)[0];$('insight-title').textContent=!weakest?'Start with your first client.':weakest.gap>0?weakest.client+' needs a closer look.':'Your current fees meet the target.';$('insight').textContent=!weakest?'Add a client or import the template to begin.':weakest.gap>0?`At the same delivery cost, a fee of ${money(weakest.targetFee)} would reach your ${target}% target (${money(weakest.gap)} above today).${weakest.hourBudget!==null?' Or keep the fee and plan for at most '+weakest.hourBudget.toFixed(1)+' hours, with other costs unchanged.':''} These are planning scenarios, not guaranteed outcomes.`:'Keep reviewing each month as the work changes. Zero delivery cost may indicate missing time or costs.';
}
const currentDate=new Date();$('month').value=currentDate.getFullYear()+'-'+String(currentDate.getMonth()+1).padStart(2,'0');
function changed(){ $('mode').textContent='Your working review. Export your data before closing this tab.';render();}
function openEditor(index=null){editIndex=index;$('client-form').reset();$('form-error').textContent='';$('edit-title').textContent=index===null?'Add a client':'Edit client';$('remove').hidden=index===null;if(index!==null)for(const [k,v] of Object.entries(data[index]))$('client-form').elements.namedItem(k).value=v;$('editor').showModal();}
$('add').onclick=()=>openEditor();$('close').onclick=()=>$('editor').close();$('client-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const row={client:String(f.get('client')).trim(),fee:+f.get('fee'),hours:+f.get('hours'),rate:+f.get('rate'),other:+f.get('other')};try{if(!row.client)throw Error('Enter a client name.');if(data.some((r,i)=>i!==editIndex&&r.client.toLowerCase()===row.client.toLowerCase()))throw Error('That client already exists. Edit its monthly totals.');calculate(row,target);if(editIndex===null)data.push(row);else data[editIndex]=row;changed();$('editor').close();}catch(err){$('form-error').textContent=err.message;}};
$('remove').onclick=()=>{data.splice(editIndex,1);changed();$('editor').close();};$('target').onchange=()=>{const value=+$('target').value;if($('target').value===''||!Number.isInteger(value)||value<0||value>=100){message('Margin target must be between 0 and 99.');$('target').value=target;return;}target=value;message('');render();};$('currency').onchange=()=>{render();message('Currency label changed. Amounts have not been converted.');};$('blank').onclick=async()=>{if(data.length&&!await confirmAction('Clear this review? Export first to keep your work.'))return;workingVersion.reset();data=[];changed();};$('print').onclick=()=>window.print();
function download(content,name,type='text/csv;charset=utf-8'){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('export').onclick=()=>download(exportCSV(data),'retainerlens-'+$('month').value+'.csv');$('template').onclick=()=>download('client,fee,hours,rate,other\r\nExample client,2000,20,45,100\r\n','retainerlens-template.csv');$('csv').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('Choose a CSV under 1 MB.');const imported=importCSV(await file.text());if(data.length&&!await confirmAction('Replace current clients with the imported review? Export first to keep your work.'))return;data=imported;changed();message(`Imported ${data.length} clients. Check currency and report month.`);}catch(err){message(err.message);}finally{e.target.value='';}};render();

let savedReviews=[],trashedReviews=[];
const snapshot=()=>({month:$('month').value,currency:$('currency').value,target,rows:structuredClone(data)});
async function refreshHistory(){const response=await fetch('/api/reviews');if(response.status===401)return;const result=await response.json();if(!response.ok)throw Error(result.error);savedReviews=result.reviews;trashedReviews=result.trash??[];$('trash-review').replaceChildren(new Option('Choose a review',''));trashedReviews.forEach((r,i)=>$('trash-review').add(new Option(r.month+' · '+r.currency,String(i))));for(const id of ['saved-review','compare-review']){const select=$(id);select.replaceChildren(new Option('Choose a saved month',''));savedReviews.forEach((r,i)=>select.add(new Option(r.month+' · '+r.currency,String(i))));}}
async function initAccount(){try{
 const response=await fetch('/api/account');if(!response.ok)throw Error('Account unavailable');const account=await response.json();
 if(!account.signedIn){window.location.assign('/signin-with-chatgpt?return_to=%2Fapp');return;}
 $('account-name').textContent=account.name||'Your account';$('account-status').textContent='Signed in. Your saved reviews are private to this account.';
 await refreshHistory();
 if(savedReviews.length&&data.length===0){const r=savedReviews[0];workingVersion.load(r);data=structuredClone(r.rows);$('month').value=r.month;$('currency').value=r.currency;target=r.target;$('target').value=target;$('saved-review').value='0';render();$('mode').textContent='Loaded your latest saved review. Save month after editing.';}
 else if(!savedReviews.length){$('account-status').textContent='Your account is ready. Add your first client or import a review to get started.';}
}catch{$('account-status').textContent='Your account could not load. Refresh before saving; export any unsaved work.';}}
$('save-review').onclick=async()=>{
 $('save-review').disabled=true;
 try{
  const input=snapshot(),generation=workingVersion.generation;
  const {validateReview}=await import('./review.js');validateReview(input);
  const expectedRevision=workingVersion.expected(input);
  const existing=savedReviews.find(r=>r.month===input.month&&r.currency===input.currency);
  if(existing&&expectedRevision===null)throw Error('A saved review already exists for this month and currency. Load it before editing, or choose a different month.');
  if(expectedRevision!==null&&!await confirmAction('Save your edits to '+input.month+' '+input.currency+'? A newer account version will never be overwritten.'))return;
  const response=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,expectedRevision})});
  const result=await response.json();if(!response.ok)throw Error(result.error);
  workingVersion.saved(input,result.revision,generation,snapshot());
  try{await refreshHistory();message('Saved '+input.month+' to your account.');}
  catch{message('Saved '+input.month+'. History could not refresh; your save succeeded.');}
 }catch(e){message(e.message);}finally{$('save-review').disabled=false;}
};
$('load-review').onclick=async()=>{const value=$('saved-review').value;if(value===''){message('Choose a saved review first.');return;}if(!await confirmAction('Load this saved month and replace the current working review? Export first to keep unsaved edits.'))return;const r=savedReviews[+value];workingVersion.load(r);data=structuredClone(r.rows);$('month').value=r.month;$('currency').value=r.currency;target=r.target;$('target').value=target;changed();$('mode').textContent='Loaded saved review for '+r.month+'. Save again after editing.';$('comparison').textContent='';message('Saved month loaded.');};
$('compare-review').onchange=async()=>{const value=$('compare-review').value;if(value===''){$('comparison').textContent='';return;}try{const {compareReviews}=await import('./review.js');const previous=savedReviews[+value],delta=compareReviews(snapshot(),previous);$('comparison').textContent='Compared with '+previous.month+': fees '+money(delta.fee)+', delivery profit '+money(delta.profit)+', hours '+delta.hours.toFixed(1)+(delta.margin===null?'':', margin '+delta.margin.toFixed(1)+' percentage points')+'.';}catch(e){$('comparison').textContent=e.message;}};
initAccount();

$('refresh-reviews').onclick=async()=>{try{await refreshHistory();message('Saved reviews refreshed. Your working review is unchanged.');}catch(e){message(e.message);}};
async function changeSavedReview(method,selectId,collection){const selected=$(selectId).value;if(selected===''){message('Choose a saved review first.');return;}const review=collection[+selected];if(method==='DELETE'&&!await confirmAction('Move '+review.month+' '+review.currency+' to Trash? You can restore it later.'))return;try{const response=await fetch('/api/reviews',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify({month:review.month,currency:review.currency,expectedRevision:review.revision})});const result=await response.json();if(!response.ok)throw Error(result.error);await refreshHistory();message(method==='DELETE'?'Review moved to Trash. Your working copy is unchanged.':'Review restored.');}catch(e){message(e.message);}}
$('delete-review').onclick=()=>changeSavedReview('DELETE','saved-review',savedReviews);
$('restore-review').onclick=()=>changeSavedReview('PUT','trash-review',trashedReviews);

let archiveReviews=[];
$('export-working').onclick=()=>{try{
 const review=snapshot();download(JSON.stringify(workingArchive(review,workingVersion.expected(review)),null,2),
  'retainerlens-'+review.month+'-'+review.currency+'.retainerlens','application/json');
 message('Exported this working review with its month, currency, target and saved version.');
}catch(e){message(e.message);}};
function archivePreview(){const r=archiveReviews[+$('archive-review').value];if(!r)return;
 const totals=r.rows.reduce((sum,row)=>{const result=calculate(row,r.target);return{fee:sum.fee+row.fee,profit:sum.profit+result.profit};},{fee:0,profit:0});
 const format=value=>new Intl.NumberFormat('en',{style:'currency',currency:r.currency,maximumFractionDigits:0}).format(value);
 $('archive-summary').textContent=r.rows.length+' clients · Fees '+format(totals.fee)+' · Delivery profit '+format(totals.profit)+' · Target '+r.target+'%'+(r.deletedAt?' · From archive Trash':'');
}
$('archive-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;
 try{if(file.size>25000000)throw Error('Choose an archive under 25 MB.');const archive=validateArchive(JSON.parse(await file.text()));
  archiveReviews=[...archive.reviews,...archive.trash];if(!archiveReviews.length)throw Error('This archive has no reviews to load.');
  $('archive-review').replaceChildren();archiveReviews.forEach((r,i)=>$('archive-review').add(new Option(r.month+' · '+r.currency+(r.deletedAt?' · Trash':''),String(i))));
  archivePreview();$('archive-dialog').showModal();$('archive-cancel').focus();
 }catch(e){message(e instanceof SyntaxError?'This file is not a valid JSON review archive.':e.message);}finally{e.target.value='';}
};
$('archive-review').onchange=archivePreview;
$('archive-cancel').onclick=()=>$('archive-dialog').close();
$('archive-load').onclick=async()=>{
 const r=archiveReviews[+$('archive-review').value];if(!r)return;$('archive-dialog').close();
 if(data.length&&!await confirmAction('Load '+r.month+' '+r.currency+' from this archive and replace your working review? Export first to keep unsaved edits. Your account will not change until you save.'))return;
 const exists=[...savedReviews,...trashedReviews].some(x=>x.month===r.month&&x.currency===r.currency);
 workingVersion.load(r,exists?r.revision:null);
 data=structuredClone(r.rows);$('month').value=r.month;$('currency').value=r.currency;target=r.target;$('target').value=target;
 changed();$('mode').textContent='Loaded from a local archive. Save month to update your account.';
 message('Archive review loaded. Other archived reviews and your account are unchanged.');
};

function confirmAction(text){return new Promise(resolve=>{const dialog=$('confirmation');$('confirmation-message').textContent=text;const finish=value=>{dialog.close();resolve(value);};$('confirmation-cancel').onclick=()=>finish(false);$('confirmation-accept').onclick=()=>finish(true);dialog.oncancel=event=>{event.preventDefault();finish(false);};dialog.showModal();$('confirmation-cancel').focus();});}

}
