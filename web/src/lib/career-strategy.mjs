const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function matches(text, term) {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(term.normalize('NFKC'))}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text.normalize('NFKC'));
}
/** Literal terms only. Configured routes select work to review; they never
 * establish candidate credentials or bypass posting/identity/requirement gates. */
export function selectConfiguredRoute(title, jd, strategy) {
  const routes = strategy.routes.map(route => {
    const duties = route.dutyTerms.filter(term => matches(jd, term));
    const excluded = route.excludeTerms.some(term => matches(`${title}\n${jd}`, term));
    const score = excluded ? 0 : duties.length * 4 + route.titleTerms.filter(term => matches(title, term)).length;
    return {...route, duties, score};
  }).sort((a,b) => b.score - a.score || a.code.localeCompare(b.code));
  const first = routes[0];
  const scores = Object.fromEntries(routes.map(route => [route.code, route.score]));
  if (!first?.score) return {code:'UNCLEAR', lane:null, resume:null, resumeCode:'MANUAL_REVIEW', duties:[], scores, custom:true};
  if (routes[1]?.score === first.score) return {code:'HYBRID', lane:'Competing configured routes', resume:null, resumeCode:'MANUAL_REVIEW', duties:first.duties, scores, custom:true};
  return {code:first.code, lane:first.label, resume:first.resume || null, resumeCode:first.code, resumeBase:first.resume || null, duties:first.duties, scores, custom:true,
    explanation:`Configured route ${first.label}: ${first.duties.length} duty term(s); scope and eligibility require human review.`};
}
