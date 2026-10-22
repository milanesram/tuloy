import { pass, fail } from './helpers.mjs';
import workday from '../providers/workday.mjs';
import {
  parallelEach,
  WORKDAY_PUBLIC_BOARD_TIMEOUT_MS,
} from '../scan-ats-full.mjs';

console.log('\nscan-ats-full — Workday public-board budget');

const entry = (name) => ({
  name,
  careers_url: `https://${name}.wd1.myworkdayjobs.com/careers`,
});

const page = (name, count = 1, total = count) => ({
  total,
  jobPostings: Array.from({ length: count }, (_, i) => ({
    title: `${name} Role ${i}`,
    externalPath: `/job/Chicago/${name}-role-${i}_R${i}`,
    postedOn: 'Posted Today',
  })),
});

try {
  if (WORKDAY_PUBLIC_BOARD_TIMEOUT_MS === 15_000) {
    pass('public Workday board budget is explicitly bounded below Explore\'s whole-run budget');
  } else {
    fail(`unexpected Workday public-board budget: ${WORKDAY_PUBLIC_BOARD_TIMEOUT_MS}`);
  }

  const outcomes = new Map();
  await parallelEach(['normal', 'unreachable', 'slow', 'malformed'], 4, async (name) => {
    let clock = 1_000;
    let calls = 0;
    const ctx = {
      transport: 'http',
      deadlineMs: name === 'slow' ? 2_000 : 20_000,
      now: () => clock,
      sleep: async () => {},
      fetchJson: async () => {
        calls++;
        if (name === 'unreachable') {
          const err = new Error('host unreachable');
          err.status = 404;
          throw err;
        }
        if (name === 'malformed') return { total: 0, jobPostings: { not: 'an array' } };
        if (name === 'slow') {
          clock += 600;
          return page(name, 20, 200);
        }
        return page(name);
      },
    };
    try {
      const jobs = await workday.fetch(entry(name), ctx);
      outcomes.set(name, { jobs, calls });
    } catch (error) {
      outcomes.set(name, { error, calls });
    }
  });

  if (outcomes.get('normal')?.jobs?.length === 1) {
    pass('normal Workday board completes inside a multi-board scan');
  } else {
    fail(`normal board did not complete: ${JSON.stringify(outcomes.get('normal'))}`);
  }

  if (outcomes.get('unreachable')?.error?.status === 404 && outcomes.get('unreachable')?.calls === 1) {
    pass('unreachable Workday board fails once without blocking other boards');
  } else {
    fail(`unreachable board handling mismatch: ${JSON.stringify(outcomes.get('unreachable'))}`);
  }

  const slow = outcomes.get('slow');
  if (slow?.jobs?.workdayDeadlineExceeded === true && slow.jobs.length === 40 && slow.calls === 2) {
    pass('slow Workday board terminates at its deadline with completed pages preserved');
  } else {
    fail(`slow board deadline mismatch: calls=${slow?.calls}, jobs=${slow?.jobs?.length}, tag=${slow?.jobs?.workdayDeadlineExceeded}`);
  }

  if (Array.isArray(outcomes.get('malformed')?.jobs) && outcomes.get('malformed').jobs.length === 0) {
    pass('malformed Workday response is handled as an empty board');
  } else {
    fail(`malformed response handling mismatch: ${JSON.stringify(outcomes.get('malformed'))}`);
  }

  if (outcomes.size === 4) {
    pass('multiple-board scan completes every board even when one is unreachable and one reaches its deadline');
  } else {
    fail(`multiple-board scan completed ${outcomes.size} of 4 boards`);
  }
} catch (error) {
  fail(`Workday public-board budget tests crashed: ${error.message}`);
}
