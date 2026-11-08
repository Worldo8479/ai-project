const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function readPreferences(db,userId){
 const {results}=await db.prepare('SELECT currency,target,revision,updated_at FROM account_preferences WHERE user_id=?').bind(userId).all();
 const row=results[0];
 return row?{currency:row.currency,target:row.target,revision:row.revision,updatedAt:row.updated_at}:{currency:'USD',target:50,revision:null,updatedAt:null};
}
async function readBody(request){
 const reader=request.body?.getReader();if(!reader)throw Error('Missing preferences.');
 let size=0;const chunks=[];
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;
  if(size>4096){await reader.cancel();throw Error('Preferences request is too large.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleAccountRequest(request,user,db){
 if(!user?.userId)return request.method==='GET'?json({signedIn:false}):json({error:'Sign in to change account settings.'},401);
 if(!['GET','PUT'].includes(request.method))return json({error:'Method not supported.'},405);
 if(request.method==='PUT'){
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'This request must come from this site.'},403);
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Send a JSON request.'},415);
 }
 try{
  if(request.method==='GET')return json({signedIn:true,name:user.displayName,email:user.email,
   subscription:'private-preview',preferences:await readPreferences(db,user.userId)});
  let input;
  try{
   input=await readBody(request);
   if(!input||!['USD','GBP','EUR','CAD','AUD'].includes(input.currency)||!Number.isInteger(input.target)||input.target<0||input.target>99)throw Error('Choose a supported currency and a whole-number margin target from 0 to 99.');
   if(input.expectedRevision!==null&&(typeof input.expectedRevision!=='string'||!input.expectedRevision||input.expectedRevision.length>100))throw Error('Reload account settings before saving.');
  }catch(e){return json({error:e instanceof SyntaxError?'Send valid account preferences.':e.message},400);}
  const revision=crypto.randomUUID(),updatedAt=new Date().toISOString();let result;
  if(input.expectedRevision===null)result=await db.prepare('INSERT INTO account_preferences(user_id,currency,target,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING').bind(user.userId,input.currency,input.target,revision,updatedAt).run();
  else result=await db.prepare('UPDATE account_preferences SET currency=?,target=?,revision=?,updated_at=? WHERE user_id=? AND revision=?').bind(input.currency,input.target,revision,updatedAt,user.userId,input.expectedRevision).run();
  if(result.meta.changes!==1)return json({error:'Your preferences changed in another session. Reload settings and try again.'},409);
  return json({preferences:{currency:input.currency,target:input.target,revision,updatedAt}});
 }catch{return json({error:'Account settings are temporarily unavailable. Your working review is unchanged.'},503);}
}
