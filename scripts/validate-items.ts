import Ajv from 'ajv';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const schema = JSON.parse(readFileSync(path.resolve('data/_schema.json'), 'utf-8'));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const dir = path.resolve('data/items');
let failed = 0;
const files = readdirSync(dir).filter((f) => /^item-\d+\.json$/.test(f));

if (files.length === 0) {
  console.error('data/items/ altında item bulunamadı.');
  process.exit(1);
}

for (const f of files.sort()) {
  const data = JSON.parse(readFileSync(path.join(dir, f), 'utf-8')) as { title?: string; review?: boolean };
  if (validate(data)) {
    const flag = data.review ? '  [review: true]' : '';
    console.log(`OK   ${f} — ${data.title}${flag}`);
  } else {
    failed++;
    console.error(`FAIL ${f}`);
    for (const err of validate.errors ?? []) {
      console.error(`     ${err.instancePath || '/'} ${err.message}`);
    }
  }
}

console.log(`\n${files.length - failed}/${files.length} item şemaya uygun.`);
process.exit(failed ? 1 : 0);
