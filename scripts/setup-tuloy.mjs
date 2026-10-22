import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import * as yaml from 'js-yaml';
import { getCareerOpsRoot } from '../path-resolver.mjs';

export function setupWorkspace(root, { name, location, roles, cv, boards = [] }) {
  if (!name?.trim() || !location?.trim() || !Array.isArray(roles) || !roles.length || !roles.every(r => typeof r === 'string' && r.trim()) || !cv?.trim()) throw new Error('Provide your name, location, target roles and CV text. Nothing is inferred.');
  const destinations = ['cv.md','config/profile.yml','modes/_profile.md','portals.yml'];
  for (const name of destinations) if (fs.existsSync(path.join(root,name))) throw new Error(`Existing ${name} was preserved. Continue using the app or edit your existing configuration; setup is for an empty workspace.`);
  const companies = boards.map(value => {
    const url = new URL(value); const host = url.hostname.toLowerCase();
    const provider = host === 'jobs.lever.co' ? 'lever' : ['boards.greenhouse.io','job-boards.greenhouse.io'].includes(host) ? 'greenhouse' : host === 'jobs.ashbyhq.com' ? 'ashby' : null;
    if (url.protocol !== 'https:' || !provider || !url.pathname.split('/').filter(Boolean).length || url.username || url.password) throw new Error('Use an HTTPS employer board URL from Greenhouse, Lever or Ashby. Other sources can be configured later.');
    return { name: url.pathname.split('/').filter(Boolean)[0], provider, careers_url:url.href, enabled:true };
  });
  const profile = {candidate:{full_name:name.trim(),location:location.trim()},target_roles:{primary:roles.map(r=>r.trim()),archetypes:[]},language:{output:'en'}};
  const portals = {title_filter:{positive:roles.map(r=>r.trim()),negative:[]},location_filter:{allow:[location.trim()]},content_filter:{},tracked_companies:companies,job_boards:[]};
  const files = {
    'cv.md':cv.trim()+'\n',
    'config/profile.yml':yaml.dump(profile,{noRefs:true}),
    'modes/_profile.md':'# Your Tuloy profile\n\nUse config/profile.yml for targeting and cv.md for experience. Do not infer work authorization, credentials, compensation requirements or skills that are not supplied by the user.\n',
    'portals.yml':yaml.dump(portals,{noRefs:true})
  };
  const created=[];
  try {
    for (const [name,content] of Object.entries(files)) {
      const target=path.join(root,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,{flag:'wx',mode:0o600});created.push(target);
    }
  } catch(error) { for(const file of created) fs.unlinkSync(file);throw error; }
  return {files:destinations,boards:companies.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root=getCareerOpsRoot();
  const prompt=createInterface({input:process.stdin,output:process.stdout});
  try {
    for(const name of ['cv.md','config/profile.yml','modes/_profile.md','portals.yml']) if(fs.existsSync(path.join(root,name))) throw new Error(`An existing workspace was found (${name}). Your files were preserved. Run npm start to continue.`);
    console.log('Welcome to Tuloy. Set up your own local workspace. No search will run during setup.');
    const name=await prompt.question('Your name: ');
    const location=await prompt.question('Your preferred work location: ');
    const roles=(await prompt.question('Your target role titles, separated by commas: ')).split(',').map(s=>s.trim()).filter(Boolean);
    const cvPath=(await prompt.question('Path to your CV as a .md or .txt file: ')).trim().replace(/^~(?=\/)/,process.env.HOME||'~');
    if(!/\.(md|txt|markdown)$/i.test(cvPath)) throw new Error('Use a text or Markdown CV. PDF import is available through the app with a configured AI tool.');
    const cv=fs.readFileSync(path.resolve(cvPath),'utf8');
    const boards=(await prompt.question('Optional Greenhouse, Lever or Ashby employer board URLs, separated by commas (Enter to use Explore): ')).split(',').map(s=>s.trim()).filter(Boolean);
    const result=setupWorkspace(root,{name,location,roles,cv,boards});
    console.log(`Your local workspace is ready. ${result.boards} employer boards configured. Run npm start, then open http://127.0.0.1:3210. Use Explore to search with your own filters.`);
  } catch(error) {console.error(error.message);process.exitCode=1;} finally {prompt.close();}
}
