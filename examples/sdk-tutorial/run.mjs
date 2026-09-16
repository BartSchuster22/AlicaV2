import {createTestCell} from '@alica/testkit';
import * as provider from './dist/provider.js';
import * as consumer from './dist/consumer.js';
const cell=createTestCell();
try{const p=cell.instance({id:'org.tutorial.provider'});await p.activate(provider);const c=cell.instance({id:'org.tutorial.consumer',permissions:{capabilities:{'org.tutorial.math':['add'],'org.tutorial.result':['add']}}});await c.activate(consumer);const h=await c.context.require({...consumer.requirement,capabilityId:'org.tutorial.result'});const result=await h.call('add',{left:20,right:22},{deadlineMs:Date.now()+1000});console.log(JSON.stringify({mode:'TESTKIT—not production authority',result}));if(result!==42)throw new Error('unexpected result')}finally{await cell.close()}
