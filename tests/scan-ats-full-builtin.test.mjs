import { pass, fail } from './helpers.mjs';
import {
  buildBuiltinEntry,
  crossSourceRoleKey,
  isBuiltinAggregateDuplicate,
  orderDiscoverySources,
} from '../scan-ats-full.mjs';
import { buildCompanyCanonicalizer } from '../scan.mjs';

console.log('\nReverse ATS scan — Built In Chicago');

try {
  const entry = buildBuiltinEntry();
  if (entry.name === 'Built In Chicago' && entry.provider === 'builtin'
      && entry.builtin.host === 'www.builtinchicago.org'
      && entry.builtin.useTitleFilter === true && entry.builtin.fetchDetails === true) {
    pass('Explore builds one Chicago-first Built In public source using the shared title filter');
  } else {
    fail(`unexpected Built In entry: ${JSON.stringify(entry)}`);
  }

  const ordered = orderDiscoverySources(['builtin', 'lever', 'greenhouse']);
  if (ordered.join(',') === 'lever,greenhouse,builtin') {
    pass('Built In runs after employer ATS sources so canonical ATS records win');
  } else {
    fail(`source order: ${ordered.join(',')}`);
  }

  const canonicalize = buildCompanyCanonicalizer({});
  const ats = { company: 'Acme Security', title: 'Privacy GRC Analyst' };
  const builtIn = { company: 'Acme Security', title: 'Privacy GRC Analyst' };
  const seen = new Set([crossSourceRoleKey(ats, canonicalize)]);
  if (isBuiltinAggregateDuplicate('builtin', builtIn, seen, canonicalize)
      && !isBuiltinAggregateDuplicate('lever', builtIn, seen, canonicalize)) {
    pass('Built In copy is suppressed against an existing normalized ATS company+role while ATS behavior is unchanged');
  } else {
    fail('Built In/ATS duplicate preference drifted');
  }
} catch (error) {
  fail(`Built In reverse-scan tests crashed: ${error.message}`);
}
