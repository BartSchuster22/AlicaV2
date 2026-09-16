#define _GNU_SOURCE
#include <node_api.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/syscall.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdatomic.h>
#include <stdio.h>

/* Private OS plumbing; no ACAP authorization or JSON interpretation here. */
typedef struct { int fd; int kind; } owned_fd;
static _Atomic int managed = 0;
static napi_value err(napi_env e, const char *op) {
  char msg[96]; snprintf(msg,sizeof(msg),"%s: errno=%d",op,errno);
  napi_throw_error(e,"NATIVE_IO",msg); return NULL;
}
#define N(call) do { if ((call)!=napi_ok) { napi_throw_error(e,"NATIVE_ARGUMENT","invalid native argument"); return NULL; } } while(0)
static napi_value number(napi_env e,int64_t n) { napi_value v; if(napi_create_int64(e,n,&v)!=napi_ok)return NULL; return v; }
static napi_value nil(napi_env e) { napi_value v; if(napi_get_null(e,&v)!=napi_ok)return NULL; return v; }
static void close_owned(owned_fd *o) { if(o->fd>=0) { close(o->fd);o->fd=-1;atomic_fetch_sub(&managed,1); } }
static void finalize(napi_env e,void *p,void *hint) { (void)e;(void)hint;owned_fd *o=p;close_owned(o);free(o); }
static napi_value own(napi_env e,int fd,int kind) {
  owned_fd *o=calloc(1,sizeof(*o)); if(!o){close(fd);errno=ENOMEM;return err(e,"allocate");}
  o->fd=fd;o->kind=kind;atomic_fetch_add(&managed,1);napi_value v;
  if(napi_create_external(e,o,finalize,NULL,&v)!=napi_ok){close_owned(o);free(o);napi_throw_error(e,"NATIVE_IO","external allocation");return NULL;}return v;
}
static owned_fd *get(napi_env e,napi_value v) {
  void *p=NULL;if(napi_get_value_external(e,v,&p)!=napi_ok||!p){napi_throw_error(e,"NATIVE_ARGUMENT","owned descriptor required");return NULL;}
  owned_fd *o=p;if(o->fd<0){napi_throw_error(e,"NATIVE_CLOSED","closed descriptor");return NULL;}return o;
}
static int socktype(int fd) { int n=0;socklen_t size=sizeof(n);if(getsockopt(fd,SOL_SOCKET,SO_TYPE,&n,&size))return -1;return n; }
static int nonblock(int fd) { int flags=fcntl(fd,F_GETFL);return flags<0?-1:fcntl(fd,F_SETFL,flags|O_NONBLOCK); }
static napi_value pair(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));int32_t type; if(n!=1){errno=EINVAL;return err(e,"pair");} N(napi_get_value_int32(e,a[0],&type));
 if(type!=SOCK_STREAM&&type!=SOCK_SEQPACKET){errno=EINVAL;return err(e,"socket type");}
 int fd[2];if(socketpair(AF_UNIX,type|SOCK_NONBLOCK|SOCK_CLOEXEC,0,fd))return err(e,"socketpair");
 napi_value v; if(napi_create_array_with_length(e,2,&v)!=napi_ok){close(fd[0]);close(fd[1]);return NULL;}
 napi_value x=own(e,fd[0],1);if(!x){close(fd[1]);return NULL;}napi_value y=own(e,fd[1],1);if(!y)return NULL;
 N(napi_set_element(e,v,0,x));N(napi_set_element(e,v,1,y));return v;
}
static napi_value closefd(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));void*p=NULL;
 if(n!=1||napi_get_value_external(e,a[0],&p)!=napi_ok||!p){errno=EINVAL;return err(e,"close");}close_owned(p);return nil(e);
}
static napi_value fileno_(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));if(n!=1){errno=EINVAL;return err(e,"fileno");}owned_fd*o=get(e,a[0]);return o?number(e,o->fd):NULL;
}
static napi_value adopt(napi_env e,napi_callback_info info) {
 size_t n=2;napi_value a[2];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));int32_t fd,type;
 if(n!=2){errno=EINVAL;return err(e,"adopt");}N(napi_get_value_int32(e,a[0],&fd));N(napi_get_value_int32(e,a[1],&type));
 if(fd<3||socktype(fd)!=type){errno=EINVAL;return err(e,"adopt socket");}
 if(nonblock(fd)||fcntl(fd,F_SETFD,FD_CLOEXEC))return err(e,"adopt flags");return own(e,fd,1);
}
static napi_value listen_(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));struct sockaddr_un u={.sun_family=AF_UNIX};size_t len;
 if(n!=1){errno=EINVAL;return err(e,"listen");}N(napi_get_value_string_utf8(e,a[0],NULL,0,&len));
 if(!len||len>=sizeof(u.sun_path)){errno=ENAMETOOLONG;return err(e,"socket path");}N(napi_get_value_string_utf8(e,a[0],u.sun_path,sizeof(u.sun_path),&len));
 if(strlen(u.sun_path)!=len){errno=EINVAL;return err(e,"socket path NUL");}
 int fd=socket(AF_UNIX,SOCK_STREAM|SOCK_NONBLOCK|SOCK_CLOEXEC,0);if(fd<0)return err(e,"socket");
 /* Never unlink an existing path. Caller owns the private directory. */
 if(bind(fd,(struct sockaddr*)&u,sizeof(u))||chmod(u.sun_path,0600)||listen(fd,8)){int x=errno;close(fd);errno=x;return err(e,"listen");}return own(e,fd,1);
}
static napi_value accept_(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));if(n!=1){errno=EINVAL;return err(e,"accept");}owned_fd*o=get(e,a[0]);if(!o)return NULL;
 int fd=accept4(o->fd,NULL,NULL,SOCK_NONBLOCK|SOCK_CLOEXEC);if(fd<0){if(errno==EAGAIN||errno==EWOULDBLOCK)return nil(e);return err(e,"accept");}return own(e,fd,1);
}
static napi_value credentials(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));if(n!=1){errno=EINVAL;return err(e,"credentials");}owned_fd*o=get(e,a[0]);if(!o)return NULL;
 struct ucred c;socklen_t size=sizeof(c);if(getsockopt(o->fd,SOL_SOCKET,SO_PEERCRED,&c,&size)||size!=sizeof(c))return err(e,"SO_PEERCRED");napi_value v;N(napi_create_object(e,&v));N(napi_set_named_property(e,v,"pid",number(e,c.pid)));N(napi_set_named_property(e,v,"uid",number(e,c.uid)));N(napi_set_named_property(e,v,"gid",number(e,c.gid)));return v;
}
static napi_value poll_(napi_env e,napi_callback_info info) {
 size_t n=2;napi_value a[2];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));uint32_t len;int32_t timeout;
 if(n!=2){errno=EINVAL;return err(e,"poll");}N(napi_get_array_length(e,a[0],&len));N(napi_get_value_int32(e,a[1],&timeout));if(len>64||timeout<0||timeout>30000){errno=EINVAL;return err(e,"poll bounds");}
 struct pollfd p[64];for(uint32_t i=0;i<len;i++){napi_value v;N(napi_get_element(e,a[0],i,&v));owned_fd*o=get(e,v);if(!o)return NULL;p[i]=(struct pollfd){.fd=o->fd,.events=POLLIN};}
 int rc=poll(p,len,timeout);if(rc<0&&errno!=EINTR)return err(e,"poll");napi_value out;N(napi_create_array_with_length(e,len,&out));for(uint32_t i=0;i<len;i++)N(napi_set_element(e,out,i,number(e,rc<0?0:p[i].revents)));return out;
}
static napi_value read_(napi_env e,napi_callback_info info) {
 size_t n=2;napi_value a[2];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));int32_t cap;
 if(n!=2){errno=EINVAL;return err(e,"read");}owned_fd*o=get(e,a[0]);if(!o)return NULL;N(napi_get_value_int32(e,a[1],&cap));if(cap<1||cap>1048576){errno=EINVAL;return err(e,"read bounds");}
 char *buf=malloc((size_t)cap);if(!buf){errno=ENOMEM;return err(e,"read allocate");}ssize_t got=read(o->fd,buf,(size_t)cap);
 if(got<0){int code=errno;free(buf);if(code==EAGAIN||code==EWOULDBLOCK||code==EINTR)return nil(e);errno=code;return err(e,"read");}
 napi_value v;napi_status status=napi_create_buffer_copy(e,(size_t)got,buf,NULL,&v);free(buf);N(status);return v;
}
static napi_value write_(napi_env e,napi_callback_info info) {
 size_t n=2;napi_value a[2];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));void*data;size_t len;if(n!=2){errno=EINVAL;return err(e,"write");}owned_fd*o=get(e,a[0]);if(!o)return NULL;N(napi_get_buffer_info(e,a[1],&data,&len));if(len>1048580){errno=EINVAL;return err(e,"write bounds");}
 /* Node ignores SIGPIPE; descriptors are nonblocking. No sendto permission needed. */
 ssize_t sent=write(o->fd,data,len);if(sent<0){if(errno==EAGAIN||errno==EWOULDBLOCK||errno==EINTR)return number(e,0);return err(e,"write");}return number(e,sent);
}
static napi_value send_offer(napi_env e,napi_callback_info info) {
 size_t n=3;napi_value a[3];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));void*data;size_t len;if(n!=3){errno=EINVAL;return err(e,"offer");}owned_fd*c=get(e,a[0]);if(!c)return NULL;owned_fd*f=get(e,a[2]);if(!f)return NULL;N(napi_get_buffer_info(e,a[1],&data,&len));
 if(!len||len>4096||socktype(c->fd)!=SOCK_SEQPACKET||socktype(f->fd)!=SOCK_STREAM){errno=EINVAL;return err(e,"offer types/bounds");}
 struct iovec io={data,len};union{struct cmsghdr align;char bytes[CMSG_SPACE(sizeof(int))];} control={0};struct msghdr msg={.msg_iov=&io,.msg_iovlen=1,.msg_control=control.bytes,.msg_controllen=sizeof(control.bytes)};
 struct cmsghdr*h=CMSG_FIRSTHDR(&msg);h->cmsg_level=SOL_SOCKET;h->cmsg_type=SCM_RIGHTS;h->cmsg_len=CMSG_LEN(sizeof(int));memcpy(CMSG_DATA(h),&f->fd,sizeof(int));
 ssize_t sent=sendmsg(c->fd,&msg,MSG_DONTWAIT|MSG_NOSIGNAL);if(sent<0){if(errno==EAGAIN||errno==EWOULDBLOCK||errno==EINTR)return number(e,0);return err(e,"sendmsg");}if((size_t)sent!=len){errno=EIO;return err(e,"partial packet");}return number(e,sent);
}
static napi_value recv_offer(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));if(n!=1){errno=EINVAL;return err(e,"receive offer");}owned_fd*c=get(e,a[0]);if(!c)return NULL;if(socktype(c->fd)!=SOCK_SEQPACKET){errno=EINVAL;return err(e,"carrier type");}
 char data[4097];union{struct cmsghdr align;char bytes[CMSG_SPACE(sizeof(int)*64)];} control={0};struct iovec io={data,sizeof(data)};struct msghdr msg={.msg_iov=&io,.msg_iovlen=1,.msg_control=control.bytes,.msg_controllen=sizeof(control.bytes)};
 ssize_t got=recvmsg(c->fd,&msg,MSG_CMSG_CLOEXEC|MSG_DONTWAIT);if(got<0){if(errno==EAGAIN||errno==EWOULDBLOCK||errno==EINTR)return nil(e);return err(e,"recvmsg");}
 int fd[64],count=0,bad=(got<=0||got>4096||(msg.msg_flags&(MSG_TRUNC|MSG_CTRUNC)));
 for(struct cmsghdr*h=CMSG_FIRSTHDR(&msg);h;h=CMSG_NXTHDR(&msg,h)){
  if(h->cmsg_level!=SOL_SOCKET||h->cmsg_type!=SCM_RIGHTS||h->cmsg_len<CMSG_LEN(0)){bad=1;continue;}
  size_t bytes=h->cmsg_len-CMSG_LEN(0);if(bytes%sizeof(int))bad=1;
  for(size_t j=0;j<bytes/sizeof(int);j++){int f;memcpy(&f,(char*)CMSG_DATA(h)+j*sizeof(int),sizeof(f));if(count<64)fd[count++]=f;else{close(f);bad=1;}}
 }
 if(count!=1)bad=1;
 if(!bad){int domain;socklen_t size=sizeof(domain);if(socktype(fd[0])!=SOCK_STREAM||getsockopt(fd[0],SOL_SOCKET,SO_DOMAIN,&domain,&size)||domain!=AF_UNIX||nonblock(fd[0]))bad=1;}
 if(bad){for(int j=0;j<count;j++)close(fd[j]);errno=EPROTO;return err(e,"rejected ancillary packet");}
 napi_value out,buf;if(napi_create_object(e,&out)!=napi_ok||napi_create_buffer_copy(e,(size_t)got,data,NULL,&buf)!=napi_ok){close(fd[0]);return NULL;}napi_value handle=own(e,fd[0],1);if(!handle)return NULL;N(napi_set_named_property(e,out,"data",buf));N(napi_set_named_property(e,out,"handle",handle));return out;
}
static napi_value pidfd_open_(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));int32_t pid;if(n!=1){errno=EINVAL;return err(e,"pidfd");}N(napi_get_value_int32(e,a[0],&pid));if(pid<=0){errno=EINVAL;return err(e,"pidfd pid");}int fd=syscall(SYS_pidfd_open,pid,0);if(fd<0)return err(e,"pidfd_open");return own(e,fd,2);
}
static napi_value signal_(napi_env e,napi_callback_info info) {
 size_t n=2;napi_value a[2];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));if(n!=2){errno=EINVAL;return err(e,"signal");}owned_fd*o=get(e,a[0]);if(!o)return NULL;int32_t sig;N(napi_get_value_int32(e,a[1],&sig));if(o->kind!=2||(sig!=SIGTERM&&sig!=SIGKILL&&sig!=0)){errno=EINVAL;return err(e,"signal type");}if(syscall(SYS_pidfd_send_signal,o->fd,sig,NULL,0))return err(e,"pidfd_send_signal");return nil(e);
}
static napi_value memfd_(napi_env e,napi_callback_info info) {
 size_t n=1;napi_value a[1];N(napi_get_cb_info(e,info,&n,a,NULL,NULL));void*data;size_t len;if(n!=1){errno=EINVAL;return err(e,"capsule");}N(napi_get_buffer_info(e,a[0],&data,&len));if(len>16777216){errno=EINVAL;return err(e,"capsule size");}
 int fd=syscall(SYS_memfd_create,"g6-sealed",MFD_CLOEXEC|MFD_ALLOW_SEALING);if(fd<0)return err(e,"memfd");size_t pos=0;
 while(pos<len){ssize_t x=write(fd,(char*)data+pos,len-pos);if(x<0&&errno==EINTR)continue;if(x<=0){close(fd);return err(e,"capsule write");}pos+=(size_t)x;}
 if(fcntl(fd,F_ADD_SEALS,F_SEAL_WRITE|F_SEAL_GROW|F_SEAL_SHRINK|F_SEAL_SEAL)||lseek(fd,0,SEEK_SET)<0){close(fd);return err(e,"capsule seal");}return own(e,fd,3);
}
static napi_value stats(napi_env e,napi_callback_info info) { (void)info;return number(e,atomic_load(&managed)); }
extern napi_value g6_seal(napi_env,napi_callback_info);
NAPI_MODULE_INIT() {
 napi_env e=env;
 struct {const char*name;napi_callback function;} methods[]={
  {"pair",pair},{"close",closefd},{"fileno",fileno_},{"adopt",adopt},{"listen",listen_},{"accept",accept_},{"credentials",credentials},{"poll",poll_},{"read",read_},{"write",write_},{"sendOffer",send_offer},{"receiveOffer",recv_offer},{"pidfdOpen",pidfd_open_},{"signal",signal_},{"memfd",memfd_},{"managed",stats},{"seal",g6_seal}};
 for(size_t i=0;i<sizeof(methods)/sizeof(methods[0]);i++){napi_value f;N(napi_create_function(e,methods[i].name,NAPI_AUTO_LENGTH,methods[i].function,NULL,&f));N(napi_set_named_property(e,exports,methods[i].name,f));}return exports;
}
