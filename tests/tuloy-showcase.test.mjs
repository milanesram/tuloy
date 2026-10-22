import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publishable, exportShowcase } from '../scripts/prepare-tuloy-showcase.mjs';
import { mkdtempSync, existsSync, writeFileSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('publication boundary rejects personal records, browser state, build output and symlinks by path', () => {
  for (const name of ['cv.md','portals.yml','config/profile.yml','modes/_profile.md','modes/_custom.md','data/applications.md','documents/resume.docx','jds/posting.md','.career-ops-web/memory.md','authenticated-sources/session.json','web/.env.local','web/.next/server/app.html','node_modules/module/index.js','.git/config','../private.txt','cv.md.bak-2026','local.key','batch/log.txt','web/tests/rc08-frozen-replay.test.mjs','tests/operational-discovery-config.test.mjs','tests/job-search-v3.test.mjs','web/src/app/demo/page.tsx','web/src/components/tuloy-demo.tsx','docs/tuloy/demo-desktop.png','docs/tuloy/demo.webm','examples/tuloy/portals.example.yml']) assert.equal(publishable(name),false,name);
  for (const name of ['README.md','docs/tuloy/brand.md','LICENSE','scripts/prepare-tuloy-showcase.mjs']) assert.equal(publishable(name),true,name);
});

test('export uses explicit fictional examples, includes local code, omits private values and Git history', () => {
  const root=mkdtempSync(path.join(tmpdir(),'tuloy-export-test-'));
  const put=(name,text) => {const p=path.join(root,name);mkdirSync(path.dirname(p),{recursive:true});writeFileSync(p,text);};
  execFileSync('git',['init','-q'],{cwd:root});
  put('portals.yml','private committed targeting'); put('examples/tuloy/portals.example.yml','portals: []');
  for(const name of ['config/profile.example.yml','config/plugins.example.yml','config/cv-facts.example.json']) put(name,'{}');
  execFileSync('git',['add','.'],{cwd:root});
  execFileSync('git',['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-qm','Fictional baseline'],{cwd:root});
  put('portals.yml','PRIVATE targeting'); put('config/profile.yml','PRIVATE profile'); put('data/applications.md','PRIVATE tracker');
  put('cv.md','PRIVATE CV'); mkdirSync(path.join(root,'web/public'),{recursive:true}); symlinkSync(path.join(root,'cv.md'),path.join(root,'web/public/profile.md')); put('web/src/app/page.tsx','export default function Page() {}'); put('docs/tuloy/ci-template.yml','name: Tuloy CI');
  const destination=path.join(root,'release');
  const result=exportShowcase(root,destination);
  assert.ok(result.files>0);
  for(const name of ['.git','cv.md','data/applications.md','config/profile.yml','portals.yml','web/public/profile.md']) assert.equal(existsSync(path.join(destination,name)),false,name);
  assert.match(readFileSync(path.join(destination,'config/portals.example.yml'),'utf8'),/positive: \[\]/);
  assert.ok(existsSync(path.join(destination,'web/src/app/page.tsx')));
  assert.throws(()=>exportShowcase(root,destination),/already exists/);
});


test('derivative updater blocks replacement and rollback before mutating files', () => {
  const root=mkdtempSync(path.join(tmpdir(),'tuloy-updater-test-'));
  writeFileSync(path.join(root,'update-system.mjs'),readFileSync(new URL('../update-system.mjs',import.meta.url)));
  writeFileSync(path.join(root,'tuloy-brand.json'),'{}');
  for(const action of ['apply','rollback']) {
    assert.throws(()=>execFileSync(process.execPath,['update-system.mjs',action,'--confirm'],{cwd:root,encoding:'utf8',stdio:'pipe'}), error=>error.status===1 && /reviewed merges/.test(error.stderr));
  }
  assert.equal(existsSync(path.join(root,'.update-lock')),false);
});
