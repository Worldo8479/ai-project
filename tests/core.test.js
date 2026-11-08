import {test} from 'node:test';import assert from 'node:assert/strict';import {calculate,importCSV,exportCSV,parseCSV} from '../src/core.js';
test('delivery profit and target fee use cost margin, not markup',()=>{const r=calculate({fee:1800,hours:36,rate:45,other:60},50);assert.equal(r.cost,1680);assert.equal(r.profit,120);assert.equal(r.targetFee,3360);assert.equal(r.gap,1560);assert.equal(r.hourBudget,840/45);});
test('zero revenue does not claim a margin',()=>{assert.equal(calculate({fee:0,hours:1,rate:40,other:0}).margin,null);});
test('invalid inputs are rejected',()=>{for(const bad of [-1,NaN,Infinity])assert.throws(()=>calculate({fee:bad,hours:1,rate:1,other:0}));assert.throws(()=>calculate({fee:1,hours:1,rate:1,other:0},100));});
test('CSV supports quoted names, line endings and decimal amounts',()=>{const rows=importCSV('client,fee,hours,rate,other\r\n"Studio, North",2000,12.5,45,10\r\n');assert.equal(rows[0].client,'Studio, North');assert.equal(rows[0].hours,12.5);assert.deepEqual(importCSV(exportCSV(rows)),rows);});
test('CSV invalid or duplicate rows cannot silently alter a report',()=>{assert.throws(()=>importCSV('client,fee,hours,rate,other\nA,,1,2,3'));assert.throws(()=>importCSV('client,fee,hours,rate,other\nA,1,1,2,3\na,1,1,2,3'));assert.throws(()=>parseCSV('"unfinished'));});
test('export escapes spreadsheet formulas in client names',()=>{assert.ok(exportCSV([{client:'=HYPERLINK("bad")',fee:1,hours:1,rate:1,other:0}]).includes("'="));});
test('hours scenario is omitted when direct costs alone exceed target budget',()=>{assert.equal(calculate({fee:100,hours:2,rate:10,other:80},50).hourBudget,null);});
test('overflow cannot become an infinite financial result',()=>{assert.throws(()=>calculate({fee:1,hours:1e308,rate:1e308,other:0}));});
