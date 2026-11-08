import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function billingDatabase(t){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of readdirSync(new URL('../../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL('../../drizzle/'+file,import.meta.url),'utf8'));
 t.after(()=>sqlite.close());
 const db={prepare:sql=>({bind:(...args)=>({sql,args,all:async()=>({results:sqlite.prepare(sql).all(...args)}),run:async()=>({meta:{changes:sqlite.prepare(sql).run(...args).changes}})})}),
 batch:async statements=>{sqlite.exec('BEGIN');try{const results=statements.map(s=>({meta:{changes:sqlite.prepare(s.sql).run(...s.args).changes}}));sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 return {db,sqlite};
}
