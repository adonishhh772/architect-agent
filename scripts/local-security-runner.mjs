import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync, existsSync, rmSync, accessSync, constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
function option(name, fallback) { const i=args.indexOf(name); return i<0?fallback:args[i+1]; }
if(args.includes("--help")||!option("--repository")) {
  console.log("node scripts/local-security-runner.mjs --repository /path/to/repo --output /private/results --tool gitleaks|semgrep [--rules /trusted/local-rules.yml]\nScans committed regular files from HEAD. Does not execute target code, install tools or fetch rules. Use an isolated machine/container for untrusted repositories.");
  process.exit(args.includes("--help")?0:2);
}
const repo=realpathSync(option("--repository"));
const output=path.resolve(option("--output",path.join(process.cwd(),"analysis-artifacts")));
if(output===repo||output.startsWith(repo+path.sep)) throw new Error("Choose an output directory outside the target repository.");
const tool=option("--tool","gitleaks");
if(!["gitleaks","semgrep"].includes(tool)) throw new Error("Supported tools: gitleaks, semgrep. Import CodeQL or other SARIF files separately.");
const trustedRules=option("--rules");
if(tool==="semgrep"&&(!trustedRules||!existsSync(trustedRules)||!path.isAbsolute(trustedRules))) throw new Error("Semgrep requires an absolute path to trusted local rules. Remote rules are not fetched.");
const env={...process.env,SEMGREP_SEND_METRICS:"off",SEMGREP_ENABLE_VERSION_CHECK:"0"};
for(const key of Object.keys(env)) if(/token|secret|api_?key|password|credential|^GITLEAKS_CONFIG|^SEMGREP_RULES|^SEMGREP_REPO/i.test(key)) delete env[key];
function executable(name) {
 for(const entry of (env.PATH??env.Path??"").split(path.delimiter)) for(const extension of process.platform==="win32"?[".exe",".com"]:[""]) {
  try {
   if(!path.isAbsolute(entry))continue;
   const candidate=realpathSync(path.join(entry,name+extension));
   if(candidate===repo||candidate.startsWith(repo+path.sep))continue;
   accessSync(candidate,process.platform==="win32"?constants.F_OK:constants.X_OK);
   return candidate;
  } catch {}
 }
 return null;
}
const gitExecutable=executable("git");
if(!gitExecutable)throw new Error("Install Git on a trusted PATH outside the target repository.");
const toolExecutable=executable(tool);
if(!toolExecutable)throw new Error("Install the selected scanner on a trusted PATH outside the target repository. No scanner was run.");
function git(parameters,maxBuffer=100*1024*1024) {
 const r=spawnSync(gitExecutable,["-C",repo,...parameters],{encoding:null,maxBuffer,timeout:60_000,windowsHide:true,env});
 if(r.status!==0) throw new Error("Could not read the committed Git snapshot.");
 return r.stdout;
}
const commit=git(["rev-parse","--verify","HEAD"]).toString().trim();
const records=git(["ls-tree","-rz","-l","--full-tree",commit]).toString().split("\0").filter(Boolean);
const selected=[];let size=0,skipped=0;
for(const record of records) {
 const match=/^(\d+) blob ([a-f0-9]+)\s+(\d+)\t([\s\S]+)$/.exec(record);
 if(!match){skipped++;continue;}
 const [,mode,sha,bytes,name]=match;
 if(!["100644","100755"].includes(mode)||name.split("/").some(p=>p===".."||p===".git")||path.isAbsolute(name)||name.includes("\\")||/[\x00-\x1f]/.test(name)||Number(bytes)>2*1024*1024||/^(?:\.semgrepignore|\.gitleaks.*)$/.test(name)){skipped++;continue;}
 if(selected.length>=5000||size+Number(bytes)>80*1024*1024){skipped++;continue;}
 selected.push({sha,name,size:Number(bytes)});size+=Number(bytes);
}
const snapshot=mkdtempSync(path.join(tmpdir(),"sentinel-snapshot-"));
process.on("exit",()=>{
 const resolved=path.resolve(snapshot), allowed=path.resolve(tmpdir())+path.sep;
 if(!resolved.startsWith(allowed)||!path.basename(resolved).startsWith("sentinel-snapshot-"))return;
 try { rmSync(resolved,{recursive:true,force:true}); } catch { console.error("Temporary snapshot could not be removed; remove the path recorded in the private manifest."); }
});
mkdirSync(output,{recursive:true,mode:0o700});
const objects=spawnSync(gitExecutable,["-C",repo,"cat-file","--batch"],{input:selected.map(f=>f.sha).join("\n")+"\n",encoding:null,maxBuffer:90*1024*1024,timeout:60_000,windowsHide:true,env});
if(objects.status!==0) throw new Error("Could not materialise snapshot.");
let cursor=0;
for(const file of selected) {
 const end=objects.stdout.indexOf(10,cursor);
 const header=objects.stdout.subarray(cursor,end).toString();
 if(!header.startsWith(file.sha+" blob ")||Number(header.split(" ")[2])!==file.size)throw new Error("Git object mismatch.");
 const destination=path.resolve(snapshot,file.name);
 if(!destination.startsWith(snapshot+path.sep))throw new Error("Unsafe path.");
 mkdirSync(path.dirname(destination),{recursive:true});
 writeFileSync(destination,objects.stdout.subarray(end+1,end+1+file.size),{mode:0o600});
 cursor=end+1+file.size+1;
}
const reportPath=path.join(output,tool+"-"+commit.slice(0,12)+".sarif");
const bundled=path.dirname(fileURLToPath(import.meta.url));
const command=tool==="gitleaks"
 ? ["dir",snapshot,"--config",path.join(bundled,"gitleaks.toml"),"--redact=100","--no-banner","--report-format","sarif","--report-path",reportPath]
 : ["scan","--config",realpathSync(trustedRules),"--metrics=off","--disable-version-check","--sarif","--output",reportPath,"--timeout","20","--max-target-bytes","2000000",snapshot];
const version=spawnSync(toolExecutable,tool==="gitleaks"?["version"]:["--version"],{encoding:"utf8",timeout:10000,windowsHide:true,env});
const result=spawnSync(toolExecutable,command,{cwd:snapshot,env,timeout:10*60_000,maxBuffer:2*1024*1024,windowsHide:true});
const completed=tool==="gitleaks"?[0,1].includes(result.status):result.status===0;
if(existsSync(reportPath)) {
 const sarif=JSON.parse(readFileSync(reportPath,"utf8"));
 for(const run of sarif.runs??[]) {
  run.versionControlProvenance=[{revisionId:commit}];
  run.properties={...(run.properties??{}),sentinelCoverage:{fileCount:selected.length,omittedFiles:skipped,scope:"Committed regular files only; bounded snapshot excludes large files, symlinks and submodules."}};
  run.invocations=[...(run.invocations??[]),{executionSuccessful:completed}];
  for(const finding of run.results??[]) for(const location of finding.locations??[]) {
   const artifact=location.physicalLocation?.artifactLocation;
   if(artifact?.uri) artifact.uri=artifact.uri.replaceAll(snapshot.replaceAll("\\","/")+"/","").replaceAll(snapshot+"\\","");
  }
 }
 writeFileSync(reportPath,JSON.stringify(sarif,null,2),{mode:0o600});
}
writeFileSync(path.join(output,tool+"-manifest.json"),JSON.stringify({version:1,commit,tool,toolVersion:version.stdout?.trim()||"unknown",completed,exitCode:result.status,scannedFiles:selected.length,omittedFiles:skipped,scope:"Committed regular files only; files >2 MB, symlinks, submodules and scanner configuration excluded.",snapshotDirectory:snapshot,report:existsSync(reportPath)?path.basename(reportPath):null,networkPolicy:"No rule downloads requested; use OS/container network controls to enforce egress isolation."},null,2),{mode:0o600});
console.log(JSON.stringify({commit,tool,completed,scannedFiles:selected.length,omittedFiles:skipped,report:existsSync(reportPath)?reportPath:null,detail:result.error?.code||"See private manifest. Temporary source snapshot is removed when the runner exits."}));
process.exitCode=completed?0:1;
