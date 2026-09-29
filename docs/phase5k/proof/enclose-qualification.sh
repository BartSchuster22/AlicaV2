#!/bin/bash
set -eu
R=/opt/alica-phase5k/root
mount --make-rprivate /
mount --bind "$R" "$R"
for p in usr bin lib lib64; do
 mount --bind /$p "$R/$p"
 mount -o remount,bind,ro,nosuid,nodev "$R/$p"
done
mount -t proc -o nosuid,nodev,noexec proc "$R/proc"
mount -t tmpfs -o size=16m,nosuid,noexec tmpfs "$R/dev"
for d in null zero random urandom; do touch "$R/dev/$d"; mount --bind /dev/$d "$R/dev/$d"; done
for pair in state:512m tmp:256m run:16m home:16m; do p=${pair%:*}; size=${pair#*:}; mount -t tmpfs -o size=$size,nosuid,nodev tmpfs "$R/$p"; chmod 1777 "$R/$p"; done
mount --bind /opt/alica-phase5k/evidence/runtime "$R/evidence"
ip link set lo up
mount -o remount,bind,ro,nosuid,nodev "$R"
cd "$R"
ulimit -c 0
ulimit -n 256
ulimit -u 96
ulimit -f 131072
exec env -i PATH=/usr/bin:/bin HOME=/state/user HERMES_HOME=/state/hermes PYTHONDONTWRITEBYTECODE=1 HERMES_GUEST_ONBOARDING=0 /usr/sbin/chroot "$R" /usr/bin/setpriv --reuid=65534 --regid=65534 --clear-groups --inh-caps=-all --ambient-caps=-all --bounding-set=-all --no-new-privs /opt/venv/bin/python /opt/phase5k/qualification.py
