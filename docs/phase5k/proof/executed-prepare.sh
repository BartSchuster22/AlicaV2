set -eu
B=/opt/alica-phase5k
mkdir -p "$B"/tooling "$B"/downloads "$B"/root "$B"/evidence
exec > >(tee "$B/evidence/prepare.log") 2>&1
date -u
uname -a
df -h /opt
curl --fail --location --proto '=https' --tlsv1.2 https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz -o "$B/downloads/uv.tar.gz"
tar -xzf "$B/downloads/uv.tar.gz" -C "$B/tooling"
"$B/tooling/uv-x86_64-unknown-linux-gnu/uv" --version
mkdir -p "$B/root/opt/phase5k" "$B/root/state" "$B/root/tmp" "$B/root/proc" "$B/root/dev" "$B/root/run" "$B/root/home" "$B/root/etc"
tar -xzf "$B/downloads/hermes-source.tar.gz" -C "$B/root/opt/phase5k"
export UV_PYTHON_INSTALL_DIR="$B/root/opt/python" UV_CACHE_DIR="$B/cache" UV_NO_CONFIG=1
"$B/tooling/uv-x86_64-unknown-linux-gnu/uv" python install 3.14
sha256sum "$B/downloads/uv.tar.gz" "$B/downloads/hermes-source.tar.gz"
python3 -c 'from pathlib import Path; p=Path("/opt/alica-phase5k/root/opt/phase5k"); print("\n".join(str(x) for x in p.iterdir()))'
