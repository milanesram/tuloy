import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {featureError} from './lib/feature-read.mjs';
const ROOTS = ['output','documents','reports'];
const MIME = {'.pdf':'application/pdf','.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};
const inside = (file, root) => file.startsWith(root + path.sep);
export function listDocuments(root) {
  const documents=[];let truncated=false;
  const base=fs.realpathSync(/*turbopackIgnore: true*/ root);
  function walk(dir, area, depth=0) {
    if (depth > 8 || documents.length >= 5000) {truncated=true;return;}
    let entries;
    try { if(fs.lstatSync(/*turbopackIgnore: true*/ dir).isSymbolicLink())return;entries=fs.readdirSync(/*turbopackIgnore: true*/ dir,{withFileTypes:true}); }
    catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries) {
      if(entry.isSymbolicLink())continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()){walk(file,area,depth+1);continue;}
      const extension=path.extname(entry.name).toLowerCase();
      if(!entry.isFile() || !MIME[extension] || !inside(fs.realpathSync(/*turbopackIgnore: true*/ file),path.join(base,area)))continue;
      const stat=fs.statSync(/*turbopackIgnore: true*/ file);const relative=path.relative(base,file).split(path.sep).join('/');
      documents.push({id:createHash('sha256').update(relative).digest('hex'),name:entry.name,relative,area,extension,size:stat.size,modifiedAt:stat.mtime.toISOString(),kind:/cover|letter/i.test(entry.name)?'Cover letter':/\b(?:cv|resume)\b/i.test(entry.name.replaceAll('_',' ').replaceAll('-',' '))?'CV / resume':area==='reports'?'Report':'Document'});
      if(documents.length>=5000){truncated=true;break;}
    }
  }
  for(const area of ROOTS)walk(path.join(base,area),area);
  documents.sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)||a.relative.localeCompare(b.relative));
  return {documents,truncated};
}
export function readLibraryDocument(root,id) {
  if(typeof id!=='string'||!/^\w{64}$/.test(id))throw featureError('Invalid document identifier.');
  const entry=listDocuments(root).documents.find(item=>item.id===id);
  if(!entry)throw featureError('Document is unavailable.','NOT_FOUND');
  const file=path.join(fs.realpathSync(/*turbopackIgnore: true*/ root),entry.relative);const area=path.join(fs.realpathSync(/*turbopackIgnore: true*/ root),entry.area);
  if(!inside(fs.realpathSync(/*turbopackIgnore: true*/ file),area))throw featureError('Document is unavailable.','NOT_FOUND');
  const fd=fs.openSync(/*turbopackIgnore: true*/ file,fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat=fs.fstatSync(fd);const current=fs.statSync(/*turbopackIgnore: true*/ file);
    if(!stat.isFile()||stat.ino!==current.ino||stat.dev!==current.dev||!inside(fs.realpathSync(/*turbopackIgnore: true*/ file),area))throw featureError('Document changed. Reload the library.','NOT_FOUND');
    if(stat.size>50*1024*1024)throw featureError('Documents larger than 50 MB must be opened locally.','TOO_LARGE');
    return {entry,content:fs.readFileSync(fd),mime:MIME[entry.extension]};
  } finally {fs.closeSync(fd);}
}
