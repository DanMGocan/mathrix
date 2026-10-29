import hashlib
import json
from pathlib import Path
import subprocess

for filename, expected in json.loads(Path('var/release-source-manifest.json').read_text()).items():
    if hashlib.sha256(Path(filename).read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Release changed after validation: {filename}')

health = json.loads(subprocess.check_output(
    ['curl', '--max-time', '10', '-fsS', 'http://127.0.0.1:3001/api/health'], text=True))
if health['active'] or health['queue']:
    raise SystemExit('Wait for active matches and queued players before deployment')

subprocess.run(['node', '--env-file=/etc/mathrix.env', '--import', 'tsx', '--input-type=module'],
    input='''import {db} from './server/db.ts';
try {
 const {rows}=await db.query(`SELECT count(*)::int AS count FROM "user" u WHERE NOT u."isGuest" AND NOT u.disabled AND NOT EXISTS(SELECT 1 FROM account a WHERE a."userId"=u.id AND a."providerId" IN ('google','discord'))`);
 if(rows[0].count)throw Error('Preserve and migrate accounts without a provider before cutover');
} finally {await db.end();}
''', text=True, check=True)

subprocess.run(['systemctl', 'stop', 'mathrix-game'], check=True)
subprocess.run(['node', '--env-file=/etc/mathrix.env', '--import', 'tsx', 'scripts/migrate.ts'], check=True)
