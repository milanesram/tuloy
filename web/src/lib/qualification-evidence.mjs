// Pure evidence extraction for the existing Lite projection. No I/O, models,
// employer exceptions, inferred personal eligibility, or competing score.
const text = value => typeof value === 'string' ? value.trim() : '';
const PREFERRED = /\b(?:prefer(?:red|ably)?|desirable|nice to have|bonus|a plus|ideally|advantageous|not (?:mandatory|required))\b/i;
const REQUIRED = /\b(?:must|required|requirements?|mandatory|minimum|at least|need(?:ed)?)\b/i;
const HEADINGS = /\b(Preferred Skills|Required Skills|Preferred Qualifications|Preferred Job Qualifications|Preferred(?=\s*:)|Required(?=\s*:)|Nice to Haves?|Bonus Experience|What Sets You Apart|Required Qualifications|Required Job Qualifications|Role Requirements|Skills Needed|What we['’]re looking for|What we['’]d like to see|Who You Are|What you['’]ll bring to the table|What You['’]ll Bring|What you will bring to the team|What You Will Need To Succeed|What you['’]ll need to thrive|Basic Qualifications|Minimum requirements|Required Knowledge and Experiences|Required Technical Skills|Qualifications|(?<!\/)Requirements(?=\s*:|\s*\n|\s+(?:\d|Must\b|Minimum\b|At least\b))|Experiences|Responsibilities|What You['’]ll Do|What you will do|Benefits|Compensation|Pay Transparency|United States of America Pay Ranges|Our Culture|Equal Employment)\b\s*:?/gi;

/** Recover headings and explicit clause starts in flattened paragraphs.
 * Optional sections stay optional, even with emphatic wording in a bullet. */
export function requirementUnits(jd) {
  // New postings retain real HTML block boundaries. Legacy archives recover
  // explicit qualification-clause starts without borrowing a later preference.
  const separated = text(jd).replace(/(?<![,\s])\s+(?=(?:Familiar with|Deep understanding of|Extensive knowledge of|Certified in|BS degree|B\.S\. degree|Big 4 Experience|(?:CISSP|CISA|CISM|CCSK|CRISC|CIPM)\b[^.\n]{0,100}\b(?:a plus|preferred)\b))/g, '\n');
  const blocks = separated.split(HEADINGS);
  let section = 'UNSPECIFIED', heading = '';
  const units = [];
  for (let i = 0; i < blocks.length; i++) {
    if (i % 2) {
      heading = blocks[i];
      section = /preferred|nice to have|bonus|sets you apart/i.test(blocks[i]) ? 'PREFERRED'
        : /required|requirements|qualifications|skills needed|looking for|like to see|who you are|bring|need to succeed|need to thrive|experiences/i.test(blocks[i]) ? 'REQUIRED' : 'UNSPECIFIED';
      continue;
    }
    // Recover explicit bullet starts in flattened public ATS bodies. Do not
    // detach a trailing "preferred/not required" from its credential, or split
    // a nested "including N years" alternative into an unrelated requirement.
    for (const raw of blocks[i].split(/\n+|;\s*|(?<=[.!?])\s+(?=[A-Z0-9])|,\s*(?=(?:preferably|ideally)\s+(?:in|with|having|including)\b)|\s+(?=(?:Must (?:have|be|possess)|Should ideally|Ideally will|At least \w+ \([0-9]+\)|Minimum \d|\d{1,2}\+?\s*[-–]?\s*\d*\s+years|Experience (?:testing|supporting|with|standing|leading|should|in|assessing|working)|Prior experience|SAP S\/4|In-depth multi-ERP|Proven ownership|Deep, operational|Demonstrated ownership|Professional certifications|Relevant certification|Relevant technology|Certification or working|Bachelor['’]s degree|Strong (?:knowledge|understanding|written)|Ability to|Attention to|Deep empathy|Travel (?:Percentage:|to assigned)))/)) {
      let evidence = raw.trim();
      if (/^\d/.test(evidence) && /^(?:maximum|no more than|less than|up to)$/i.test(units.at(-1)?.evidence || "")) evidence = units.pop().evidence + " " + evidence;
      if (!evidence) continue;
      // Section ownership dominates emphatic language inside preferred lists.
      const importance = section === 'PREFERRED' || PREFERRED.test(evidence) ? 'PREFERRED' : REQUIRED.test(evidence) ? 'REQUIRED' : section;
      units.push({ evidence, importance, section, heading });
    }
  }
  return units;
}

/** Read only primary-source positive evidence. Training is not certification,
 * a non-production project is not production experience, and missing evidence
 * is not a claim that a capability/license is absent. */
export function candidateEvidenceFromSources({ cv = '', profile = {} } = {}) {
  const credentials = cv.match(/### Credentials and Certifications\s*([\s\S]*?)(?=\n###|\n##|$)/i)?.[1] ?? cv.match(/(?:^|\n)# Education Credentials and Specialist Training\s*([\s\S]*?)(?=\n# |$)/i)?.[1] ?? '';
  const certifications = [];
  for (const name of ['CIPM', 'CIPT', 'CIPP/US', 'CIPP/E', 'CISA', 'CISM', 'CISSP', 'CRISC', 'CC']) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (credentials.split('\n').some(line => new RegExp(`\\b${escaped}\\b`, 'i').test(line) && !/\b(?:training|not certified|not held)\b/i.test(line))) certifications.push(name);
  }
  const capabilities = {};
  if (/\b(?:lead|led|own|managed)\b[^.\n]{0,100}\bprivacy[- ]program/i.test(cv)) capabilities.privacyOperations = { status: 'SUPPORTED', source: 'cv.md', reason: 'documented privacy-program operating responsibilities; specialized years/statutes not inferred' };
  if (/\b(?:lead|led|deliver)\b[^.\n]{0,130}\b(?:risk and compliance assessments|risk assessment|controls)/i.test(cv)) capabilities.governanceOperations = { status: 'SUPPORTED', source: 'cv.md', reason: 'documented assessment/control responsibilities; framework-specific audit experience not inferred' };
  if (/\b(?:personnel oversight|led the division|supervised|led Human Resources)\b/i.test(cv)) capabilities.peopleManagement = { status: 'SUPPORTED', source: 'cv.md', reason: 'documented personnel responsibilities; team size and executive scope not inferred' };
  if (profile.location?.authorized_in?.some(value => /^(?:United States|US|USA)$/i.test(value))) capabilities.usWorkAuthorization = { status: 'SUPPORTED', source: 'config/profile.yml', reason: 'explicit operational work-authorization configuration' };
  if (profile.location?.needs_sponsorship === false) capabilities.noSponsorshipRequired = { status: 'SUPPORTED', source: 'config/profile.yml', reason: 'explicit operational sponsorship configuration' };
  for (const [key,value] of Object.entries(profile.qualification_evidence || {})) {
    if (value && ['SUPPORTED','MATERIAL_GAP'].includes(value.status) && typeof value.reason === 'string') capabilities[key] = { ...value, source: 'config/profile.yml' };
  }
  return { certifications, certificationSource: 'cv.md', capabilities, resumeBases: profile.resume_bases || {} };
}

function candidateComparison(key, candidate, { names = [], years = null, allRequired = false, conditional = false } = {}) {
  if (conditional) return { candidateEvidence: 'UNVERIFIED', comparisonReason: 'alternative experience/education paths require human verification', candidateSource: null };
  const credentialSourceTrusted = !candidate?.certificationSource || /^(?:cv\.md|config\/profile\.yml|modes\/_profile\.md|user-stated)$/.test(candidate.certificationSource);
  if (key === 'certification' && credentialSourceTrusted && names.length && (allRequired ? names.every(name => candidate?.certifications?.includes(name)) : names.some(name => candidate?.certifications?.includes(name)))) return { candidateEvidence: 'SUPPORTED', comparisonReason: 'the required listed credential(s) are documented in the primary candidate record', candidateSource: candidate.certificationSource || 'config/profile.yml' };
  const known = candidate?.capabilities?.[key];
  const trusted = known && /^(?:cv\.md|config\/profile\.yml|modes\/_profile\.md|user-stated)$/.test(known.source || '');
  if (trusted && ['SUPPORTED', 'MATERIAL_GAP'].includes(known.status) && (years === null || Number.isFinite(known.years) || Number.isFinite(known.yearsAtLeast))) {
    if (years !== null && !Number.isFinite(known.years) && known.yearsAtLeast < years) return { candidateEvidence:'UNVERIFIED', comparisonReason:'documented minimum experience is a lower bound, not a maximum; additional required years need verification', candidateSource:known.source };
    const status = years !== null && Number.isFinite(known.years) && known.years < years ? 'MATERIAL_GAP' : known.status;
    return { candidateEvidence: status, comparisonReason: text(known.reason) || 'explicit primary-source candidate evidence', candidateSource: known.source };
  }
  return { candidateEvidence: 'UNVERIFIED', comparisonReason: 'required scope is not established by available candidate evidence; absence was not inferred', candidateSource: null };
}

export function materialRequirements(jd, candidate = {}) {
  const requirements = [];
  const add = (category, label, unit, key, options = {}) => {
    if (unit.importance === 'UNSPECIFIED' && !options.duty) return;
    const importance = options.duty && unit.importance === 'UNSPECIFIED' ? 'REQUIRED' : unit.importance;
    const evidence = unit.evidence;
    const comparison = candidateComparison(key, candidate, options);
    requirements.push({ category, requirement: label, importance, evidence, ...comparison, specialized: Boolean(options.specialized),
      ...(options.years !== undefined ? { years: options.years } : {}), capability: key });
  };
  for (const unit of requirementUnits(jd)) {
    const s = unit.evidence;
    if (/\b(?:bar admission|(?:state|local state) bar|license to practice law|licensed attorney|bar association|U\.S\. jurisdiction)\b/i.test(s) && /\b(?:active|admitted|license|member|must|eligible to waive)\b/i.test(s)) add('PROFESSIONAL_LICENSE', 'active professional law license / bar admission', unit, 'legalLicense', { duty: /\bActive (?:license|member)\b/.test(s) });
    if (/\b(?:J\.D\.|JD|Juris Doctor)(?:\s*\(J\.D\.\))?\s+[^.\n]{0,100}(?:United States|U\.S\. law school)/i.test(s)) add('LEGAL_EDUCATION', 'U.S. law-school J.D.', unit, 'usLegalEducation');
    if (/\b(?:CPA license|professional engineer license|RN license)\b/i.test(s)) add('PROFESSIONAL_LICENSE', 'professional license', unit, 'professionalLicense');
    if (/\b(?:clearance|TS\/SCI)\b/i.test(s) && /\b(?:active|current|must|required|hold|possess)\b/i.test(s)) add('CLEARANCE', 'active clearance', unit, 'clearance');
    const certifications = [...s.matchAll(/\b(?:CIPM|CIPT|CIPP\/(?:US|E)|CISA|CIA|CISM|CISSP|CCSK|CRISC|CPA|ISO (?:27001|42001) Lead (?:Auditor|Implementer))\b/gi)].map(m => m[0].toUpperCase());
    if (certifications.length && /\b(?:certification|certified|credential|CISA|CIPM|CISSP|CRISC|CIPP)\b/i.test(s)) add('CERTIFICATION', `credential: ${[...new Set(certifications)].join(' / ')}`,
      /^Relevant certifications/i.test(s) && !REQUIRED.test(s) && !/required|minimum|basic/i.test(unit.heading) ? { ...unit, importance: 'UNVERIFIED' } : unit,
      'certification', { names: certifications, allRequired: /\band\b/i.test(s) && !/\bor\b|such as|at least one/i.test(s) });
    const years = [...s.matchAll(/\b(?:at least\s+)?(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\+?\s+years?\b|\b\w+ \((\d{1,2})\) years?/gi)].map(m => Number(m[1] || m[2]));
    if (years.length && !/\byears? in a row\b/i.test(s) && !/\b(?:maximum|no more than|less than|up to)\s+\d/i.test(s) && /experience|years required|years.*(?:working|in |focused|engineering|leadership)/i.test(s)) {
      const key = /\b(?:CrowdStrike|Splunk|SIEM|SOAR|Sentinel)\b/i.test(s) ? 'socOperations'
        : /\b(?:Active Directory|Entra|Okta)\b/i.test(s) ? 'enterpriseIam'
        : /\b(?:ServiceNow|Zendesk|Remedy|Intune|SCCM|Jamf)\b/i.test(s) ? 'supportTooling'
        : /\b(?:software|privacy|security) engineering\b/i.test(s) ? 'productionEngineering'
        : /\b(?:legal experience|legal practice|litigation|lawyer|attorney)\b/i.test(s) ? 'legalPractice'
        : /\b(?:GRC platform|platform delivery|platform.*administration)\b/i.test(s) ? 'grcPlatform'
        : /\b(?:credit|underwriting|financial risk modeling)\b/i.test(s) ? 'commercialUnderwriting'
        : /\bISO\s*(?:27001|42001)\b.*audits?\b/i.test(s) ? 'frameworkAudit'
        : /\b(?:IT audit|IT auditor|public accounting|internal audit)\b/i.test(s) ? 'itAudit'
        : /\bhealthcare\b/i.test(s) ? 'healthcareExperience' : /\bprivacy\b/i.test(s) ? 'privacyOperations' : 'governanceOperations';
      const domainYears = /including\s+\d+\+?\s+years/i.test(s) ? years[0] : Math.min(...years);
      const leadershipOnly = /^\d+\+?\s+years(?:\s+(?:of|in))?\s+(?:leadership|management)/i.test(s);
      // A bare "Experience N years" label is worth exposing, but its lost
      // section context cannot prove mandatory or preferred importance.
      const experienceUnit = unit.importance === 'UNSPECIFIED' && /^Experience \d/i.test(s) ? { ...unit, importance: 'UNVERIFIED' } : unit;
      if (!leadershipOnly) add('EXPERIENCE', `${domainYears}+ years: ${key.replace(/([A-Z])/g, ' $1').toLowerCase()}`, experienceUnit, key, { years: domainYears, specialized: ['productionEngineering','legalPractice','grcPlatform','healthcareExperience','commercialUnderwriting','itAudit','frameworkAudit','socOperations','enterpriseIam','supportTooling'].includes(key), duty: /^At least /i.test(s), conditional: /\bor (?:in )?an? equivalent\b/i.test(s) || (years.length > 1 && /\b(?:degree|bachelor|master)\b/i.test(s)) });
      const managementYears = /(?:including\s+)?(\d+)\+?\s+years(?:\s+(?:of|in))?\s+(?:leadership|(?:experience\s+)?(?:(?:managing|supervising)\s+(?:people|teams|staff|employees|managers)|leading\s+(?:people|teams)))/i.exec(s)?.[1];
      if (managementYears) {
        const managers = /people managers|managers of managers/i.test(s);
        add('PEOPLE_MANAGEMENT', `${managementYears || domainYears}+ years: ${managers ? 'managing people managers and senior contributors' : 'people leadership'}`, unit, managers ? 'managementOfManagers' : 'peopleManagement', { years: Number(managementYears || domainYears), specialized: true });
      }
    }
    if (/\b(?:extensive|deep|strong)\b.*\b(?:knowledge|understanding)\b.*\b(?:framework|ISO|NIST|SOC)\b/i.test(s)) add('FRAMEWORK_EXPERTISE', 'specialized compliance-framework knowledge', unit, 'frameworkExpertise', { specialized: true });
    if (/\b(?:familiar|familiarity|knowledge|experience)\b.*\b(?:GCP|AWS|Azure|model validations?|AI architectures?)\b/i.test(s)) add('TECHNICAL_FAMILIARITY', 'cloud / AI architecture / model-validation familiarity', unit, 'cloudAiFamiliarity', { specialized: true });
    if (/\b(?:BS|B\.S\.|Bachelor['’]s)\b.*\bdegree\b|\bBS degree\b/i.test(s)) add('EDUCATION', 'relevant degree or stated equivalent experience', unit, 'relevantEducation', { conditional: true });
    const specializedScopes = [
      [/\bSAP S\/4\b/i, 'SAP S/4 audit experience', 'sapS4Audit', /audit|experience/i],
      [/\bERP\b|multi-ERP/i, 'ERP audit / multi-ERP controls expertise', 'erpAudit', /audit|expertise|experience|review/i],
      [/\bITGCs?\b|IT General Controls/i, 'ITGC testing experience', 'itgcTesting', /test|assess|experience/i],
      [/automated controls|ITACs|automated application controls/i, 'automated-controls / key-report audit experience', 'automatedControlsAudit', /test|audit|experience/i],
      [/cloud|infrastructure/i, 'cloud / infrastructure audit expertise', 'cloudAudit', /audit|testing ITGC|technical expertise/i],
      [/cloud-native SaaS|SaaS/i, 'specialized SaaS multi-framework compliance ownership', 'saasCompliance', /proven ownership|experience|multi-framework/i],
      [/FedRAMP/i, 'FedRAMP experience', 'fedrampExperience', /experience/i],
      [/commercial (?:credit )?underwriting/i, 'commercial credit underwriting experience', 'commercialUnderwriting', /experience|knowledge/i],
      [/financial risk modeling/i, 'financial risk modeling / cash-flow forecasting', 'financialRiskModeling', /experience|knowledge/i],
    ];
    for (const [pattern, label, key, context] of specializedScopes) {
      // Responsibilities involving tools do not by themselves assert prior
      // specialized experience. Alternative domain paths are not conjunctions.
      const alternativeDomains = years.length && /\bor a combination\b/i.test(s);
      const qualificationContext = unit.section !== 'UNSPECIFIED' || /\b(?:must have|experience (?:is )?required|expertise required)\b/i.test(s);
      if (!alternativeDomains && qualificationContext && pattern.test(s) && context.test(s)) add('SPECIALIZED_EXPERIENCE', label, unit, key, { specialized: true });
    }
    if (/\b(?:own|lead)\b[^.]{0,90}\b(?:FedRAMP|path to FedRAMP)\b/i.test(s)) add('SPECIALIZED_EXPERIENCE', 'FedRAMP program ownership (responsibility)', unit, 'fedrampOwnership', { specialized: true, duty: true });
    if (/currently (?:enrolled|pursuing)|must be enrolled|current student|return(?:ing)? to (?:school|university)|pursuin\s*g\b|expected (?:graduation|completion of degree)|graduation (?:date|window)|graduat(?:e|ing|ion) (?:in|between|by|from)|campus recruiting|recent graduate eligibility|internship eligibility/i.test(s)) {
      const normalized = s.replace(/\b(20\d)\s+(\d)\b/g, '$1$2');
      const dates = [...normalized.matchAll(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December|Spring|Summer|Fall|Winter)\s+20\d{2}\b/gi)].map(m => m[0]);
      add('EDUCATION_ELIGIBILITY', `degree / graduation-cohort eligibility${dates.length ? `: ${dates.join(' or ')}` : ': explicit student / graduate-program condition'}`, unit, /currently (?:enrolled|pursuing)|must be enrolled|current student|return(?:ing)? to (?:school|university)|pursuin\s*g/i.test(s) ? 'currentEnrollment' : /graduat|completion of degree/i.test(s) ? 'graduationEligibility' : 'educationEligibility', { specialized: true, duty: true });
    }
    if (/\b(?:maximum|no more than|less than|up to)\s+\d+\s+years?\b/i.test(s) && /experience/i.test(s)) add('MAXIMUM_EXPERIENCE', 'maximum prior experience limit', unit, 'maximumExperienceEligibility', { duty: true });
    if (/\b(?:start date|cohort|program (?:begins|starts)|(?:must|available|availability) (?:be |to )?start(?![- ]?up)|(?:start|commence)\w* (?:on|by|between))\b/i.test(s)) add('COHORT_TIMING', s, unit, 'cohortTiming', { duty: true });
    if (/\b(?:must|requires?|required|experience|proficien\w*)\b/i.test(s)) {
      for (const [pattern,key,label] of [
        [/\b(?:ServiceNow|Jira|Zendesk|Remedy)\b/i, 'supportTooling', 'current support / ticketing tool proficiency'],
        [/\b(?:Active Directory|Entra|Okta)\b/i, 'enterpriseIam', 'enterprise IAM administration'],
        [/\b(?:Splunk|Sentinel|SIEM|SOAR|CrowdStrike)\b/i, 'socOperations', 'SOC operations / security tooling'],
        [/\b(?:Intune|SCCM|Jamf)\b/i, 'endpointAdministration', 'endpoint administration'],
      ]) if (pattern.test(s)) add('TECHNICAL_TOOL', label, unit, key, { specialized: true });
    }
    if (/\b(?:production systems|production software|production engineering|production platform)\b/i.test(s) && /\b(?:experience|programming|build|built|write|own|develop)\b/i.test(s)) add('PRODUCTION_ENGINEERING', 'production software / systems engineering experience', unit, 'productionEngineering', { specialized: true, duty: true });
    if (/\b(?:experience|involvement)\b/i.test(s) && /\b(?:formal audit|audit cycle|SOC ?2.*audits?|HITRUST.*audits?)\b/i.test(s)) add('FRAMEWORK_AUDIT_EXPERIENCE', 'formal security-framework audit involvement / ownership', unit, 'frameworkAudit');
    if (/\b(?:working proficiency|hands-on ability|hands-on experience|expertise|advanced proficiency)\b/i.test(s) && /\b(?:SQL|scripting|Power BI|ServiceNow|GRC.*platform|platform.*GRC|privacy engineering|PKI)\b/i.test(s)) add('SPECIALIZED_PLATFORM', 'specialized technical tooling or platform capability', unit, /\bGRC.*platform|platform.*GRC|ServiceNow\b/i.test(s) ? 'grcPlatform' : 'specializedTooling', { specialized: true });
    if (/\b(?:deeply skilled|hands-on configuring|hands-on.*administering)\b/i.test(s) && /\bGRC platforms?\b/i.test(s)) add('SPECIALIZED_PLATFORM', 'hands-on GRC-platform configuration / administration', unit, 'grcPlatform', { specialized: true, duty: true });
    if (!/training provided|will (?:teach|train)|no (?:prior )?experience required/i.test(s) && /\b(?:monitor|operate|administer|configure)\w*\b/i.test(s) && /\b(?:SIEM|Splunk|Sentinel|Active Directory|Okta|Intune|Jamf)\b/i.test(s)) add('TECHNICAL_TOOL', 'operational security / administration tooling', unit, /SIEM|Splunk|Sentinel/i.test(s) ? 'socOperations' : 'enterpriseIam', { specialized: true, duty: true });
    if (/\b(?:lead|leading|implement|implementation)\b[^.]{0,90}\b(?:Public Key Infrastructure|PKI)\b|\bPKI\b[^.]{0,60}\bimplementation\b/i.test(s)) add('SPECIALIZED_PLATFORM', 'PKI implementation', unit, 'pkiImplementation', { specialized: true, duty: true });
    if (/\b(?:experience|proven|demonstrated)\b[^.]{0,100}\b(?:leading|managing|manage|supervising|people management)\b/i.test(s)
      && /\b(?:people|staff|employees|direct reports|teams|managers|personnel)\b/i.test(s)
      && !requirements.some(r => r.category === 'PEOPLE_MANAGEMENT' && r.evidence === s)) add('PEOPLE_MANAGEMENT', 'people-management experience', unit, 'peopleManagement', years.length ? { years: Math.min(...years), specialized: true } : {});
    if (/\btravel\b/i.test(s) && /\b(?:required|must|ability|can|up to|as needed)\b|\d+\s*%/i.test(s)) add('TRAVEL', s.match(/\b\d+(?:\s*[-–]\s*\d+)?\s*%/)?.[0] ? `travel ${s.match(/\b\d+(?:\s*[-–]\s*\d+)?\s*%/)[0]}` : 'travel as required', unit, 'travel', { duty: true });
    if (/\b(?:authorized|legally authorized)\b[^\n]{0,70}(?:U\.S\.|\bUnited States\b)/i.test(s)) add('WORK_AUTHORIZATION', 'U.S. work authorization', unit, 'usWorkAuthorization', { duty: true });
    if (/\b(?:no sponsorship|sponsorship is not available|does not (?:provide|sponsor)|without.*sponsorship)\b/i.test(s)) add('SPONSORSHIP', 'no employer sponsorship available', unit, 'noSponsorshipRequired', { duty: true });
  }
  // Different clauses may describe the same requirement. Keep one summary per
  // category/label/importance, without dropping its required-vs-preferred split.
  const seen = new Set();
  return requirements.filter(item => { const key = `${item.category}:${item.requirement}:${item.importance}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

export function occupationEvidence(title, jd, requirements) {
  const legalTitle = /\b(?:counsel|attorney|lawyer)\b/i.test(title);
  const ownWork = jd.replace(/\b(?:partner|collaborate|liaise|work)\w*\s+(?:closely\s+)?(?:with|alongside)\s+(?:an? |the |our )?(?:in-house counsel|legal advisor|legal counsel)\b/gi, '');
  const legalDuties = /\b(?:legal advisor|legal advice|legal guidance|litigation|legal research|privacy counseling|in-house (?:counsel|legal)|practi[cs]e.*law|lawyer|attorney)\b/i.test(ownWork);
  const requiredBar = requirements.some(r => r.category === 'PROFESSIONAL_LICENSE' && /law license/.test(r.requirement) && r.importance === 'REQUIRED');
  const nonLegalPractice = /\b(?:not (?:a |an )?(?:legal[- ]counsel|attorney|lawyer) (?:position|role)|not (?:expected|required) to (?:practi[cs]e law|provide legal advice)|(?:do not|don't|don’t) provide legal advice)\b/i.test(jd);
  const legalPrimary = Boolean(jd && !nonLegalPractice && legalDuties && (legalTitle || requiredBar));
  const technicalTitle = /\b(?:engineer|architect|developer)\b/i.test(title);
  const engineeringExplicit = /\b(?:this is|is) (?:a |an )?(?:hands-on |production )?(?:software |privacy |security )?engineering role\b/i.test(jd);
  const softwareTitle = /\b(?:software|application|AI\/ML) (?:development )?(?:engineer|developer)\b/i.test(title);
  const productionRequired = requirements.some(r => r.category === 'PRODUCTION_ENGINEERING' && r.importance === 'REQUIRED');
  const codeCore = /\b(?:write|develop|build|own|maintain)\b[^.\n]{0,80}\b(?:production software|production services|application code|distributed systems|software architecture)\b/i.test(jd);
  const delegated = /\b(?:not (?:a |an )?software engineering role|not expected to do (?:that )?engineering|(?:do not|don’t|don't) need to be an engineer|engineering builds|hands-on development is not required)\b/i.test(jd);
  const engineeringPrimary = Boolean(jd && !delegated && (engineeringExplicit || (softwareTitle && codeCore) || (technicalTitle && productionRequired && codeCore)));
  const technicalGovernance = !engineeringPrimary && /\b(?:engineer|technologist)\b/i.test(title)
    && /\b(?:working proficiency in SQL|write scripts|scripts,.*API integrations|hands-on.*SQL|privacy engineering|technical privacy)\b/i.test(jd);
  const financialTitle = /\b(?:credit risk|financial risk|market risk|commercial underwriter|underwriter)\b/i.test(title)
    && !/\b(?:IT[- ]risk|technology[- ]risk|cybersecurity|information security|GRC)\b/i.test(title);
  const financialPrimary = financialTitle && /\b(?:underwrite|underwriting|cash flow forecasting|financial risk modeling|credit loss targets|merchant pricing)\b/i.test(jd);
  const unpaid = requirementUnits(jd).some(({ evidence }) => !/\b(?:not (?:an? )?unpaid|not (?:an? )?volunteer|no unpaid)\b/i.test(evidence)
    && /\b(?:unpaid (?:position|volunteer|role)|volunteers? \(unpaid\)|(?:this|the|our) (?:is|role is|position is) (?:an? )?volunteer (?:role|position)|all current opportunities.*volunteer|recruit VOLUNTEERS|fundraising-only)\b/i.test(evidence));
  const reasons = legalPrimary ? ['UNRELATED_ROLE_FAMILY: primary occupation is legal practice, not governance/program operations']
    : engineeringPrimary ? ['UNRELATED_ROLE_FAMILY: primary occupation is production engineering, not governance/program operations']
    : financialPrimary ? ['UNRELATED_ROLE_FAMILY: primary occupation is financial / commercial credit underwriting, not technology/security governance'] : [];
  if (technicalGovernance) reasons.push('TECHNICAL_GOVERNANCE: hands-on technical privacy/automation scope needs specialized evidence');
  if (unpaid) reasons.push('EMPLOYMENT_TYPE_EXCLUSION: position is explicitly unpaid / volunteer rather than paid professional employment');
  return { legalPrimary, engineeringPrimary, financialPrimary, technicalGovernance, unpaid, reasons };
}

export function dutyAwareSeniority(title, jd, duties, band, requirements = materialRequirements(jd), route = null) {
  const years = requirements.filter(r => r.category === 'EXPERIENCE' && r.importance === 'REQUIRED' && Number.isFinite(r.years)).map(r => r.years);
  const minimumYears = years.length ? Math.min(...years) : null;
  const largeTeam = [...jd.matchAll(/\b(?:lead|manage|oversee)\w*\s+(?:(?:a|the)\s+)?(?:(?:team|department|organization|workforce)\s+of\s+)?(\d{2,3})\s+(?:employees|staff|people|direct reports)\b/gi)].some(m => Number(m[1]) >= 20);
  const managers = /\b(?:manage|lead|oversee)\w*\s+(?:(?:the|a team of)\s+)?(?:managers of managers|multiple departments|department heads|organization-wide people leadership)\b/i.test(jd);
  const executiveOwnership = /\b(?:own|accountable for|responsible for)\b[^.\n]{0,70}\b(?:P&L|profit and loss|enterprise-wide budget|business-unit budget)\b/i.test(jd);
  const explicitExecutive = /\b(?:serve|act) as\b[^.\n]{0,50}\b(?:CISO|chief executive|chief privacy officer)\b/i.test(jd);
  const executive = explicitExecutive || managers || (largeTeam && executiveOwnership);
  const trainingOnly = /\b(?:training[- ]only|shadow senior|no independent (?:responsibility|work)|learn (?:the )?basics|entry-level training|routine data entry)\b/i.test(jd);
  const handsOn = /\b(?:hands-on|individual[- ]contributor|independent(?:ly)?|limited oversight|implement|implementation|assessments?|investigat\w*|remediat\w*|control testing|privacy program|risk treatment)\b/i.test(jd);
  const substantive = duties.length >= 2 || (duties.length >= 1 && handsOn);
  const engagementLeadership = /\b(?:lead|leading|review|reviewing|mentor|mentoring|supervise)\b[^.]{0,100}\b(?:staff|senior consultants|engagements|projects)\b/i.test(jd);
  const staffLeadership = /\b(?:supervise|supervising|review|reviewing|manage|managing)\b[^.]{0,70}\b(?:staff work|staff|senior consultants|direct reports)\b/i.test(jd);
  const campus = requirements.some(r => r.category === 'EDUCATION_ELIGIBILITY' && r.importance === 'REQUIRED');
  let classification = 'UNCLEAR', bridge = 'UNCLEAR';
  const reasons = [];
  if (executive) { classification = 'TOO_SENIOR'; bridge = 'NOT_A_BRIDGE'; reasons.push('EXECUTIVE_SCOPE: explicit organizational/people or executive ownership exceeds the hands-on target band'); }
  else if (trainingOnly && !substantive && route !== 'C') { classification = 'TOO_JUNIOR'; bridge = 'NOT_A_BRIDGE'; reasons.push('TRAINING_SCOPE: training/routine work lacks substantive governance responsibility'); }
  else if (campus && route !== 'C') { reasons.push('CAMPUS_ELIGIBILITY: explicit graduation/student cohort requires verification; domain relevance alone is not a professional bridge'); }
  else if (route === 'C' && duties.length) { classification = 'US_MARKET_BRIDGE'; bridge = 'US_MARKET_BRIDGE'; reasons.push('TECHNICAL_ENTRY: assess supervised daily tasks, tools and learning; total career tenure is not an overqualification penalty'); }
  else if (substantive && /\b(?:analyst(?: I)?|associate|specialist|consultant|advisor|coordinator)\b/i.test(title) && !/\b(?:senior|sr\.?|lead|director|head|manager)\b/i.test(title) && !staffLeadership && (minimumYears === null || minimumYears <= 7)) {
    classification = 'US_MARKET_BRIDGE'; bridge = 'US_MARKET_BRIDGE'; reasons.push('SUBSTANTIVE_BRIDGE: lower title retains assessment, controls, incident/program or remediation duties');
  } else if (substantive || (jd && ['CORE','STRETCH','SCOPE REVIEW'].includes(band) && duties.length)) {
    classification = 'EXPERIENCE_ALIGNED'; bridge = 'NOT_A_BRIDGE'; reasons.push('HANDS_ON_SCOPE: substantive execution/ownership supports the experience-aligned band; title alone is not a veto');
  } else reasons.push('SCOPE_UNCLEAR: available duties do not establish responsibility level; title alone cannot determine seniority');
  if (minimumYears !== null) reasons.push(`EXPERIENCE_EVIDENCE: minimum stated experience ${minimumYears} years; specialized scope still needs candidate verification`);
  if (engagementLeadership) reasons.push(classification === 'US_MARKET_BRIDGE' ? 'PROJECT_OWNERSHIP: independent project delivery is compatible with a substantive bridge; organizational people leadership was not established'
    : 'LEADERSHIP_SCOPE: engagement/project or staff responsibilities coexist with hands-on duties; not a lower-title bridge');
  return { band, classification, bridge, years: minimumYears, reasons, evidence: { executive, largeTeam, managers, executiveOwnership, trainingOnly, handsOn, substantive, engagementLeadership, staffLeadership, campus } };
}

export function requirementSummary(requirement) {
  return `${requirement.requirement} — ${requirement.importance}; candidate evidence: ${requirement.candidateEvidence}${requirement.candidateSource ? ` (${requirement.candidateSource})` : ''}`;
}
