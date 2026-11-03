import { extractCallFlows } from "@sentinel/graph";
import { performance } from "node:perf_hooks";
const cases=[
 {name:"direct request argument",expected:true,code:'function handler(req) { const value=req.body.value; eval(value); }'},
 {name:"unrelated constant sink",expected:false,code:'function handler(req) { const ignored=req.query.value; eval("1+1"); }'},
 {name:"overwritten input",expected:false,code:'function handler(req) { let value=req.query.value; value="fixed"; eval(value); }'},
 {name:"same-file argument propagation",expected:true,code:'function handler(req) { render(req.body.value); } function render(input) { eval(input); }'},
 {name:"constant callee argument",expected:false,code:'function handler(req) { const ignored=req.body.value; render("fixed"); } function render(input) { eval(input); }'},
];
const started=performance.now();
const results=cases.map(item=>{const found=extractCallFlows(new Map([["fixture.ts",item.code]])).flows.length>0;return {name:item.name,expected:item.expected,found,pass:item.expected===found};});
const tp=results.filter(r=>r.expected&&r.found).length,fp=results.filter(r=>!r.expected&&r.found).length,fn=results.filter(r=>r.expected&&!r.found).length;
console.log(JSON.stringify({version:1,scope:"Five synthetic JavaScript/TypeScript flow examples only. Not a real-world accuracy or exploitability benchmark.",cases:results.length,passed:results.filter(r=>r.pass).length,precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),milliseconds:Math.round(performance.now()-started),results},null,2));
process.exitCode=results.every(r=>r.pass)?0:1;
