import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {exportShowcase} from './prepare-tuloy-showcase.mjs';

export function validatePublication(snapshot, approved) {
  const manifest=JSON.parse(fs.readFileSync(path.join(snapshot,'SHOWCASE-MANIFEST.json'),'utf8'));
  const allowed=new Set(approved);
  const unexpected=manifest.files.filter(entry=>!allowed.has(entry.file)).map(entry=>entry.file);
  if(unexpected.length) throw new Error(`New files need a privacy review before publication: ${unexpected.join(', ')}`);
  return manifest.files;
}

export function publishCode(root, checkout, message, push=false) {
  root=fs.realpathSync(root); checkout=fs.realpathSync(checkout);
  if(checkout===root || checkout.startsWith(root+path.sep) || root.startsWith(checkout+path.sep)) throw new Error('Use a separate publishing checkout outside the working application.');
  const git=(...args)=>execFileSync('git',args,{cwd:checkout,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  if(git('rev-parse','--show-toplevel')!==checkout) throw new Error('The publishing directory must be its own repository.');
  const expected='https://github.com/milanesram/tuloy.git';
  if(git('remote','get-url','origin')!==expected || git('remote','get-url','--push','origin')!==expected) throw new Error('Publishing destination must be milanesram/tuloy.');
  if(git('branch','--show-current')!=='main') throw new Error('Use the main publishing branch.');
  if(git('status','--porcelain','--untracked-files=all')) throw new Error('Publishing checkout has local changes. Review them before continuing.');
  const approved=JSON.parse(fs.readFileSync(path.join(root,'publication-files.json'),'utf8'));
  const tracked=git('ls-files','-z').split('\0').filter(Boolean);
  if(tracked.some(name=>!approved.includes(name) && name!=='PUBLICATION-MANIFEST.json')) throw new Error('Publishing checkout contains unapproved tracked files; review before continuing.');
  if(push) {
    git('fetch','origin','main');
    if(git('rev-parse','HEAD')!==git('rev-parse','origin/main')) throw new Error('GitHub and the publishing checkout differ. Reconcile them before pushing.');
  }
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'tuloy-publish-'));
  try {
    const snapshot=path.join(temporary,'source');
    exportShowcase(root,snapshot);
    const files=validatePublication(snapshot,approved);
    for(const {file} of files) {
      const target=path.join(checkout,file);
      // Refuse symlink parents, including ignored files in a used checkout.
      for(let p=target;p!==checkout;p=path.dirname(p)) {
        if(fs.existsSync(p) && fs.lstatSync(p).isSymbolicLink()) throw new Error('Publishing checkout contains a symlink.');
      }
    }
    const names=new Set(files.map(entry=>entry.file));
    for(const name of tracked) if(name!=='PUBLICATION-MANIFEST.json' && !names.has(name)) fs.rmSync(path.join(checkout,name));
    for(const {file} of files) {
      const from=path.join(snapshot,file),to=path.join(checkout,file);
      fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);fs.chmodSync(to,fs.statSync(from).mode & 0o111 ? 0o755 : 0o644);
    }
    fs.writeFileSync(path.join(checkout,'PUBLICATION-MANIFEST.json'),JSON.stringify({name:'Tuloy',privateRuntimeIncluded:false,historyImported:false,files},null,2)+'\n');
    // Explicit paths only: ignored runtime files can never be swept into a commit.
    const stage=[...new Set([...tracked,...names,'PUBLICATION-MANIFEST.json'])];
    for(let i=0;i<stage.length;i+=100) git('add','-f','-A','--',...stage.slice(i,i+100));
    const changed=git('diff','--cached','--name-only');
    if(!changed) {console.log('No application changes to publish.');return;}
    git('-c','user.name=milanesram','-c','user.email=232384520+milanesram@users.noreply.github.com','commit','-m',message);
    if(push) git('push','origin','main');
    console.log(push ? 'Application code published to https://github.com/milanesram/tuloy' : 'Clean code committed locally. No push performed.');
  } finally {fs.rmSync(temporary,{recursive:true,force:true});}
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2), value=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  const checkout=value('--checkout'),message=value('--message');
  if(!checkout || !message) {console.error('Usage: npm run github:prepare -- --checkout /path/to/publishing-checkout --message "Describe the update" [--push]');process.exitCode=1;}
  else try {publishCode(path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),checkout,message,args.includes('--push'));}
  catch(error) {console.error(error.message);process.exitCode=1;}
}
