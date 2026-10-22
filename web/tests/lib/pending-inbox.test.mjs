import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pendingInboxJobs } from '../../src/lib/pending-inbox.mjs';

test('tracked posting leaves the discovery view without changing any records', () => {
  const inbox = [
    { url: 'https://example.org/jobs/1?utm_source=board', done: false },
    { url: 'https://example.org/jobs/2', done: false },
    { url: 'https://example.org/jobs/3', done: true },
  ];
  const applications = [{url:'https://example.org/jobs/1',status:'Applied'}];
  const before = JSON.stringify({inbox,applications});
  assert.deepEqual(pendingInboxJobs(inbox,applications), [inbox[1]]);
  assert.equal(JSON.stringify({inbox,applications}), before);
});

test('distinct requisitions, boards and functional query IDs remain visible', () => {
  const inbox = [
    {url:'https://example.org/careers?gh_jid=2',company:'Example',role:'Analyst'},
    {url:'https://job-boards.greenhouse.io/other/jobs/1'},
    {url:'https://example.org/#/jobs/2'},
  ];
  const applications = [
    {url:'https://example.org/careers?gh_jid=1',company:'Example',role:'Analyst'},
    {url:'https://job-boards.greenhouse.io/example/jobs/1'},
    {url:'https://example.org/#/jobs/1'},
  ];
  assert.deepEqual(pendingInboxJobs(inbox,applications),inbox);
});

test('canonical duplicate discoveries collapse, while missing identities are preserved', () => {
  const inbox = [
    {url:'http://EXAMPLE.org/jobs/1/'},
    {url:'https://example.org/jobs/1?utm_campaign=campaign'},
    {url:''},
    {url:'invalid'},
  ];
  assert.deepEqual(pendingInboxJobs(inbox,[{url:''}]), [inbox[0],inbox[2],inbox[3]]);
});

test('tracker entries suppress only their exact posting regardless of lifecycle stage', () => {
  for (const status of ['Evaluated','Applied','Interview','Rejected','Hired']) {
    assert.deepEqual(pendingInboxJobs([{url:'https://example.org/jobs/1'}],
      [{url:'https://example.org/jobs/1',status}]), []);
  }
});
