const model = value => /\bhybrid\b/i.test(value) ? 'Hybrid' : /\bremote\b/i.test(value) ? 'Remote' : /\bon[- ]?site\b|in[- ]office/i.test(value) ? 'Onsite' : null;
/** Source and captured JD remain separate evidence. A contradiction is not a veto. */
export function reconcileWorkArrangement({ location = '', rawLocation = '', sourceWorkArrangement = '', jd = '', candidateLocation = '' } = {}) {
  const source = model(sourceWorkArrangement) || model(rawLocation) || model(location);
  const attendance = jd.match(/[^.\n]*(?:expected|required|must|minimum|at least)[^.\n]{0,160}(?:office|on[- ]site)[^.\n]{0,160}(?:[1-5]|one|two|three|four|five)\s+days?[^.\n]{0,35}(?:week|weekly)|[^.\n]*(?:office|on[- ]site)[^.\n]{0,100}(?:minimum|at least)\s+(?:[1-5]|one|two|three|four|five)\s+days?[^.\n]{0,35}(?:week|weekly)/i)?.[0]?.trim();
  const onsite = jd.match(/(?:this (?:role|position) (?:is|requires)|must work)\s+(?:fully )?on[- ]?site[^.\n]*/i)?.[0];
  const remote = jd.match(/(?<!not )(?:fully|100%|entirely) remote[^.\n]*|no (?:required |mandatory )?office attendance[^.\n]*/i)?.[0];
  const hybrid = jd.match(/(?:this (?:role|position) is|work (?:model|arrangement)(?: is|:))\s+(?:a )?hybrid\b[^.\n]*/i)?.[0];
  const jdModel = attendance ? (/\b(?:5|five)\s+days/i.test(attendance) ? 'Onsite' : 'Hybrid') : onsite ? 'Onsite' : hybrid ? 'Hybrid' : remote ? 'Remote' : null;
  const conflict = Boolean(source && jdModel && source !== jdModel);
  const reasons = [];
  if (conflict) reasons.push(`WORK_ARRANGEMENT_CONFLICT: source says ${source}; captured JD says ${jdModel}. Human confirmation required; neither signal was discarded.`);
  const area = String(location).replace(/Not captured|United States|\bUS\b|\bremote\b|\bhybrid\b|\bon[- ]?site\b|\bin[- ]office\b|\boffice\b/gi, '').replace(/[^a-z]/gi, '');
  if (candidateLocation && ['Hybrid','Onsite'].includes(jdModel || source) && !area) reasons.push('WORK_LOCATION_UNVERIFIED: office-attendance evidence does not establish a compatible office location');
  if ((source === 'Remote' || jdModel === 'Remote') && /Chicago|Illinois|\bIL\b/i.test(candidateLocation) && !/Illinois|\ball (?:50|fifty) states\b/i.test(`${rawLocation} ${location} ${jd}`)) reasons.push('REMOTE_STATE_ELIGIBILITY_UNVERIFIED: Illinois employment permission is not established by a generic Remote label');
  return { sourceWorkArrangement: source || 'Not captured', jdWorkArrangement: jdModel || 'Not captured',
    workArrangement: conflict ? 'CONFLICT — verify source/JD' : source || jdModel || 'Not captured',
    workArrangementStatus: conflict ? 'CONFLICT' : source || jdModel ? 'CONSISTENT' : 'UNKNOWN',
    workArrangementEvidence: [attendance,onsite,hybrid,remote].filter(value => typeof value === 'string'), workArrangementReasons: reasons };
}
