from pathlib import Path
import hashlib,json
live=Path('/srv/mathrix')
base=json.loads(Path('/root/mathrix-email-release-20261006/var/runtime-base-sha256.json').read_text())
exclude={'node_modules','.git','var','test-results','playwright-report','backups'}
current={str(p.relative_to(live)):hashlib.sha256(p.read_bytes()).hexdigest() for p in live.rglob('*') if p.is_file() and not any(x in exclude or x.startswith('.next') for x in p.relative_to(live).parts) and (p.name=='.env.example' or not p.name.startswith('.env'))}
changes=[x for x in sorted(base.keys()|current.keys()) if base.get(x)!=current.get(x)]
assert not changes,'Runtime changed during release preparation: '+', '.join(changes)
print('Current runtime matches the validated release base')
