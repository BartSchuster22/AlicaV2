#define _GNU_SOURCE
#include <sys/socket.h>
#include <sys/un.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <sys/resource.h>
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <linux/audit.h>
#include <stddef.h>
#include <errno.h>
#include <linux/landlock.h>
#include <limits.h>
#include <sys/stat.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <stdint.h>
/* Stop io_uring creation before Node/libuv initialization, not after it exists. */
static int early_filter(void) {
 struct sock_filter f[]={
 BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch)),
 BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,AUDIT_ARCH_X86_64,1,0),
 BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
 BPF_STMT(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr)),
 BPF_JUMP(BPF_JMP|BPF_JGE|BPF_K,0x40000000,0,1),
 BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS),
 BPF_JUMP(BPF_JMP|BPF_JEQ|BPF_K,SYS_io_uring_setup,0,1),
 BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|ENOSYS),
 BPF_STMT(BPF_RET|BPF_K,SECCOMP_RET_ALLOW)};
 struct sock_fprog p={sizeof(f)/sizeof(f[0]),f};
 return (int)syscall(SYS_seccomp,SECCOMP_SET_MODE_FILTER,0,&p);
}
/* Inherited by EVERY Node/libuv thread. Post-thread Landlock alone is insufficient. */
static int filesystem(int count,char**paths) {
 if(syscall(SYS_landlock_create_ruleset,NULL,0,LANDLOCK_CREATE_RULESET_VERSION)<3)return -1;
 struct landlock_ruleset_attr attr={.handled_access_fs=(1ULL<<15)-1};
 int rules=(int)syscall(SYS_landlock_create_ruleset,&attr,sizeof(attr),0);if(rules<0)return -1;
 for(int i=0;i<count;i++) {
  char real[PATH_MAX];if(paths[i][0]!='/'||!realpath(paths[i],real)||!strcmp(real,"/")||!strcmp(real,"/home")||!strcmp(real,"/etc")||!strcmp(real,"/proc")){close(rules);return -1;}
  int fd=open(real,O_PATH|O_CLOEXEC);struct stat st;
  if(fd<0||fstat(fd,&st)){if(fd>=0)close(fd);close(rules);return -1;}
  struct landlock_path_beneath_attr rule={.allowed_access=LANDLOCK_ACCESS_FS_READ_FILE|LANDLOCK_ACCESS_FS_EXECUTE|(S_ISDIR(st.st_mode)?LANDLOCK_ACCESS_FS_READ_DIR:0),.parent_fd=fd};
  int rc=(int)syscall(SYS_landlock_add_rule,rules,LANDLOCK_RULE_PATH_BENEATH,&rule,0);close(fd);if(rc){close(rules);return -1;}
 }
 int rc=(int)syscall(SYS_landlock_restrict_self,rules,0);close(rules);return rc;
}
/* Operator-selected executable/worker; package/challenge bytes come only from sealed FDs. */
int main(int argc,char**argv){
 if(argc<5||argc>68||argv[1][0]!='/'||argv[2][0]!='/'||argv[3][0]!='/'||getuid()==0||geteuid()!=getuid()||getegid()!=getgid())return 120;
 struct stat st;if(stat(argv[1],&st)||!S_ISREG(st.st_mode)||(st.st_mode&06000))return 121;
 pid_t parent=getppid();if(parent<=1||prctl(PR_SET_PDEATHSIG,SIGKILL)||getppid()!=parent||prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0))return 122;
 const int seals=F_SEAL_SEAL|F_SEAL_SHRINK|F_SEAL_GROW|F_SEAL_WRITE;
 for(int f=4;f<=5;f++){int v=fcntl(f,F_GET_SEALS);if(v<0||(v&seals)!=seals)return 123;}
 int type;socklen_t size=sizeof(type);if(getsockopt(6,SOL_SOCKET,SO_TYPE,&type,&size)||type!=SOCK_SEQPACKET)return 124;
 struct sockaddr_un address={.sun_family=AF_UNIX};if(strlen(argv[3])>=sizeof(address.sun_path))return 125;strcpy(address.sun_path,argv[3]);
 int fd=socket(AF_UNIX,SOCK_STREAM|SOCK_CLOEXEC,0);if(fd<0||connect(fd,(struct sockaddr*)&address,sizeof(address)))return 126;
 if(fd!=3){if(dup2(fd,3)<0)return 127;close(fd);}for(int f=3;f<=6;f++)if(fcntl(f,F_SETFD,0))return 128;
 if(syscall(SYS_close_range,7U,UINT32_MAX,0))return 129;
 if(setpriority(PRIO_PROCESS,0,10)||early_filter()||filesystem(argc-4,argv+4))return 130;
 char pid[32];snprintf(pid,sizeof(pid),"%d",parent);
 char*args[]={argv[1],"--jitless","--max-old-space-size=64","--v8-pool-size=1","--experimental-vm-modules",argv[2],pid,NULL};
 char*env[]={"LANG=C.UTF-8","TZ=UTC","UV_THREADPOOL_SIZE=2","UV_USE_IO_URING=0","OPENSSL_CONF=/dev/null",NULL};
 execve(argv[1],args,env);return 131;
}
