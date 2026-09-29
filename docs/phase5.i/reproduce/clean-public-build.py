import os
from pathlib import Path
import subprocess,os,pwd,json,hashlib
b=Path(os.environ['PHASE5I_PUBLIC_BASE']);e=b/'build-evidence';r=b/'clean-public-source';home=b/'clean-setup-home';u=pwd.getpwnam('alica-dev');assert not r.exists() and not home.exists();home.mkdir();os.chown(home,u.pw_uid,u.pw_gid)
node=b/'tools/node-v24.21.0-linux-x64/bin';assert hashlib.sha256((b/'downloads/node-v24.21.0-linux-x64.tar.xz').read_bytes()).hexdigest()=='fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6'
env={'PATH':str(node)+':/usr/bin:/bin','HOME':str(home),'LANG':'C.UTF-8','npm_config_cache':str(home/'npm-cache'),'GIT_CONFIG_NOSYSTEM':'1','GIT_CONFIG_GLOBAL':'/dev/null','GIT_TERMINAL_PROMPT':'0'}
def run(name,args,cwd=None):
 p=subprocess.run(['runuser','-u','alica-dev','--','env','-i',*[k+'='+v for k,v in env.items()],*args],cwd=cwd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240);(e/('clean-'+name+'.log')).write_text(p.stdout);print(name,p.returncode,p.stdout[-1800:],flush=True);assert p.returncode==0
run('clone',['git','clone','--no-checkout','https://github.com/BartSchuster22/AlicaV2.git',str(r)])
run('checkout',['git','checkout','--detach','96359ab780dea152d7eb87736ebecb9fbceeb93c'],r)
run('npm-ci',['npm','ci','--ignore-scripts','--no-audit','--no-fund'],r)
run('build',['node','tools/build.mjs'],r)
run('source-diff',['git','diff','--exit-code'],r)
expected=json.loads((Path(os.environ['PHASE5I_RELEASE_DIR'])/'reproduce/build-expected.json').read_text());comparison={}
for n,want in expected.items():
 p=r/n
 actual={str(x.relative_to(p)):hashlib.sha256(x.read_bytes()).hexdigest() for x in p.rglob('*') if x.is_file()} if p.is_dir() else hashlib.sha256(p.read_bytes()).hexdigest()
 assert actual==want,n;comparison[n]='byte-identical to published qualification'
result={'status':'PASS_PREPARATION','anonymousCarrier':'96359ab780dea152d7eb87736ebecb9fbceeb93c','freshCheckout':str(r),'freshSetupHome':str(home),'freshNpmDependencyInstall':True,'firstRuntimeStateCopied':False,'sharedBuildComparison':comparison,'runtimeQualification':'NOT_EXECUTED'};(e/'clean-public-build-result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
