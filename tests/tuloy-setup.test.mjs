import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import * as yaml from 'js-yaml';
import {setupWorkspace} from '../scripts/setup-tuloy.mjs';

const input={name:'Fictional Reader',location:'Example City',roles:['Bookkeeper','Project Assistant'],cv:'# Fictional CV\n\nSample experience supplied by the test.'};
test('setup creates a real independent workspace from supplied facts only',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tuloy-setup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  setupWorkspace(root,input);
  const profile=yaml.load(fs.readFileSync(path.join(root,'config/profile.yml'),'utf8'));
  const portals=yaml.load(fs.readFileSync(path.join(root,'portals.yml'),'utf8'));
  assert.deepEqual(profile.candidate,{full_name:input.name,location:input.location});
  assert.deepEqual(portals.title_filter.positive,input.roles);assert.deepEqual(portals.location_filter.allow,[input.location]);
  assert.deepEqual(portals.tracked_companies,[]);assert.equal(profile.location,undefined);assert.equal(profile.compensation,undefined);
  assert.equal(fs.readFileSync(path.join(root,'cv.md'),'utf8'),input.cv+'\n');
  const before=fs.readFileSync(path.join(root,'cv.md'),'utf8');assert.throws(()=>setupWorkspace(root,{...input,name:'Other'}),/preserved/);assert.equal(fs.readFileSync(path.join(root,'cv.md'),'utf8'),before);
});
test('invalid source URLs fail before any private files are written',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tuloy-setup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  assert.throws(()=>setupWorkspace(root,{...input,boards:['https://untrusted.invalid/board']}),/employer board/);
  assert.equal(fs.existsSync(path.join(root,'cv.md')),false);
});
test('explicit employer boards remain operational without running a search during setup',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tuloy-setup-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const result=setupWorkspace(root,{...input,boards:['https://jobs.lever.co/example-employer']});
  assert.equal(result.boards,1);const config=yaml.load(fs.readFileSync(path.join(root,'portals.yml'),'utf8'));
  assert.equal(config.tracked_companies[0].provider,'lever');assert.equal(config.tracked_companies[0].enabled,true);assert.equal(fs.existsSync(path.join(root,'data/scan-history.tsv')),false);
});
