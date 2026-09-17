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
  napi_create_function(env, "lockRoot", NAPI_AUTO_LENGTH, lock_root, NULL, &fn);
  napi_set_named_property(env, exports, "lockRoot", fn);
  napi_create_function(env, "adoptRoot", NAPI_AUTO_LENGTH, adopt_root, NULL, &fn);
  napi_set_named_property(env, exports, "adoptRoot", fn);
  napi_create_function(env, "guardParent", NAPI_AUTO_LENGTH, guard_parent, NULL, &fn);
  napi_set_named_property(env, exports, "guardParent", fn); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
