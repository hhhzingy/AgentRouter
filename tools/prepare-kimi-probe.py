"""只为独立探针生成必要配置，不输出秘密、不复制日常 services。"""
import json
import sys
import tomllib
from pathlib import Path
from urllib.parse import urlparse

target = Path(sys.argv[1]).resolve()
base = (Path.cwd() / '.local/j3-kimi').resolve()
if not target.is_relative_to(base):
    raise RuntimeError('PROBE_SCOPE_DENIED')
source = tomllib.loads(Path('C:/Users/hap_p/.kimi-code/config.toml').read_text(encoding='utf-8'))
provider = source['providers']['managed:kimi-code']
if provider.get('api_key') or urlparse(provider['base_url']).hostname != 'api.kimi.com':
    raise RuntimeError('PROVIDER_REQUIRES_EXPLICIT_REGISTRATION')
model = source['models']['kimi-code/kimi-for-coding']
lines = ['default_model = "kimi-code/kimi-for-coding"', '[thinking]', 'enabled = false', '[providers."managed:kimi-code"]']
for key in ['type', 'base_url']:
    lines.append(f'{key} = {json.dumps(provider[key])}')
lines.append('[providers."managed:kimi-code".oauth]')
for key in ['storage', 'key']:
    lines.append(f'{key} = {json.dumps(provider["oauth"][key])}')
lines.append('[models."kimi-code/kimi-for-coding"]')
for key in ['provider', 'model', 'max_context_size', 'capabilities', 'display_name']:
    if key in model:
        lines.append(f'{key} = {json.dumps(model[key],ensure_ascii=False)}')
(target / 'config.toml').write_text('\n'.join(lines)+'\n',encoding='utf-8')
