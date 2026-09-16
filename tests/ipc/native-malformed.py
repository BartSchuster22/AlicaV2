"""Trusted malformed ancillary generator for native receiver tests, not an adapter."""
import array,os,socket,sys,tempfile
c=socket.socket(fileno=3);fds=[];sockets=[];mode=sys.argv[1]
try:
 if mode=='file':
  f=tempfile.TemporaryFile();fds=[f.fileno()]
 else:
  for _ in range(2 if mode=='extra' else 70 if mode=='truncated' else 1):
   a,b=socket.socketpair();sockets.extend([a,b]);fds.append(b.fileno())
 payload=b'x'*(5000 if mode=='oversize' else 20)
 c.sendmsg([payload],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',fds))])
finally:
 for s in sockets:s.close()
 c.close()
