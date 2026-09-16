#define _GNU_SOURCE
#include <node_api.h>
#include <sys/syscall.h>
#include <sys/prctl.h>
#include <sys/resource.h>
#include <sys/stat.h>
#include <linux/landlock.h>
#include <linux/seccomp.h>
#include <linux/filter.h>
#include <linux/audit.h>
#include <stddef.h>
#include <stdint.h>
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#include <limits.h>
#include <errno.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>

static napi_value failure(napi_env e,const char *step) { char b[96];snprintf(b,sizeof(b),"%s: errno=%d",step,errno);napi_throw_error(e,"SANDBOX_UNAVAILABLE",b);return NULL; }
static int limits(void) {
 const struct { int which;rlim_t value; } limits[]={{RLIMIT_NOFILE,64},{RLIMIT_CORE,0},{RLIMIT_FSIZE,0},{RLIMIT_DATA,512ULL*1024*1024},{RLIMIT_CPU,120}};
 for(size_t i=0;i<sizeof(limits)/sizeof(limits[0]);i++){struct rlimit l={limits[i].value,limits[i].value};if(setrlimit(limits[i].which,&l))return -1;}return 0;
}
static int filter(int carrier) {
 struct sock_filter p[240];size_t n=0;
 #define S(code,k) (p[n++]=(struct sock_filter)BPF_STMT(code,k))
 #define J(code,k,t,f) (p[n++]=(struct sock_filter)BPF_JUMP(code,k,t,f))
 S(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,arch));
 J(BPF_JMP|BPF_JEQ|BPF_K,AUDIT_ARCH_X86_64,1,0);S(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS);
 S(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,nr));
 J(BPF_JMP|BPF_JGE|BPF_K,0x40000000,0,1);S(BPF_RET|BPF_K,SECCOMP_RET_KILL_PROCESS);
 const int denied[]={SYS_socket,SYS_socketpair,SYS_connect,SYS_bind,SYS_listen,SYS_accept,SYS_accept4,
 SYS_sendmsg,SYS_sendmmsg,SYS_sendto,SYS_recvfrom,SYS_recvmmsg,SYS_setsockopt,
 SYS_clone,SYS_clone3,SYS_fork,SYS_vfork,SYS_execve,SYS_execveat,
 SYS_ptrace,SYS_process_vm_readv,SYS_process_vm_writev,SYS_pidfd_open,SYS_pidfd_getfd,SYS_pidfd_send_signal,
 SYS_kill,SYS_tkill,SYS_tgkill,SYS_rt_sigqueueinfo,SYS_rt_tgsigqueueinfo,
 SYS_io_uring_setup,SYS_io_uring_enter,SYS_io_uring_register,SYS_userfaultfd,SYS_bpf,SYS_perf_event_open,
 SYS_open_by_handle_at,SYS_name_to_handle_at,SYS_mount,SYS_umount2,SYS_pivot_root,SYS_chroot,
 SYS_open_tree,SYS_move_mount,SYS_fsopen,SYS_fsconfig,SYS_fsmount,SYS_fspick,SYS_mount_setattr,
 SYS_setns,SYS_unshare,SYS_prctl,SYS_seccomp,SYS_personality,SYS_setrlimit,SYS_prlimit64,
 SYS_setpriority,SYS_setpgid,SYS_setsid,SYS_reboot,SYS_kexec_load,SYS_kexec_file_load,
 SYS_init_module,SYS_finit_module,SYS_delete_module,SYS_swapon,SYS_swapoff,SYS_process_madvise,SYS_process_mrelease};
 for(size_t i=0;i<sizeof(denied)/sizeof(denied[0]);i++){J(BPF_JMP|BPF_JEQ|BPF_K,(uint32_t)denied[i],0,1);S(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM);}
 /* Receiving rights is possible only on the inherited packet carrier. */
 J(BPF_JMP|BPF_JEQ|BPF_K,SYS_recvmsg,0,5);
 S(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[0]));
 J(BPF_JMP|BPF_JEQ|BPF_K,(uint32_t)carrier,0,2);
 S(BPF_LD|BPF_W|BPF_ABS,offsetof(struct seccomp_data,args[0])+4);
 J(BPF_JMP|BPF_JEQ|BPF_K,0,1,0);
 S(BPF_RET|BPF_K,SECCOMP_RET_ERRNO|EPERM);
 S(BPF_RET|BPF_K,SECCOMP_RET_ALLOW);
 struct sock_fprog prog={(unsigned short)n,p};
 return (int)syscall(SYS_seccomp,SECCOMP_SET_MODE_FILTER,SECCOMP_FILTER_FLAG_TSYNC,&prog);
}
napi_value g6_seal(napi_env e,napi_callback_info info) {
 size_t n=3;napi_value a[3];uint32_t count;int32_t carrier,parent;
 if(napi_get_cb_info(e,info,&n,a,NULL,NULL)!=napi_ok||n!=3||napi_get_array_length(e,a[0],&count)!=napi_ok||count>64||napi_get_value_int32(e,a[1],&carrier)!=napi_ok||carrier!=6||napi_get_value_int32(e,a[2],&parent)!=napi_ok||parent<=0){errno=EINVAL;return failure(e,"seal arguments");}
 if(getuid()==0||geteuid()!=getuid()||getegid()!=getgid()||getppid()!=parent){errno=EPERM;return failure(e,"identity");}
 if(prctl(PR_SET_PDEATHSIG,SIGKILL)||getppid()!=parent||prctl(PR_SET_DUMPABLE,0)||prctl(PR_SET_NO_NEW_PRIVS,1,0,0,0)||limits())return failure(e,"process constraints");
 int abi=(int)syscall(SYS_landlock_create_ruleset,NULL,0,LANDLOCK_CREATE_RULESET_VERSION);if(abi<3){errno=ENOTSUP;return failure(e,"Landlock ABI");}
 struct landlock_ruleset_attr attr={.handled_access_fs=(1ULL<<15)-1};
 int rules=(int)syscall(SYS_landlock_create_ruleset,&attr,sizeof(attr),0);if(rules<0)return failure(e,"ruleset");
 for(uint32_t i=0;i<count;i++){
  napi_value v;char path[PATH_MAX],resolved[PATH_MAX];size_t len;
  if(napi_get_element(e,a[0],i,&v)!=napi_ok||napi_get_value_string_utf8(e,v,NULL,0,&len)!=napi_ok||!len||len>=sizeof(path)||napi_get_value_string_utf8(e,v,path,sizeof(path),&len)!=napi_ok||strlen(path)!=len||path[0]!='/'||!realpath(path,resolved)||!strcmp(resolved,"/")||!strcmp(resolved,"/home")||!strcmp(resolved,"/etc")||!strcmp(resolved,"/proc")){close(rules);errno=EINVAL;return failure(e,"read closure");}
  int fd=open(resolved,O_PATH|O_CLOEXEC);struct stat st;if(fd<0||fstat(fd,&st)){if(fd>=0)close(fd);close(rules);return failure(e,"read path");}
  struct landlock_path_beneath_attr rule={.allowed_access=LANDLOCK_ACCESS_FS_READ_FILE|(S_ISDIR(st.st_mode)?LANDLOCK_ACCESS_FS_READ_DIR:0),.parent_fd=fd};
  int rc=(int)syscall(SYS_landlock_add_rule,rules,LANDLOCK_RULE_PATH_BENEATH,&rule,0);close(fd);if(rc){close(rules);return failure(e,"read rule");}
 }
 int rc=(int)syscall(SYS_landlock_restrict_self,rules,0);close(rules);if(rc)return failure(e,"filesystem seal");
 /* Positive TSYNC returns identify a failed thread: never treat those as success. */
 if(filter(carrier)!=0)return failure(e,"seccomp TSYNC");
 napi_value result;if(napi_create_int32(e,abi,&result)!=napi_ok)return NULL;return result;
}
