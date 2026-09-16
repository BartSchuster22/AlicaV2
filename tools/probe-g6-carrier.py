"""Disposable Linux ancillary-FD feasibility probe. NOT authenticated IPC qualification.
Trusted Python fixture, not the Node provider or production seccomp policy.
"""
import array,json,os,socket,struct,subprocess,sys,tempfile

def readn(s,n):
    out=b''
    while len(out)<n:
        chunk=s.recv(n-len(out))
        if not chunk:raise EOFError()
        out+=chunk
    return out

def send(s,value):
    body=json.dumps(value).encode();s.sendall(struct.pack('!I',len(body))+body)

def receive(s):
    n=struct.unpack('!I',readn(s,4))[0]
    if not 0<n<=4096:raise ValueError('length')
    return json.loads(readn(s,n))

def receive_packet(s):
    data=s.recv(4097)
    if len(data)<4:raise ValueError('short packet')
    n=struct.unpack('!I',data[:4])[0]
    if n!=len(data)-4 or len(data)>4096:raise ValueError('packet length')
    return json.loads(data[4:])

def child(fd):
    carrier=socket.socket(fileno=fd);carrier.settimeout(3)
    channels={};rejected=0;closed=0;cloexec=True
    for _ in range(4):
        data,anc,flags,_=carrier.recvmsg(4097,socket.CMSG_SPACE(8*array.array('i').itemsize),socket.MSG_CMSG_CLOEXEC)
        descriptors=[]
        for level,kind,raw in anc:
            if level==socket.SOL_SOCKET and kind==socket.SCM_RIGHTS:
                a=array.array('i');a.frombytes(raw[:len(raw)//a.itemsize*a.itemsize]);descriptors.extend(a)
        valid=False;wrapped=None
        try:
            n=struct.unpack('!I',data[:4])[0];body=json.loads(data[4:])
            valid=not flags&(socket.MSG_TRUNC|socket.MSG_CTRUNC) and len(data)==n+4 and n<=4092 and len(descriptors)==1
            valid=valid and set(body)=={'contextId','descriptorCount'} and body['descriptorCount']==1 and body['contextId'] not in channels
            if valid:
                wrapped=socket.socket(fileno=descriptors[0]);valid=wrapped.getsockopt(socket.SOL_SOCKET,socket.SO_TYPE)==socket.SOCK_STREAM
            if valid:
                cloexec=cloexec and not os.get_inheritable(descriptors[0]);wrapped.settimeout(3);channels[body['contextId']]=wrapped
        except (ValueError,OSError,KeyError,struct.error):valid=False
        if not valid:
            rejected+=1
            if wrapped is not None:wrapped.detach()
            for x in descriptors:
                try:os.close(x);closed+=1
                except OSError:pass
        send(carrier,{'accepted':valid})
    pending=[];counter=0
    for name in ['a','b']:
        value=receive(channels[name]);assert value=={'contextId':name,'op':'increment'}
        counter+=1;pending.append((name,counter))
    for name,value in pending:send(channels[name],{'contextId':name,'counter':value})
    for s in channels.values():s.close()
    carrier.close()
    print(json.dumps({'level':'NATIVE-PRIMITIVE-ONLY','runtimeQualification':False,'acceptedContexts':len(channels),'rejectedOffers':rejected,'rejectedDescriptorsClosed':closed,'cloexec':cloexec,'requestsAdmittedBeforeReplies':len(pending),'sharedCounter':counter,'inheritedSentinel':'G6_ONLY_PARENT_SYNTHETIC' in os.environ}))

if len(sys.argv)>1 and sys.argv[1]=='child':
    child(int(sys.argv[2]));raise SystemExit()

carrier,other=socket.socketpair(socket.AF_UNIX,socket.SOCK_SEQPACKET);carrier.settimeout(3)
os.environ['G6_ONLY_PARENT_SYNTHETIC']='synthetic-no-real-secret'
proc=subprocess.Popen([sys.executable,__file__,'child',str(other.fileno())],pass_fds=(other.fileno(),),stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env={'LANG':'C.UTF-8','TZ':'UTC'})
other.close();held=[]
try:
    pairs=[socket.socketpair() for _ in range(3)]
    held=[s for pair in pairs for s in pair]
    with tempfile.TemporaryFile() as regular:
        offers=[('a',[pairs[0][1].fileno()],True),('b',[pairs[1][1].fileno()],True),('extra',[pairs[2][0].fileno(),pairs[2][1].fileno()],False),('regular',[regular.fileno()],False)]
        for name,fds,expected in offers:
            body=json.dumps({'contextId':name,'descriptorCount':1}).encode()
            carrier.sendmsg([struct.pack('!I',len(body))+body],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',fds))])
            assert receive_packet(carrier)['accepted']==expected
    pairs[0][1].close();pairs[1][1].close()
    for name,s in [('a',pairs[0][0]),('b',pairs[1][0])]:s.settimeout(3);send(s,{'contextId':name,'op':'increment'})
    replies=[receive(pairs[0][0]),receive(pairs[1][0])]
    stdout,stderr=proc.communicate(timeout=5)
    assert proc.returncode==0,stderr
    result=json.loads(stdout)
    assert result['acceptedContexts']==2 and result['rejectedOffers']==2 and result['rejectedDescriptorsClosed']==3
    assert result['cloexec'] and not result['inheritedSentinel'] and result['requestsAdmittedBeforeReplies']==2
    assert [x['counter'] for x in replies]==[1,2]
    result['replies']=replies;result['passed']=True
    print(json.dumps(result,indent=2))
finally:
    for s in held:s.close()
    carrier.close()
    if proc.poll() is None:proc.kill();proc.wait()
