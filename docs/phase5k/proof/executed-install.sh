set -eu
B=/opt/alica-phase5k
exec > >(tee "$B/evidence/install.log") 2>&1
# Remove only the proven attempt-created convenience symlink outside sandbox.
python3 -c 'from pathlib import Path; p=Path("/root/.local/bin/python3.14"); expected="/opt/alica-phase5k/root/opt/python/cpython-3.14-linux-x86_64-gnu/bin/python3.14"; assert p.is_symlink() and str(p.readlink())==expected; p.unlink()'
mkdir -p "$B/build-home" "$B/tooling/bin"
cd "$B/root/opt/phase5k/hermes-agent-536802c00e4f93061fc46b134dc029ff695f364f"
env -i PATH=/usr/bin:/bin HOME="$B/build-home" UV_NO_CONFIG=1 UV_CACHE_DIR="$B/cache" UV_PYTHON_INSTALL_DIR="$B/root/opt/python" UV_PYTHON_BIN_DIR="$B/tooling/bin" UV_PROJECT_ENVIRONMENT="$B/root/opt/venv" "$B/tooling/uv-x86_64-unknown-linux-gnu/uv" sync --frozen --no-dev --extra web --python "$B/root/opt/python/cpython-3.14-linux-x86_64-gnu/bin/python3.14"
