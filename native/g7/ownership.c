/* Host-only Linux ownership primitive. No path opening, PID files or plugins. */
#include <node_api.h>
#include <sys/file.h>
#include <sys/stat.h>
#include <unistd.h>
#include <errno.h>
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
static napi_value init(napi_env env, napi_value exports) {
  napi_value fn;
  napi_create_function(env, "lockRoot", NAPI_AUTO_LENGTH, lock_root, NULL, &fn);
  napi_set_named_property(env, exports, "lockRoot", fn); return exports;
}
NAPI_MODULE(NODE_GYP_MODULE_NAME, init)
