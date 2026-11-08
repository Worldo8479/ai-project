import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {handleAccountRequest} from '../lib/account-service.js';
import {handleReviewRequest} from '../lib/review-service.js';
function setup(t){
 const sqlite=new DatabaseSync(':memory:');t.after(()=>sqlite.close());
 for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
 const db={prepare:sql=>({bind:(...args)=>({all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})})})};
 const send=(user='alice',input,origin='https://test.example')=>handleAccountRequest(new Request('https://test.example/api/account',{method:input===undefined?'GET':'PUT',headers:{origin,'Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)})}),user?{userId:user,displayName:user,email:user+'@example.invalid'}:null,db);
 return {sqlite,db,send};
}
const prefs={currency:'GBP',target:55,expectedRevision:null};
test('new accounts have defaults without writing records; anonymous identities remain private',async t=>{
 const {sqlite,send}=setup(t);const response=await send();assert.equal(response.headers.get('cache-control'),'no-store');
 const account=await response.json();assert.equal(account.email,'alice@example.invalid');assert.equal(account.subscription,'private-preview');
 assert.deepEqual(account.preferences,{currency:'USD',target:50,revision:null,updatedAt:null});
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM account_preferences').get().n,0);
 assert.deepEqual(await(await send(null)).json(),{signedIn:false});assert.equal((await send(null,prefs)).status,401);
});
test('preferences survive reload and cannot be assigned to another account by a forged payload',async t=>{
 const {send}=setup(t);assert.equal((await send('alice',{...prefs,userId:'bob',subscription:'active',email:'changed@example.invalid'})).status,200);
 const alice=await(await send('alice')).json(),bob=await(await send('bob')).json();
 assert.equal(alice.preferences.currency,'GBP');assert.equal(alice.preferences.target,55);assert.ok(alice.preferences.revision);
 assert.equal(alice.email,'alice@example.invalid');assert.equal(alice.subscription,'private-preview');assert.equal(bob.preferences.currency,'USD');
 assert.equal((await send('bob',{...prefs,expectedRevision:alice.preferences.revision})).status,409);
});
test('duplicate creates and stale preference updates cannot overwrite another session',async t=>{
 const {send}=setup(t);const first=await(await send('alice',prefs)).json();
 assert.equal((await send('alice',prefs)).status,409);
 const update={...prefs,target:60,expectedRevision:first.preferences.revision};assert.equal((await send('alice',update)).status,200);
 assert.equal((await send('alice',{...update,target:70})).status,409);
 assert.equal((await(await send()).json()).preferences.target,60);
});
test('invalid preferences and cross-origin requests never write settings',async t=>{
 const {send,sqlite}=setup(t);assert.equal((await send('alice',prefs,'https://evil.example')).status,403);
 for(const change of [{currency:'XYZ'},{target:'50'},{target:100},{target:-1},{target:50.1},{expectedRevision:undefined},{padding:'x'.repeat(5000)}])assert.equal((await send('alice',{...prefs,...change})).status,400);
 assert.equal(sqlite.prepare('SELECT count(*) AS n FROM account_preferences').get().n,0);
});
test('account exports include the owner preferences without altering saved reviews',async t=>{
 const {db,sqlite,send}=setup(t);
 sqlite.prepare('INSERT INTO reviews(user_id,month,currency,target,data,updated_at,revision) VALUES(?,?,?,?,?,?,?)').run('alice','2026-11','USD',40,JSON.stringify([{client:'Fictional',fee:1000,hours:10,rate:30,other:0}]),'2026-11-08T00:00:00Z','saved-version');
 await send('alice',prefs);await send('bob',{...prefs,currency:'EUR',target:70});
 const result=await(await handleReviewRequest(new Request('https://test.example/api/reviews?format=export'),'alice',db)).json();
 assert.equal(result.preferences.currency,'GBP');assert.equal(result.preferences.target,55);
 assert.equal(result.reviews[0].currency,'USD');assert.equal(result.reviews[0].target,40);assert.equal(result.reviews[0].revision,'saved-version');
 assert.ok(!('userId' in result.preferences));
});
