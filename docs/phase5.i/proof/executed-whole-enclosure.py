import os,subprocess,sys
r='/home/alica-dev/phase5i/reference/integrated-candidate'
def run(*a):subprocess.run(a,check=True)
run('/usr/bin/mount','--make-rprivate','/');run('/usr/bin/mount','--bind',r,r)
for p in ['tmp','state','evidence','dev/null']:run('/usr/bin/mount','--bind',r+'/'+p,r+'/'+p)
run('/usr/bin/mount','-t','proc','-o','ro,nosuid,nodev,noexec','proc',r+'/proc');run('/usr/sbin/ip','link','set','lo','up');run('/usr/bin/mount','-o','remount,bind,ro,nosuid,nodev',r)
os.execv('/usr/sbin/chroot',['chroot',r,'/usr/bin/setpriv','--reuid=996','--regid=987','--clear-groups','--inh-caps=-all','--ambient-caps=-all','--bounding-set=-all','--no-new-privs','/home/alica-dev/phase5i/upstream-K/.venv/bin/python','/work/phase5i/whole-qualifier.py',sys.argv[1]])
