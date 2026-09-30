// Candidate public operator composition; runtime artifacts must be immutable to runtime UID.
import {bootstrap} from '@alica/kernel';
import {memoryNativeImplementation} from './native-memory.mjs';
export async function startMemoryReadComposition({configText,bootstrapOptions,signedProviderPackage,admission,configuration,descriptor,resolveAuthority}){
 if(bootstrapOptions.nativeImplementations!==undefined)throw Error('composition owns native admissions');
 const native=memoryNativeImplementation({admission,configuration,descriptor,resolveAuthority});
 const host=bootstrap(configText,{...bootstrapOptions,nativeImplementations:[native.implementation]});
 try{
  const providerId=host.discover(signedProviderPackage);
  await host.activateNative(providerId,admission.implementationId);
  return {host,providerId,active:native.active,close:()=>host.shutdown()};
 }catch(error){await host.shutdown();throw error;}
}
