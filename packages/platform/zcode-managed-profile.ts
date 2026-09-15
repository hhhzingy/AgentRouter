import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

/** 只准备已由 owner 校验的持久 HOME，不读取/复制桌面认证，也不覆盖已有配置。 */
export function prepareManagedZcodeProfile(sessionHome: string) {
  if (!isAbsolute(sessionHome)) throw Error('ZCODE_HOME_INVALID');
  const home = realpathSync(sessionHome);
  const inside = (target: string) => {
    const rel = relative(home, realpathSync(target));
    if (!rel || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))
      throw Error('ZCODE_CONFIG_OUTSIDE_HOME');
  };
  for (const path of [join(home, '.zcode'), join(home, '.zcode', 'cli')]) {
    if (existsSync(path)) inside(path);
    else mkdirSync(path);
  }
  const configPath = join(home, '.zcode', 'cli', 'config.json');
  const content = JSON.stringify({
    storage: { dir: join(home, '.zcode'), sessionDbPath: join(home, '.zcode', 'cli', 'db', 'db.sqlite') },
    plugins: { enabled: false, dirs: [], enabledPlugins: {}, extraKnownMarketplaces: {} },
    hooks: { enabled: false, events: {} },
    mcp: { servers: {} },
  }, null, 2) + '\n';
  if (existsSync(configPath)) {
    inside(configPath);
    if (readFileSync(configPath, 'utf8') !== content) throw Error('ZCODE_EXISTING_CONFIG_CONFLICT');
  } else writeFileSync(configPath, content, { flag: 'wx', mode: 0o600 });
  return { configPath, home };
}
