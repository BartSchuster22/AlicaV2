import os
from pathlib import Path
import subprocess,os,pwd,json
b=Path(os.environ['PHASE5I_PUBLIC_BASE']);e=b/'build-evidence';r=b/'clean-public-source';home=b/'clean-setup-home';inputs=b/'clean-inputs';assert not inputs.exists();inputs.mkdir();u=pwd.getpwnam('alica-dev');os.chown(inputs,u.pw_uid,u.pw_gid);uv=str(b/'tools/uv/uv');py='/home/alica-dev/.local/share/uv/python/cpython-3.14.7-linux-x86_64-gnu/bin/python3.14'
env={'PATH':str(b/'tools/node-v24.21.0-linux-x64/bin')+':/usr/bin:/bin','HOME':str(home),'LANG':'C.UTF-8','npm_config_cache':str(home/'npm-cache'),'UV_NO_CONFIG':'1','UV_CACHE_DIR':str(home/'uv-cache'),'UV_PYTHON_DOWNLOADS':'never','GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0','PYTHONDONTWRITEBYTECODE':'1'}
def run(name,args,cwd=inputs):
 p=subprocess.run(['runuser','-u','alica-dev','--','env','-i',*[k+'='+v for k,v in env.items()],*args],cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=360);(e/('clean-'+name+'.log')).write_text(p.stdout);print(name,p.returncode,p.stdout[-1400:],flush=True);assert p.returncode==0;return p.stdout
pins={'H':'c04e9a1d0dfa4abbefe4b256428e645abaacfe88','K':'536802c00e4f93061fc46b134dc029ff695f364f'}
for name,pin in pins.items():
 source=inputs/name;run(name+'-init',['git','init',str(source)]);run(name+'-public-fetch',['git','fetch','--depth=1','https://github.com/NousResearch/hermes-agent.git',pin],source);run(name+'-pin',['git','checkout','--detach',pin],source)
 args=[uv,'sync','--frozen','--no-dev','--python',py]
 if name=='K':args+=['--extra','web']
 run(name+'-dependencies',args,source);run(name+'-freeze',[uv,'pip','freeze','--python',str(source/'.venv/bin/python')],source)
v=inputs/'memory-python';run('M-venv',[uv,'venv','--python','/usr/bin/python3.12',str(v)]);run('M-install',[uv,'pip','install','--python',str(v/'bin/python'),'--index-url','https://pypi.org/simple','-r',str(r/'services/memoryv4/requirements-qualified.txt'),'-c',str(Path(os.environ['PHASE5I_RELEASE_DIR'])/'reproduce/memory-constraints.txt')]);run('M-freeze',[uv,'pip','freeze','--python',str(v/'bin/python')])
# Public independent package author/operator preparation; setup only, no backend.
lock=json.loads((r/'package-lock.json').read_text());pins0=sorted({k.removeprefix('node_modules/')+'@'+v['version'] for k,v in lock['packages'].items() if k.startswith('node_modules/') and not v.get('link') and 'version' in v and '/node_modules/' not in k})
for pin in pins0:run('npm-cache-'+pin.replace('/','_'),['npm','cache','add',pin,'--ignore-scripts'],r)
out=run('P2-external',['node','service-foundation/conformance/prepare-external.mjs'],r);external=Path(json.loads(out)['root']);assert external.parent==Path('/home/alica-dev') and external.name.startswith('phase50-external-')
result={'status':'PASS_PREPARATION','freshSources':{k:str(inputs/k) for k in pins},'pins':pins,'MemoryPython':str(v),'external':str(external),'runtimeHomeOrStateCopied':False,'privateApplicationCredentialsCopied':False};(e/'clean-inputs-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
