set -eu
B=/opt/alica-phase5k
exec > >(tee "$B/evidence/alica-prepare.log") 2>&1
mkdir -p "$B/root/opt/node" "$B/root/opt/alica"
sha256sum /home/alica-dev/AlicaV2/.tools/node.tar.xz
tar -xJf /home/alica-dev/AlicaV2/.tools/node.tar.xz --strip-components=1 -C "$B/root/opt/node"
runuser -u alica-dev -- git -C /home/alica-dev/AlicaV2-phase5k archive HEAD | tar -x -C "$B/root/opt/alica"
cd "$B/root/opt/alica"
env -i HOME="$B/build-home" PATH="$B/root/opt/node/bin:/usr/bin:/bin" npm_config_cache="$B/npm-cache" npm ci --ignore-scripts
env -i HOME="$B/build-home" PATH="$B/root/opt/node/bin:/usr/bin:/bin" npm run build
