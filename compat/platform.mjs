import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function platformPaths(env = process.env, platform = process.platform) {
  const home = homedir();
  const profile = platform === 'darwin'
    ? join(home, 'Library', 'Application Support', 'Antigravity')
    : platform === 'win32'
      ? join(env.APPDATA || join(home, 'AppData', 'Roaming'), 'Antigravity')
      : join(env.XDG_CONFIG_HOME || join(home, '.config'), 'Antigravity');

  const antigravityDir = join(home, '.gemini', 'antigravity');
  const sidecarRoot = join(antigravityDir, 'sidecar_data', 'agy-project-sidebar');

  return {
    home,
    profile,
    antigravityDir,
    conversationsDb: join(antigravityDir, 'conversation_summaries.db'),
    pluginConfig: join(home, '.gemini', 'config', 'config.json'),
    pluginDir: join(home, '.gemini', 'config', 'plugins', 'agy-project-sidebar'),
    data: join(sidecarRoot, 'panel'),
    settings: join(sidecarRoot, 'settings.json'),
    preferences: join(sidecarRoot, 'panel', 'preferences.json'),
  };
}

export function installedAgentExecutable(platform = process.platform, env = process.env) {
  const candidates = platform === 'darwin'
    ? [
        '/Applications/Antigravity.app/Contents/Resources/bin/language_server',
        '/Applications/Antigravity.app/Contents/Resources/bin/language_server_macos_arm.native',
        '/Applications/Antigravity.app/Contents/Resources/bin/language_server_macos_x64.native',
        join(homedir(), 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'bin', 'language_server'),
      ]
    : platform === 'win32'
      ? [
          join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'Programs', 'Antigravity', 'resources', 'bin', 'language_server.exe'),
          'C:\\Program Files\\Antigravity\\resources\\bin\\language_server.exe',
        ]
      : [
          '/usr/share/antigravity/resources/bin/language_server',
          '/opt/Antigravity/resources/bin/language_server',
        ];
  return candidates.find(candidate => existsSync(candidate)) || candidates[0];
}

export function installedNodeHelper(platform = process.platform) {
  if (platform === 'darwin') {
    const helper = '/Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper.app/Contents/MacOS/Antigravity Helper';
    if (existsSync(helper)) return helper;
  }
  return process.execPath;
}
