#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {validate,localJSON} from './validate.mjs';
const [command,manifestPath,snapshotPath,pin,configPath]=process.argv.slice(2);
if(command!=='validate'||!configPath){console.error('Usage: alica-service validate manifest.json snapshot.json sha256:PIN config.json');process.exitCode=2;}
else {try{const json=p=>JSON.parse(readFileSync(p,'utf8'));const result=validate(json(manifestPath),{snapshot:json(snapshotPath),pin,configuration:json(configPath),readJSON:name=>localJSON(dirname(resolve(manifestPath)),name)});console.log(JSON.stringify(result,null,2));process.exitCode=result.semantic.status==='PASS'?0:1;}catch(e){console.error(JSON.stringify({status:'FAIL',code:e.code??'INVALID_INPUT'}));process.exitCode=1;}}
