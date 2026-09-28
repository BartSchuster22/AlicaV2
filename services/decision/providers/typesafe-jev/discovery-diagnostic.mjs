// One-shot discovery inspection: no raw body, error text, unknown field values,
// request/state or credential is returned. Not a replacement model validator.
import { parseWire, wireDecimal } from './wire.mjs';
import { modelBody, identifier } from './mapping.mjs';
const object = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === null;
const type = v => { if(v===null)return 'null';if(Array.isArray(v))return 'array';try{wireDecimal(v);return 'number';}catch{}return typeof v; };
export function diagnosticBody(text, sensitive = () => false) {
  const out = { schema:'alica.phase4-discovery-diagnostic/v1', lexical:'rejected', documentedSchemaValid:false, legacyMapping:'not-run', genericModelsCompatible:false, reasons:[], shape:[], metadata:[] };
  let root;
  try { root=parseWire(text); } catch { out.reasons.push({path:'$',rule:'WIRE_LEXICAL_OR_BOUNDS'});return out; }
  // Inspect decoded keys/strings as well as raw bytes; escaped echoes cannot leak.
  function echo(v){if(typeof v==='string')return sensitive(v);if(Array.isArray(v))return v.some(echo);if(object(v))return Object.entries(v).some(([k,x])=>sensitive(k)||echo(x));return false;}
  if(echo(root)){out.reasons.push({path:'$',rule:'SENSITIVE_RESPONSE_REDACTED'});return out;}
  out.lexical='accepted';
  const reason=(path,rule)=>{if(out.reasons.length<256)out.reasons.push({path,rule});};
  const fields=v=>({known:Object.keys(v).filter(k=>['models','name','description','release_date'].includes(k)).sort(),additional:Object.keys(v).filter(k=>!['models','name','description','release_date'].includes(k)&&/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(k)).sort().slice(0,16),additionalCount:Object.keys(v).filter(k=>!['models','name','description','release_date'].includes(k)).length});
  if(!object(root)){reason('$','ROOT_NOT_OBJECT');return out;}
  out.shape.push({path:'$',fields:fields(root)});
  if(Object.keys(root).sort().join()!=='models')reason('$','LEGACY_EXACT_ROOT_KEYS');
  if(!Array.isArray(root.models)){reason('$.models','MODELS_NOT_ARRAY');return out;}
  out.modelCount=root.models.length;
  if(root.models.length>128){reason('$.models','DIAGNOSTIC_COUNT_BOUND');return out;}
  if(!root.models.length)reason('$.models','LEGACY_NONEMPTY_ARRAY');
  let valid=true,bounded=true,compatible=true;
  for(const [i,m] of root.models.entries()){
    const path='$.models['+i+']';
    if(!object(m)){valid=false;reason(path,'MODEL_NOT_OBJECT');continue;}
    const row={path,fields:fields(m),types:{}};out.shape.push(row);
    if(Object.keys(m).sort().join()!=='description,name,release_date')reason(path,'LEGACY_EXACT_MODEL_KEYS');
    for(const k of ['name','description','release_date']){row.types[k]=type(m[k]);if(typeof m[k]!=='string'){valid=false;reason(path+'.'+k,'REQUIRED_STRING');}}
    if(['name','description','release_date'].some(k=>typeof m[k]!=='string'))continue;
    row.lengths={name:m.name.length,description:m.description.length,release_date:m.release_date.length};
    try{identifier(m.name);}catch{compatible=false;reason(path+'.name','GENERIC_MODEL_ID_INCOMPATIBLE');}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(m.release_date))reason(path+'.release_date','LEGACY_DATE_PATTERN');
    if(m.description.length>4096)reason(path+'.description','LEGACY_DESCRIPTION_BOUND');
    if(m.name.length>512||m.description.length>4096||m.release_date.length>128||[m.name,m.description,m.release_date].some(s=>/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s))){bounded=false;reason(path,'DIAGNOSTIC_METADATA_BOUND');continue;}
    out.metadata.push({name:m.name,description:m.description,release_date:m.release_date});
  }
  if(new Set(out.metadata.map(m=>m.name)).size!==out.metadata.length){compatible=false;reason('$.models','DUPLICATE_MODEL_ID');}
  out.documentedSchemaValid=valid;out.genericModelsCompatible=valid&&bounded&&compatible&&root.models.length>0;
  try{modelBody(text);out.legacyMapping='accepted';}catch{out.legacyMapping='rejected';}
  return out;
}
