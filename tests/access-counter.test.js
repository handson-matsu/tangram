import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runAccessTests} from './access-cases.js';
runAccessTests(test, assert);

for (const app of ['triangle-tiling', 'hexagon-tiling']) {
  test(`アクセス実装が${app}と識別子以外完全一致`, async t => {
    let reference;
    try {reference = await readFile(new URL(`../../${app}/src/access-counter.js`, import.meta.url), 'utf8');}
    catch (error) {
      if (error.code === 'ENOENT') {t.skip('比較用の隣接リポジトリがありません'); return;}
      throw error;
    }
    const source = await readFile(new URL('../access-counter.js', import.meta.url), 'utf8');
    assert.equal(source.replace("app:'tangram'", `app:'${app}'`), reference);
  });
}
