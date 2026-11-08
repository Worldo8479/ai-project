import {readPreferences} from './account-service.js';
import {validateReview} from './review.js';
const json=(body,status=200,headers={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});
const keyValid=x=>typeof x?.month==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(x.month)&&['USD','GBP','EUR','CAD','AUD'].includes(x.currency);
async function body(request){const reader=request.body?.getReader();if(!reader)throw Error('Missing request body.');const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>250000){await reader.cancel();throw Error('Review exceeds the 250 KB limit.');}chunks.push(value);}const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return JSON.parse(new TextDecoder().decode(bytes));}
export async function handleReviewRequest(request,userId,db,{authorizeSave=async(_userId)=>({allowed:true})}={}){
 if(!userId)return json({error:'Sign in to use saved reviews.'},401);
 const method=request.method;
 if(!['GET','POST','DELETE','PUT'].includes(method))return json({error:'Method not supported.'},405);
 if(method!=='GET'){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'This request must come from this site.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Send a JSON request.'},415);
 }
 try{
  if(method==='GET'){
   const {results}=await db.prepare('SELECT month,currency,target,data,updated_at,revision,deleted_at FROM reviews WHERE user_id = ? ORDER BY month DESC,currency').bind(userId).all();
   const records=results.map(r=>({month:r.month,currency:r.currency,target:r.target,rows:JSON.parse(r.data),updatedAt:r.updated_at,revision:r.revision,deletedAt:r.deleted_at}));
   const result={reviews:records.filter(r=>!r.deletedAt),trash:records.filter(r=>r.deletedAt)};
   if(new URL(request.url).searchParams.get('format')==='export')return json({format:'retainerlens-account-v1',exportedAt:new Date().toISOString(),preferences:await readPreferences(db,userId),...result},200,{'Content-Disposition':'attachment; filename="retainerlens-account.json"'});
   return json(result);
  }
  let input,review;
  try{input=await body(request);if(method==='POST')review=validateReview(input);else if(!keyValid(input))throw Error('Choose a valid saved review.');if(input.expectedRevision!==null&&typeof input.expectedRevision!=='string')throw Error('A review version is required. Reload saved reviews first.');if(typeof input.expectedRevision==='string'&&input.expectedRevision.length>100)throw Error('Invalid review version.');}catch(e){return json({error:e.message||'Invalid review.'},400);}
  if(method==='POST'){
   const access=await authorizeSave(userId);
   if(access?.allowed!==true)return json({error:'An active subscription is needed to save reviews. Your working review is unchanged. You can still read, export and manage your saved data.'},402);
  }
  const revision=crypto.randomUUID(),updatedAt=new Date().toISOString();let result;
  if(method==='POST'){
   const values=[review.target,JSON.stringify(review.rows),updatedAt,revision,userId,review.month,review.currency];
   if(input.expectedRevision===null)result=await db.prepare('INSERT INTO reviews (target,data,updated_at,revision,user_id,month,currency) VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,month,currency) DO NOTHING').bind(...values).run();
   else result=await db.prepare('UPDATE reviews SET target=?,data=?,updated_at=?,revision=? WHERE user_id=? AND month=? AND currency=? AND revision=? AND deleted_at IS NULL').bind(...values,input.expectedRevision).run();
  }else{
   const condition=method==='DELETE'?'IS NULL':'IS NOT NULL';const deletedAt=method==='DELETE'?updatedAt:null;
   result=await db.prepare(`UPDATE reviews SET deleted_at=?,updated_at=?,revision=? WHERE user_id=? AND month=? AND currency=? AND revision=? AND deleted_at ${condition}`).bind(deletedAt,updatedAt,revision,userId,input.month,input.currency,input.expectedRevision).run();
  }
  if(result.meta.changes!==1)return json({error:'This review changed elsewhere, is in Trash, or is no longer available. Refresh saved reviews before trying again. Your working data has not changed.'},409);
  return json({saved:true,revision,updatedAt});
 }catch{return json({error:'Saved reviews are temporarily unavailable. Export your working data and try again.'},503);}
}
