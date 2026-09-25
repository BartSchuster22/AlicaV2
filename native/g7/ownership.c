/* Host-only Linux ownership primitive. No path opening, PID files or plugins. */
#define _GNU_SOURCE
#include <node_api.h>
#include <fcntl.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
#include <sys/socket.h>
#include <sys/prctl.h>
#include <signal.h>
#include <sys/syscall.h>
#include <string.h>
#include <poll.h>
#include <pthread.h>
#include <stdlib.h>
#include <stdint.h>
#include <sys/eventfd.h>

/* Containment ONLY, never a stopped/reap/custody certificate. A native thread
 * observes a duplicated exact-child pidfd even when JS is blocked. GC cannot
 * disarm it. The lexical caller may disarm only after its protected work ends;
 * child death takes precedence over simultaneous disarm. */
struct child_containment {
  int child, stop, active;
  pthread_t thread;
};
static const napi_type_tag containment_tag = {0x6737636f6e746169ULL, 0x6d656e7476310001ULL};
static void *contain_child(void *arg) {
  struct child_containment *g = arg;
  struct pollfd fds[2] = {{g->child, POLLIN, 0}, {g->stop, POLLIN, 0}};
  int n;
  do { n = poll(fds, 2, -1); } while (n < 0 && errno == EINTR);
  if (n > 0 && !fds[0].revents && fds[1].revents == POLLIN) {
    /* Recheck the child rather than selecting cancellation over a ready death. */
    struct pollfd child = {g->child, POLLIN, 0};
    do { n = poll(&child, 1, 0); } while (n < 0 && errno == EINTR);
    if (n == 0) return NULL;
  }
  /* Do not run JS callbacks, release locks or claim cleanup on watch loss. */
  kill(getpid(), SIGKILL);
  _exit(127);
}
static void containment_gc(napi_env env, void *data, void *hint) {
  (void)env; (void)hint;
  struct child_containment *g = data;
  /* Dropping the JS token is NOT release authority. Keep the armed watcher. */
  if (!g->active) free(g);
}
static napi_value arm_containment(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], result; int32_t fd;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid watch"); return NULL;
  }
  struct child_containment *g = calloc(1, sizeof(*g));
  if (!g) { napi_throw_error(env, "INTERNAL", "Watch unavailable"); return NULL; }
  g->child = fcntl(fd, F_DUPFD_CLOEXEC, 3);
  g->stop = eventfd(0, EFD_CLOEXEC | EFD_NONBLOCK);
  if (g->child < 0 || g->stop < 0) goto fail;
  if (napi_create_object(env, &result) != napi_ok ||
      napi_type_tag_object(env, result, &containment_tag) != napi_ok ||
      napi_wrap(env, result, g, containment_gc, NULL, NULL) != napi_ok) goto fail;
  g->active = 1;
  if (pthread_create(&g->thread, NULL, contain_child, g)) {
    /* No thread exists. The successful wrap still owns g: do not free it
     * behind a finalizer if removing the wrap were to fail. */
    close(g->child); close(g->stop); g->active = 0;
    napi_throw_error(env, "INTERNAL", "Watch unavailable"); return NULL;
  }
  return result;
fail:
  if (g->child >= 0) close(g->child);
  if (g->stop >= 0) close(g->stop);
  free(g);
  napi_throw_error(env, "INTERNAL", "Watch unavailable"); return NULL;
}
static napi_value end_containment(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], result; bool tagged = false;
  struct child_containment *g = NULL;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_check_object_type_tag(env, args[0], &containment_tag, &tagged) != napi_ok || !tagged ||
      napi_unwrap(env, args[0], (void **)&g) != napi_ok || !g || !g->active) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid watch release"); return NULL;
  }
  uint64_t one = 1;
  if (write(g->stop, &one, sizeof(one)) != sizeof(one) || pthread_join(g->thread, NULL)) {
    kill(getpid(), SIGKILL); _exit(127);
  }
  close(g->child); close(g->stop); g->active = 0;
  napi_get_undefined(env, &result); return result;
}

/* Private anonymous packet channels. Per-message credentials, not the socketpair
 * creator's SO_PEERCRED, authenticate the exact spawned child. No PID is an
 * authority: callers hold its pidfd and require the child_process normal reap. */
static napi_value packet_pair(napi_env env, napi_callback_info info) {
  (void)info;
  int fds[2], enabled = 1;
  if (socketpair(AF_UNIX, SOCK_SEQPACKET | SOCK_NONBLOCK | SOCK_CLOEXEC, 0, fds)) {
    napi_throw_error(env, "INTERNAL", "Channel unavailable"); return NULL;
  }
  if (setsockopt(fds[0], SOL_SOCKET, SO_PASSCRED, &enabled, sizeof(enabled)) ||
      setsockopt(fds[1], SOL_SOCKET, SO_PASSCRED, &enabled, sizeof(enabled))) {
    close(fds[0]); close(fds[1]);
    napi_throw_error(env, "INTERNAL", "Credentials unavailable"); return NULL;
  }
  napi_value result, v; napi_create_array_with_length(env, 2, &result);
  for (int i = 0; i < 2; i++) {
    napi_create_int32(env, fds[i], &v); napi_set_element(env, result, i, v);
  }
  return result;
}
static napi_value packet_send(napi_env env, napi_callback_info info) {
  size_t count = 2, length; napi_value args[2], result; int32_t fd; void *data;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 2 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok ||
      napi_get_buffer_info(env, args[1], &data, &length) != napi_ok ||
      !length || length > 65536 || send(fd, data, length, MSG_NOSIGNAL) != (ssize_t)length) {
    napi_throw_error(env, "PERMISSION_DENIED", "Packet unavailable"); return NULL;
  }
  napi_get_undefined(env, &result); return result;
}
static napi_value packet_receive(napi_env env, napi_callback_info info) {
  size_t count = 2; napi_value args[2], result; int32_t fd, expected;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 2 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok ||
      napi_get_value_int32(env, args[1], &expected) != napi_ok || expected <= 1) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid channel"); return NULL;
  }
  char data[65536];
  union { struct cmsghdr align; char bytes[CMSG_SPACE(sizeof(struct ucred))]; } control;
  struct iovec iov = {data, sizeof(data)};
  struct msghdr msg = {0}; msg.msg_iov = &iov; msg.msg_iovlen = 1;
  msg.msg_control = control.bytes; msg.msg_controllen = sizeof(control.bytes);
  ssize_t n = recvmsg(fd, &msg, MSG_DONTWAIT | MSG_CMSG_CLOEXEC);
  if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) {
    napi_get_null(env, &result); return result;
  }
  if (n < 0) {
    napi_throw_error(env, "PERMISSION_DENIED", "Closed channel"); return NULL;
  }
  struct cmsghdr *c = CMSG_FIRSTHDR(&msg); struct ucred peer;
  /* CLOEXEC is echoed in msg_flags on Linux; truncation and all other flags
   * remain fatal. Close any received rights even though rights never authorize. */
  for (struct cmsghdr *extra = CMSG_FIRSTHDR(&msg); extra; extra = CMSG_NXTHDR(&msg, extra)) {
    if (extra->cmsg_level == SOL_SOCKET && extra->cmsg_type == SCM_RIGHTS &&
        extra->cmsg_len >= CMSG_LEN(0)) {
      size_t rights = (extra->cmsg_len - CMSG_LEN(0)) / sizeof(int);
      for (size_t i = 0; i < rights; i++) {
        int received; memcpy(&received, (char *)CMSG_DATA(extra) + i * sizeof(int), sizeof(int));
        close(received);
      }
    }
  }
  if (n <= 0 || (msg.msg_flags & ~MSG_CMSG_CLOEXEC) || !c || c->cmsg_level != SOL_SOCKET ||
      c->cmsg_type != SCM_CREDENTIALS || c->cmsg_len != CMSG_LEN(sizeof(peer)) ||
      CMSG_NXTHDR(&msg, c)) {
    napi_throw_error(env, "PERMISSION_DENIED", "Unauthenticated packet"); return NULL;
  }
  memcpy(&peer, CMSG_DATA(c), sizeof(peer));
  if (peer.pid != expected || peer.uid != getuid() || peer.gid != getgid()) {
    napi_throw_error(env, "PERMISSION_DENIED", "Unowned sender"); return NULL;
  }
  napi_create_buffer_copy(env, n, data, NULL, &result); return result;
}
static napi_value child_pidfd(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], result; int32_t pid;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_int32(env, args[0], &pid) != napi_ok || pid <= 1) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid child"); return NULL;
  }
  int fd = syscall(SYS_pidfd_open, pid, 0);
  if (fd < 0) { napi_throw_error(env, "PERMISSION_DENIED", "Child unavailable"); return NULL; }
  napi_create_int32(env, fd, &result); return result;
}
static napi_value pidfd_dead(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], result; int32_t fd;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid child"); return NULL;
  }
  struct pollfd p = {fd, POLLIN, 0}; int n = poll(&p, 1, 0);
  if (n < 0 || (p.revents & (POLLERR | POLLNVAL))) {
    napi_throw_error(env, "PERMISSION_DENIED", "Child unavailable"); return NULL;
  }
  napi_get_boolean(env, n != 0, &result); return result;
}
static napi_value guard_launcher(napi_env env, napi_callback_info info) {
  (void)info;
  pid_t parent = getppid(); int fd = -1;
  if (parent <= 1 || (fd = syscall(SYS_pidfd_open, parent, 0)) < 0 ||
      prctl(PR_SET_PDEATHSIG, SIGKILL, 0, 0, 0) || getppid() != parent) {
    if (fd >= 0) close(fd);
    napi_throw_error(env, "PERMISSION_DENIED", "Parent unavailable"); return NULL;
  }
  napi_value result; napi_create_int32(env, fd, &result); return result;
}
static napi_value lock_root(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], result; int32_t fd; struct stat s;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok || fstat(fd, &s) ||
      !S_ISDIR(s.st_mode) || s.st_uid != getuid() || (s.st_mode & 07777) != 0700) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid private root"); return NULL;
  }
  if (flock(fd, LOCK_EX | LOCK_NB)) {
    napi_throw_error(env, errno == EWOULDBLOCK ? "CONFLICT" : "INTERNAL", "Ownership unavailable"); return NULL;
  }
  napi_get_boolean(env, 1, &result); return result;
}
/* Inheritance retains the SAME open-file-description lock. Never LOCK_UN it.
 * A separately opened description must conflict before adoption. */
static napi_value adopt_root(napi_env env, napi_callback_info info) {
  size_t count = 2; napi_value args[2], result; int32_t held, checked;
  struct stat a, b;
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 2 ||
      napi_get_value_int32(env, args[0], &held) != napi_ok ||
      napi_get_value_int32(env, args[1], &checked) != napi_ok ||
      fstat(held, &a) || fstat(checked, &b) || !S_ISDIR(a.st_mode) ||
      a.st_uid != getuid() || (a.st_mode & 07777) != 0700 ||
      a.st_dev != b.st_dev || a.st_ino != b.st_ino) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid custody"); return NULL;
  }
  int probe = openat(held, ".", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (probe < 0) {
    napi_throw_error(env, "PERMISSION_DENIED", "Invalid custody"); return NULL;
  }
  int locked = flock(probe, LOCK_EX | LOCK_NB), saved = errno;
  close(probe);
  if (locked == 0 || saved != EWOULDBLOCK || flock(held, LOCK_EX | LOCK_NB)) {
    napi_throw_error(env, "PERMISSION_DENIED", "Custody not held"); return NULL;
  }
  int fd = fcntl(held, F_DUPFD_CLOEXEC, 3);
  if (fd < 0) { napi_throw_error(env, "INTERNAL", "Custody unavailable"); return NULL; }
  napi_create_int32(env, fd, &result); return result;
}
/* The inherited socketpair identifies its creator, not a caller-supplied PID.
 * Arm kernel parent-death delivery before accepting custody; recheck the parent
 * to close the race where it exited before PR_SET_PDEATHSIG was installed.
 * SIGKILL remains no proof of descendant reap or completed filesystem IO. */
static napi_value guard_parent(napi_env env, napi_callback_info info) {
  size_t count = 1; napi_value args[1], result; int32_t fd;
  struct ucred peer; socklen_t length = sizeof(peer);
  if (napi_get_cb_info(env, info, &count, args, NULL, NULL) != napi_ok || count != 1 ||
      napi_get_value_int32(env, args[0], &fd) != napi_ok ||
      getsockopt(fd, SOL_SOCKET, SO_PEERCRED, &peer, &length) ||
      length != sizeof(peer) || peer.uid != getuid() || peer.pid <= 1 ||
      getppid() != peer.pid || prctl(PR_SET_PDEATHSIG, SIGKILL, 0, 0, 0) ||
      getppid() != peer.pid) {
    napi_throw_error(env, "PERMISSION_DENIED", "Supervisor parent unavailable"); return NULL;
  }
  napi_get_boolean(env, 1, &result); return result;
}
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "armChildContainment", NAPI_AUTO_LENGTH, arm_containment, NULL, &fn);
  napi_set_named_property(env, exports, "armChildContainment", fn);
  napi_create_function(env, "endChildContainment", NAPI_AUTO_LENGTH, end_containment, NULL, &fn);
  napi_set_named_property(env, exports, "endChildContainment", fn);
  napi_create_function(env, "lockRoot", NAPI_AUTO_LENGTH, lock_root, NULL, &fn);
  napi_set_named_property(env, exports, "lockRoot", fn);
  napi_create_function(env, "adoptRoot", NAPI_AUTO_LENGTH, adopt_root, NULL, &fn);
  napi_set_named_property(env, exports, "adoptRoot", fn);
  napi_create_function(env, "guardParent", NAPI_AUTO_LENGTH, guard_parent, NULL, &fn);
  napi_set_named_property(env, exports, "guardParent", fn);
  napi_create_function(env, "packetPair", NAPI_AUTO_LENGTH, packet_pair, NULL, &fn);
  napi_set_named_property(env, exports, "packetPair", fn);
  napi_create_function(env, "packetSend", NAPI_AUTO_LENGTH, packet_send, NULL, &fn);
  napi_set_named_property(env, exports, "packetSend", fn);
  napi_create_function(env, "packetReceive", NAPI_AUTO_LENGTH, packet_receive, NULL, &fn);
  napi_set_named_property(env, exports, "packetReceive", fn);
  napi_create_function(env, "childPidfd", NAPI_AUTO_LENGTH, child_pidfd, NULL, &fn);
  napi_set_named_property(env, exports, "childPidfd", fn);
  napi_create_function(env, "pidfdDead", NAPI_AUTO_LENGTH, pidfd_dead, NULL, &fn);
  napi_set_named_property(env, exports, "pidfdDead", fn);
  napi_create_function(env, "guardLauncher", NAPI_AUTO_LENGTH, guard_launcher, NULL, &fn);
  napi_set_named_property(env, exports, "guardLauncher", fn); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
