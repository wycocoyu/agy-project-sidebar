#!/usr/bin/env python3
"""Dependency-free lifecycle manager for AGY Project Sidebar."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

PLUGIN_NAME = 'agy-project-sidebar'
SOURCE = Path(__file__).resolve().parent
HOME = Path.home()
PLUGINS_ROOT = HOME / '.gemini' / 'config' / 'plugins'
PLUGIN_DIR = PLUGINS_ROOT / PLUGIN_NAME
SIDECAR_DATA = HOME / '.gemini' / 'antigravity' / 'sidecar_data' / PLUGIN_NAME
PANEL_DATA = SIDECAR_DATA / 'panel'
SETTINGS_FILE = SIDECAR_DATA / 'settings.json'
OWNER_FILE = PANEL_DATA / 'ownership.json'
HEALTH_FILE = PANEL_DATA / 'integration-state.json'
RUNTIME_ITEMS = ('plugin.json', 'assets', 'compat', 'sidecars', 'skills')
IGNORE = shutil.ignore_patterns('__pycache__', '*.pyc', '*.log', '.DS_Store', 'data', 'sdk')


def read_json(path: Path, default=None):
    if not path.is_file():
        return {} if default is None else default
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json_atomic(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    os.replace(tmp, path)


def discover_ls():
    try:
        out = subprocess.check_output(
            ['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-c', 'language_'],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None, None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for port in sorted(set(int(m) for m in re.findall(r':(\d+)\s+\(LISTEN\)', out))):
        try:
            html = opener.open(f'http://127.0.0.1:{port}/', timeout=1).read().decode('utf-8', 'ignore')
            m = re.search(r'"csrfToken"\s*:\s*"([^"]+)"', html)
            if m:
                return port, m.group(1)
        except Exception:
            pass
    return None, None


def call_ls(port, token, method, payload=None):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(
        f'http://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/{method}',
        data=json.dumps(payload or {}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'x-codeium-csrf-token': token},
        method='POST',
    )
    with opener.open(req, timeout=3) as resp:
        return json.loads(resp.read().decode('utf-8'))


def find_node_runtime():
    if sys.platform == 'darwin':
        helper = Path('/Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper.app/Contents/MacOS/Antigravity Helper')
        if helper.is_file():
            env = {**os.environ, 'ELECTRON_RUN_AS_NODE': '1'}
            return [str(helper)], env
    node_bin = shutil.which('node')
    if node_bin:
        return [node_bin], dict(os.environ)
    return None, dict(os.environ)


def pid_alive(pid: int) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stop_bootstrap_process():
    owner = read_json(OWNER_FILE, None)
    if not owner or owner.get('tier') != 1:
        return
    pid = owner.get('pid')
    if pid_alive(pid):
        try:
            os.kill(pid, signal.SIGTERM)
            for _ in range(20):
                if not pid_alive(pid):
                    break
                time.sleep(0.1)
        except OSError:
            pass


def start_bootstrap_if_needed(restart_if_running: bool = False):
    owner = read_json(OWNER_FILE, None)
    if not restart_if_running and owner and owner.get('tier') == 2 and pid_alive(owner.get('pid')):
        return 'host-sidecar'

    port, token = discover_ls()
    if port and token:
        try:
            sidecars = call_ls(port, token, 'GetSidecars', {}).get('sidecars', [])
            entry = next((s for s in sidecars if s.get('sidecarId') == f'{PLUGIN_NAME}/panel'), None)
            if entry:
                was_running = entry.get('status') == 'SIDECAR_STATUS_RUNNING'
                if was_running and not restart_if_running:
                    return 'host-sidecar'
                try:
                    if not was_running:
                        call_ls(port, token, 'ManageSidecar', {'sidecarId': f'{PLUGIN_NAME}/panel', 'action': 'SIDECAR_ACTION_ENABLE'})
                    call_ls(port, token, 'ManageSidecar', {'sidecarId': f'{PLUGIN_NAME}/panel', 'action': 'SIDECAR_ACTION_RESTART'})
                    for _ in range(10):
                        time.sleep(0.3)
                        sidecars2 = call_ls(port, token, 'GetSidecars', {}).get('sidecars', [])
                        entry2 = next((s for s in sidecars2 if s.get('sidecarId') == f'{PLUGIN_NAME}/panel'), None)
                        if entry2 and entry2.get('status') == 'SIDECAR_STATUS_RUNNING':
                            return 'host-sidecar-restarted' if was_running else 'host-sidecar-hot'
                except Exception:
                    pass
        except Exception:
            pass

    if restart_if_running and owner and owner.get('tier') == 2 and pid_alive(owner.get('pid')):
        return 'host-sidecar'

    stop_bootstrap_process()
    cmd_prefix, env = find_node_runtime()
    if not cmd_prefix:
        return 'no-node-runtime'

    PANEL_DATA.mkdir(parents=True, exist_ok=True)
    log_path = PANEL_DATA / 'bootstrap.log'
    main_mjs = PLUGIN_DIR / 'sidecars' / 'panel' / 'main.mjs'
    with open(log_path, 'ab') as logf:
        subprocess.Popen(
            [*cmd_prefix, str(main_mjs), '--bootstrap'],
            cwd=str(PLUGIN_DIR / 'sidecars' / 'panel'),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=logf,
            stderr=logf,
            start_new_session=True,
        )
    return 'bootstrap-started'


def verify_destination_safe():
    if PLUGIN_DIR.is_symlink():
        raise RuntimeError(f'Refusing to overwrite symlinked plugin directory: {PLUGIN_DIR}')
    if PLUGIN_DIR.exists():
        manifest = read_json(PLUGIN_DIR / 'plugin.json', {})
        if manifest and manifest.get('name') != PLUGIN_NAME:
            raise RuntimeError(f'Unexpected plugin at {PLUGIN_DIR}; refusing overwrite')


def cmd_install():
    verify_destination_safe()
    PLUGIN_DIR.mkdir(parents=True, exist_ok=True)
    for name in RUNTIME_ITEMS:
        src = SOURCE / name
        dst = PLUGIN_DIR / name
        if src.resolve() == dst.resolve():
            continue
        if src.is_dir():
            shutil.copytree(src, dst, dirs_exist_ok=True, ignore=IGNORE)
        else:
            shutil.copy2(src, dst)
    write_json_atomic(SETTINGS_FILE, {'enabled': True})
    mode = start_bootstrap_if_needed(restart_if_running=True)
    print(json.dumps({
        'status': 'installed',
        'pluginDir': str(PLUGIN_DIR),
        'runtimeActivation': mode,
        'note': 'Sidecar plugin installed cleanly with zero Antigravity app-bundle edits; survives restarts & updates.',
    }, ensure_ascii=False, indent=2))


def cmd_set_enabled(enabled: bool):
    write_json_atomic(SETTINGS_FILE, {'enabled': enabled})
    print(json.dumps({'enabled': enabled, 'settingsFile': str(SETTINGS_FILE)}, indent=2))


def cmd_uninstall():
    verify_destination_safe()
    write_json_atomic(SETTINGS_FILE, {'enabled': False})
    stop_bootstrap_process()
    if PLUGIN_DIR.exists():
        shutil.rmtree(PLUGIN_DIR)
    print(json.dumps({'status': 'uninstalled', 'pluginDir': str(PLUGIN_DIR)}, indent=2))


def cmd_status():
    installed = (PLUGIN_DIR / 'plugin.json').is_file()
    settings = read_json(SETTINGS_FILE, {'enabled': True})
    owner = read_json(OWNER_FILE, None)
    health = read_json(HEALTH_FILE, None)
    sidecar_info = None
    port, token = discover_ls()
    if port and token:
        try:
            sidecars = call_ls(port, token, 'GetSidecars', {}).get('sidecars', [])
            sidecar_info = next((s for s in sidecars if s.get('sidecarId') == f'{PLUGIN_NAME}/panel'), None)
        except Exception:
            pass
    print(json.dumps({
        'installed': installed,
        'enabled': settings.get('enabled', True) is not False,
        'pluginDir': str(PLUGIN_DIR),
        'owner': owner,
        'ownerAlive': bool(owner and pid_alive(owner.get('pid'))),
        'hostSidecarStatus': sidecar_info.get('status') if sidecar_info else None,
        'inlineIntegration': health,
    }, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description='AGY Project Sidebar lifecycle manager')
    sub = parser.add_subparsers(dest='action', required=True)
    for act in ('install', 'uninstall', 'enable', 'disable', 'status'):
        sub.add_parser(act)
    args = parser.parse_args()
    try:
        if args.action == 'install':
            cmd_install()
        elif args.action == 'enable':
            cmd_set_enabled(True)
        elif args.action == 'disable':
            cmd_set_enabled(False)
        elif args.action == 'uninstall':
            cmd_uninstall()
        elif args.action == 'status':
            cmd_status()
    except Exception as exc:
        print(f'agy-project-sidebar: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
