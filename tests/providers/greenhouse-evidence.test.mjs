import {test} from 'node:test';import assert from 'node:assert/strict';
import greenhouse from '../../providers/greenhouse.mjs';
import {htmlToText} from '../../providers/_html-to-text.mjs';
import {structuredQualificationText,encodePostingEvidence,decodePostingEvidence} from '../../lib/posting-evidence.mjs';
test('Greenhouse preserves typed source identities and complete entity-encoded body with structural evidence',async()=>{
 const content='&lt;h2&gt;Required Skills&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;5 years GRC experience&lt;/li&gt;&lt;li&gt;CISA preferred&lt;/li&gt;&lt;/ul&gt;'+`<p>${'Last requirement and full preserved content. '.repeat(130)}</p>`;
 const [r]=await greenhouse.fetch({name:'Example',careers_url:'https://job-boards.greenhouse.io/example'},{fetchJson:async()=>({jobs:[{id:123,internal_job_id:456,requisition_id:'R-789',title:'GRC Analyst',absolute_url:'https://job-boards.greenhouse.io/example/jobs/123',location:{name:'Chicago'},content,metadata:[{name:'Employment Type',value:'Full-time'}]}]})});
 assert.equal(r.sourceId,'123');assert.equal(r.employerRequisitionId,'R-789');assert.equal(r.providerInternalJobId,'456');assert.equal(r.sourceBoard,'example');assert.equal(r.employmentType,'Full-time');assert.equal(r.description,htmlToText(content,Infinity));assert.ok(r.description.length>4000);assert.equal(r.descriptionComplete,true);assert.match(structuredQualificationText(r.description,decodePostingEvidence(encodePostingEvidence(r))),/5 years GRC experience\nCISA preferred/);
});
test('missing employer requisition is never fabricated from public posting ID',async()=>{
 const [r]=await greenhouse.fetch({name:'Example',careers_url:'https://job-boards.greenhouse.io/example'},{fetchJson:async()=>({jobs:[{id:123,absolute_url:'https://job-boards.greenhouse.io/example/jobs/123',content:'<p>Risk controls</p>'}]})});assert.equal(r.sourceId,'123');assert.equal(r.employerRequisitionId,undefined);assert.equal(r.providerInternalJobId,undefined);
});
