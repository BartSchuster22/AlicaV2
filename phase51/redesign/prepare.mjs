// Additive DRAFT ONLY. Never rewrites v1, reviews, transitions or admits.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {canonical,digest,descriptor as validateDescriptor} from '@alica/acap-contracts';
import {validateDefinition,localReader} from '@alica/catalog';
import {validateProposal} from '@alica/catalog/governance';
const root=new URL('../../',import.meta.url),old=new URL('catalog/proposals/memory-candidates/',root),out=new URL('catalog/proposals/memory-candidates-v2/',root);
const sha=b=>createHash('sha256').update(b).digest('hex'),read=n=>JSON.parse(readFileSync(new URL(n,old)));
assert.equal(sha(readFileSync(new URL('descriptor.json',old))),'1962770c9bd93091ab644933c91167c43499c6d88e74815ba92daec0b67aaa84');
const d=read('descriptor.json');d.version='2.0.0';const create=d.operations.find(o=>o.name==='create');
create.idempotency='none';delete create.idempotencyPolicy;
create.input.properties.requestKey={type:'string',minLength:8,maxLength:128};create.input.required.push('requestKey');
const definition=read('definition.json');definition.metadata.id='acap://alica.io/memory/candidates@2';definition.metadata.version='2.0.0';definition.metadata.maturity='proposed';
definition.contract.version='2.0.0';definition.contract.digest=digest(d);
definition.metadata.summary='Governed working candidates with durable domain request replay, stable IDs and bounded retrieval.';
definition.semantics.description='Create requires payload requestKey (8–128 ASCII letters/digits/dot/underscore/hyphen, first alphanumeric). This is domain operation data, NEVER authority. Host idempotency is none: no CallOptions.idempotencyKey is accepted, no Host result/error replay cache. Domain MUST durably bind trusted actor plus operation namespace plus requestKey to normalized complete mutation payload and original result, atomically with mutation/audit, for at least 86400000ms from commit across provider/Host restart. Every attempt reauthorizes current Host grants AND trusted actor/data-root/domain permission before any replay. Same key changed payload is CONFLICT; actor namespace is isolated; original stable ID/result retained. Explicit retry after ambiguous write uses same payload key; no automatic retry or rollback claim. Get/search remain unchanged. See SEMANTICS.md and CHANGE.md. Proposed redesign, not reviewed/admitted.';
const proposal=read('proposal.json');proposal.id='phase51-memory-candidates-v2-domain-replay';proposal.draft=definition.metadata.id;
proposal.abstraction='One generic working-candidate capability create/get/search. Breaking v2 adds mandatory requestKey to create payload and disables Host-level idempotency; persistence is an explicit normative shared-domain guarantee, not an instance cache claim. No new public binding/platform or domain promotion/import authority.';
proposal.alternatives='Original durable Host policy is rejected by frozen public Host and ContractProvider. Merely instance relabeling rejected: Host caches success/errors and can bypass current domain reauthorization. Revised v2 uses domain requestKey and transport idempotency none so every call reaches current authority checks. No Kernel/ACAP/Foundation edits.';
proposal.security='Trusted Host caller mapped by operator to actor/data-root/permitted domain operations on EVERY attempt; requestKey is non-authoritative request data. No caller identity/grants in payload. Current domain create authorization precedes durable replay. Same-actor key conflicts on changed scope/content; distinct actor namespace cannot replay another actor result. Retry is explicit after ambiguity; committed mutation and ledger are atomic; no automatic retries or rollback promises.';
proposal.compatibility='Breaking additive v2 draft, different major and digest. Original reviewed v1 files/receipt remain unchanged; their review/admission does not transfer. Consumer moves from CallOptions.idempotencyKey to payload.requestKey; v1 and v2 never silently resolve as compatible. Existing HTTP API unchanged. Minimum durability remains24h and restart-stable replay; Host generic replay guarantee is explicitly not offered.';
validateDescriptor(canonical(d));validateProposal(proposal);mkdirSync(out,{recursive:true});
for(const [name,data] of Object.entries({'descriptor.json':d,'definition.json':definition,'proposal.json':proposal,'namespace-policy.json':read('namespace-policy.json')}))writeFileSync(new URL(name,out),JSON.stringify(data,null,2)+'\n');
validateDefinition(definition,localReader(out.pathname),read('namespace-policy.json'),{release:false});
// Prototype leaf bridge copy, not a product switch. Preserve original provider and shared domain unchanged.
let provider=readFileSync(new URL('services/memoryv4/provider.mjs',root),'utf8');
provider=provider.replace("  const data=Buffer.from(JSON.stringify({v:1,operation,payload:input,authority,key:ctx.idempotencyKey??null,requestId:ctx.requestId,deadlineMs}));",`  if(ctx.idempotencyKey!==undefined)throw fail('INVALID_ARGUMENT');
  let payload=input,key=null;
  if(operation==='create'){
   const {requestKey,...body}=input;
   if(typeof requestKey!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{7,127}$/.test(requestKey))throw fail('INVALID_ARGUMENT');
   payload=body;key='acap.candidates.v2:'+requestKey;
  }
  const data=Buffer.from(JSON.stringify({v:1,operation,payload,authority,key,requestId:ctx.requestId,deadlineMs}));`);
assert.ok(provider.includes("key='acap.candidates.v2:'+requestKey"));
provider=provider.replace("new URL('./bridge.py',import.meta.url)","new URL('../../services/memoryv4/bridge.py',import.meta.url)").replace("cwd:new URL('.',import.meta.url)","cwd:new URL('../../services/memoryv4/',import.meta.url)");
writeFileSync(new URL('provider.mjs',import.meta.url),'// UNREVIEWED additive v2 diagnostic prototype; not selected production adapter.\n'+provider);
console.log(JSON.stringify({status:'REVISED_DRAFT_VALIDATED_NOT_REVIEWED_OR_ADMITTED',descriptorDigest:digest(d),releaseEntries:0,originalPreserved:true}));
