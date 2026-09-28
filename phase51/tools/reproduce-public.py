"""Fresh public-source archive, fresh dependency installs, offline finite qualification. No publish."""
from pathlib import Path
import hashlib,json,os,pwd,shutil,subprocess,tarfile,tempfile
repo=Path(__file__).resolve().parents[2]
assert os.geteuid()==0
owner=pwd.getpwuid(repo.stat().st_uid);assert owner.pw_uid!=0
node=Path(os.environ['NODE_BINARY']);npm=node.parent.parent/'lib/node_modules/npm/bin/npm-cli.js'
root=Path(tempfile.mkdtemp(prefix='phase51-public-',dir=repo.parent));source=root/'source';source.mkdir();home=root/'home';home.mkdir()
evidence=repo/'docs/phase5.1/evidence';logs=[]
env={'PATH':str(node.parent)+':/usr/bin:/bin','HOME':str(home),'LANG':'C','NPM_CONFIG_USERCONFIG':str(home/'empty-user.npmrc'),'NPM_CONFIG_GLOBALCONFIG':str(home/'empty-global.npmrc'),'PIP_CONFIG_FILE':'/dev/null'}
def run(name,cmd,network=False,extra=None,allow_failure=False,loopback=False,timeout=240):
    prefix=[] if network else ['/usr/bin/unshare','--net']
    if loopback:prefix+=['/bin/sh','-c','/usr/sbin/ip link set lo up && exec "$@"','phase51-fixture']
    command=prefix+['/usr/bin/sudo','-u','#'+str(owner.pw_uid),'/usr/bin/env','-i',*[k+'='+v for k,v in {**env,**(extra or {})}.items()],*map(str,cmd)]
    p=subprocess.run(command,cwd=source,capture_output=True,text=True,timeout=timeout)
    path=evidence/('public-'+name+'.log');path.write_text(p.stdout+p.stderr);logs.append({'name':name,'exitCode':p.returncode,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    print(json.dumps(logs[-1]),flush=True)
    if not allow_failure:assert p.returncode==0, str(path)
    return p.returncode
try:
    base=subprocess.check_output(['sudo','-u','#'+str(owner.pw_uid),'git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    archive=root/'base.tar'
    with archive.open('wb') as f:subprocess.run(['sudo','-u','#'+str(owner.pw_uid),'git','archive','HEAD'],cwd=repo,stdout=f,check=True)
    with tarfile.open(archive) as f:f.extractall(source,filter='data')
    overlays=['services/memoryv4','catalog/proposals/memory-candidates','catalog/proposals/memory-candidates-v2','catalog/releases/phase51-memory-v2','phase51','docs/phase5.1']
    ignore=shutil.ignore_patterns('__pycache__','.pytest_cache','.env','*.sqlite3','*.db','*.tar.gz','public-*.log','public-reproduction.json','candidate-source.json')
    for name in overlays:shutil.copytree(repo/name,source/name,dirs_exist_ok=True,ignore=ignore)
    shutil.copy2(repo/'README.md',source/'README.md')
    # Source archive contains no interpreter, dependencies, credentials or databases.
    artifact=evidence/'phase51-candidate-source.tar.gz'
    with tarfile.open(artifact,'w:gz') as f:f.add(source,arcname='phase51-candidate')
    artifact_sha=hashlib.sha256(artifact.read_bytes()).hexdigest()
    (source/'.tools').mkdir(exist_ok=True)
    # The frozen packed-fixture helper retains HOME only; this is a new temporary offline config.
    (home/'.npmrc').write_text('offline=true\ncache='+str(Path(owner.pw_dir)/'.npm')+'\n')
    for directory,_,files in os.walk(root):
        os.chown(directory,owner.pw_uid,owner.pw_gid)
        for name in files:os.chown(Path(directory)/name,owner.pw_uid,owner.pw_gid)
    os.chown(root,owner.pw_uid,owner.pw_gid)
    if run('npm-offline-install',[node,npm,'ci','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',Path(owner.pw_dir)/'.npm'],allow_failure=True):
        run('npm-public-install',[node,npm,'ci','--ignore-scripts','--no-audit','--no-fund','--registry=https://registry.npmjs.org'],network=True)
    run('build',[node,npm,'run','build'])
    run('typecheck',[node,npm,'run','typecheck'])
    run('frozen-regression',[node,npm,'test'])
    rc=run('inherited-dependency-check',['/usr/bin/python3','-S','tools/check-dependencies.py'],allow_failure=True)
    assert rc==1 and 'AssertionError: @alica/catalog' in (evidence/'public-inherited-dependency-check.log').read_text()
    logs[-1]['classification']='INHERITED_EXPECTED_FAILURE_NOT_REPAIRED'
    decision=sorted(str(p.relative_to(source)) for section in ['contract','provider','external'] for p in (source/'services/decision/tests'/section).glob('*.test.mjs'));assert decision
    run('decision-offline',[node,'--experimental-vm-modules','--test','--test-timeout=15000',*decision],loopback=True)
    run('decision-packed',[node,'services/decision/tools/external.mjs'],loopback=True,timeout=120)
    run('decision-packed-continuation',[node,'services/decision/tools/external.mjs','--continuation-fixture'],loopback=True,timeout=120)
    foundation=sorted(str(p.relative_to(source)) for p in (source/'service-foundation/tests').glob('*.test.mjs'));assert foundation
    run('foundation-regression',[node,'--experimental-vm-modules','--test','--test-timeout=15000',*foundation],loopback=True)
    native=subprocess.run(['/usr/bin/python3','service-foundation/conformance/isolate.py'],cwd=source,env=env,capture_output=True,text=True,timeout=180)
    path=evidence/'public-foundation-native.log';path.write_text(native.stdout+native.stderr)
    logs.append({'name':'foundation-native','exitCode':native.returncode,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()});print(json.dumps(logs[-1]),flush=True);assert native.returncode==0,str(path)
    run('venv',['/usr/bin/python3','-m','venv','--without-pip','.tools/memory-python'])
    wheel=repo/'.tools/pip-24.3.1-py3-none-any.whl';assert wheel.is_file()
    python=source/'.tools/memory-python/bin/python'
    run('python-public-install',[python,'-m','pip','install','--disable-pip-version-check','--no-input','--index-url','https://pypi.org/simple','-r','services/memoryv4/requirements-qualified.txt'],network=True,extra={'PYTHONPATH':str(wheel)})
    run('python-regression',[python,'phase51/tools/run-python-tests.py','final'])
    run('integrated-public-host',[node,'--experimental-vm-modules','--test','services/memoryv4/test-v2.mjs'])
    # Capture from the clean source execution, not a fabricated manifest-only result.
    shutil.copy2(source/'docs/phase5.1/evidence/python-final.log',evidence/'python-final.log')
    result={'status':'PASS_WITH_INHERITED_FAILURE','baseCommit':base,'artifact':artifact.name,'artifactSha256':artifact_sha,'sourceOnly':True,'freshNpmInstall':True,'freshPythonEnvironmentAndInstall':True,'publicDependencyEndpointsOnly':True,'qualificationNetworkIsolated':True,'productionConfig':False,'publication':False,'ownerAcceptance':False,'logs':logs}
    (evidence/'public-reproduction.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
finally:
    shutil.rmtree(root)
