// Minimal native composition API; caller supplies explicit isolated owned config.
import {Ajv2020} from 'ajv/dist/2020.js';
import schema from '../../docs/phase5.2/design/config.schema.json' with {type:'json'};
import {requireThat} from './contracts.mjs';
import {Assurance} from './core.mjs';
import {FileStore} from './store.mjs';
import {doghouse} from './adapter.mjs';
const valid=new Ajv2020({strict:true}).compile(schema);
export function nativeAssurance(config,{targets=[],actors=[]}={}){
 requireThat(valid(config),'INVALID_ARGUMENT');
 const domain=new Assurance(new FileStore(config.directory),{targets,actors});
 return {domain,service:doghouse(domain)};
}
