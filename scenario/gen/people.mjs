// People: org, jobs, positions, skills, employees (permanent, replacements, agency temps), attendance model, overtime plan, payroll arithmetic.
import { addDays, dateList, dow, isWork, U, fnv1a32, r2, rint, sum, pad, diffDays, monthEnd, monthStart, HOLIDAYS } from './lib.mjs';
import { CREW, FA_OPS } from './master.mjs';

export const C_WINDOW = { from: '2026-08-29', to: '2026-09-24', line: 'FA-2', shift: 'C' };   // production dates (overnight shift belongs to the date it starts)
export const GRADES = { G1: [7000, 8500, 7800], G2: [8500, 10500, 9500], G3: [10000, 14000, 12000], G4: [12000, 18000, 15000], G5: [15000, 22000, 18500], G6: [22000, 35000, 28000], G7: [40000, 65000, 52000], G8: [75000, 150000, 100000] };   // research §6.3
export const SI = { ee: 0.11, er: 0.1875, min: 2700, max: 16700, basic_share: 0.65 };   // research §6.2; insurable wage = basic = 65 % of gross [E]
export const OT_RULES = { day_premium: 0.35, night_premium: 0.70, rest_day_premium: 1.00, night_allowance_pct_basic: 0.15, hour_divisor: 240, max_ot_day_h: 2, max_day_total_h: 10, max_ot_week_h: 12, max_ot_month_h: 40, night_window: '19:00-07:00 [verify]', note: 'Labour Law 14/2025: premium at least 35 % day / 70 % night [S35]; daily cap 10-12 h quoted in sources, 10 h used [E, verify against the law text]; rest-day work = substitute day + 100 % premium (policy) [E]' };
export const AGENCY = { code: 'S-SMS', name: 'Sharqia Manpower Services', margin_pct: 22, rate_basis: '7,000 EGP monthly minimum wage / 240 h x (1 + 22 % margin); night shift +15 %', hourly: r2(7000 / 240 * 1.22), hourly_night: r2(7000 / 240 * 1.22 * 1.15) };

export const SKILLS = [
  { code: 'ESD', name: 'ESD awareness and EPA discipline (ANSI/ESD S20.20, wrist-strap and heel test)', levels: 4, validity_months: 12, mandatory_for: 'all_production' },
  { code: 'IPC610', name: 'IPC-A-610 acceptability of electronic assemblies (inspectors and repair)', levels: 4, validity_months: 24 },
  { code: 'SMTOP', name: 'SMT line operation (printer, mounter, reflow)', levels: 4, validity_months: 24 },
  { code: 'AOI', name: 'AOI / SPI operation and programming', levels: 4, validity_months: 24 },
  { code: 'FTEST', name: 'Function test and ICT operation', levels: 4, validity_months: 24 },
  { code: 'WB', name: 'White balance / gamma alignment', levels: 4, validity_months: 24 },
  { code: 'HIPOT', name: 'Hi-pot safety test operation', levels: 4, validity_months: 12 },
  { code: 'PACK', name: 'Packing and palletizing', levels: 4, validity_months: 36 },
  { code: 'FORK', name: 'Forklift licence', levels: 4, validity_months: 36 },
  { code: 'LEAD', name: 'Line leader', levels: 4, validity_months: 36 },
  { code: 'ASSY', name: 'Final assembly operations (clean booth, boards, back cover)', levels: 4, validity_months: 36 },
];
export const SKILL_LEVELS = { 1: 'L1 trainee (supervised)', 2: 'L2 qualified (may work alone on the station)', 3: 'L3 expert (may train and cover any station of the line)', 4: 'L4 trainer / process owner' };
const OPSKILL = { CHS: 'ASSY', LED: 'ASSY', OPT: 'ASSY', OCM: 'ASSY', BRD: 'ASSY', BCV: 'ASSY', ACC: 'ASSY', SWD: 'FTEST', WB: 'WB', FT: 'FTEST', HPT: 'HIPOT', VIS: 'IPC610', PKG: 'PACK', PAL: 'PACK' };
export const STATION_REQUIREMENTS = [];   // station -> [{skill, min_level}] (GMES station requirement / HR skill gating)
for (const line of ['FA-1', 'FA-2']) for (const o of FA_OPS) {
  const req = [{ skill: 'ESD', min_level: 2 }];
  if (OPSKILL[o[1]]) req.push({ skill: OPSKILL[o[1]], min_level: 2 });
  if (o[5] + o[6] > 0 || true) STATION_REQUIREMENTS.push({ station: `${line}-${o[1]}`, requires: req, crew: line === 'FA-1' ? o[5] : o[6] });
}
STATION_REQUIREMENTS.push({ station: 'FA-1-RPR', requires: [{ skill: 'ESD', min_level: 2 }, { skill: 'IPC610', min_level: 2 }], crew: 0 }, { station: 'FA-2-RPR', requires: [{ skill: 'ESD', min_level: 2 }, { skill: 'IPC610', min_level: 2 }], crew: 0 });
for (const [c, sk] of [['SPP', 'SMTOP'], ['MT1', 'SMTOP'], ['MT2', 'SMTOP'], ['RFL', 'SMTOP'], ['AOI', 'AOI'], ['RPR', 'IPC610']]) STATION_REQUIREMENTS.push({ station: `SMT-1-${c}`, requires: [{ skill: 'ESD', min_level: 2 }, { skill: sk, min_level: 2 }], crew: 1 });
for (const [c, sk, n] of [['INS', null, 6], ['WAV', 'SMTOP', 1], ['TUP', 'IPC610', 2], ['ICT', 'FTEST', 1], ['HPT', 'HIPOT', 1], ['BRN', null, 1]]) STATION_REQUIREMENTS.push({ station: `THT-1-${c}`, requires: [{ skill: 'ESD', min_level: 2 }, ...(sk ? [{ skill: sk, min_level: 2 }] : [])], crew: n });

export const JOBS = [
  ['J-OPR', 'Line operator (final assembly)', 'G1', 'direct'], ['J-TST', 'Test / inspection operator', 'G2', 'direct'], ['J-PACK', 'Packer / palletizer', 'G1', 'direct'], ['J-LDR', 'Line leader', 'G3', 'direct'],
  ['J-REP', 'Repair technician', 'G3', 'direct'], ['J-FLT', 'Material handler / forklift driver', 'G2', 'direct'], ['J-SMTOP', 'SMT operator', 'G2', 'direct'], ['J-AOI', 'AOI operator', 'G2', 'direct'], ['J-THT', 'THT / wave / burn-in operator', 'G2', 'direct'],
  ['J-WHK', 'Storekeeper', 'G2', 'indirect'], ['J-REC', 'Receiving clerk', 'G3', 'indirect'], ['J-KIT', 'Kitting operator', 'G1', 'indirect'], ['J-SHIP', 'Shipping clerk', 'G3', 'indirect'], ['J-IMP', 'Import clerk', 'G4', 'indirect'], ['J-WHS', 'Warehouse supervisor', 'G6', 'indirect'],
  ['J-IQC', 'IQC inspector', 'G3', 'indirect'], ['J-OQC', 'OQC inspector', 'G3', 'indirect'], ['J-LAB', 'Lab technician', 'G4', 'indirect'], ['J-QE', 'Quality engineer', 'G5', 'indirect'], ['J-CQE', 'Customer quality engineer', 'G5', 'indirect'], ['J-QM', 'Quality manager', 'G7', 'indirect'],
  ['J-MTC', 'Maintenance technician', 'G4', 'indirect'], ['J-MEN', 'Maintenance engineer', 'G5', 'indirect'], ['J-MM', 'Maintenance manager', 'G7', 'indirect'],
  ['J-PE', 'Process engineer', 'G5', 'indirect'], ['J-TE', 'Test / SW engineer', 'G5', 'indirect'], ['J-IE', 'Industrial engineer', 'G5', 'indirect'], ['J-NPI', 'NPI engineer', 'G6', 'indirect'], ['J-SE', 'SMT engineer', 'G6', 'indirect'], ['J-EM', 'Engineering manager', 'G7', 'indirect'], ['J-TT', 'Tooling technician', 'G4', 'indirect'],
  ['J-PM', 'Plant manager', 'G8', 'indirect'], ['J-SUP', 'Production supervisor', 'G6', 'indirect'],
  ['J-SCM', 'SCM manager', 'G7', 'indirect'], ['J-MRP', 'MRP controller', 'G6', 'indirect'], ['J-PLN', 'Production planner', 'G4', 'indirect'], ['J-BUY', 'Buyer', 'G4', 'indirect'],
  ['J-EHS', 'EHS officer', 'G5', 'indirect'], ['J-EHT', 'EHS technician', 'G4', 'indirect'],
  ['J-FM', 'Finance manager', 'G7', 'indirect'], ['J-ACC', 'Accountant', 'G4', 'indirect'], ['J-CAC', 'Cost accountant', 'G5', 'indirect'],
  ['J-HRM', 'HR manager', 'G7', 'indirect'], ['J-HRO', 'HR officer', 'G4', 'indirect'], ['J-NUR', 'Clinic nurse', 'G4', 'indirect'],
  ['J-IT', 'IT / MES administrator', 'G5', 'indirect'],
  ['J-SM', 'Sales manager', 'G7', 'indirect'], ['J-KAM', 'Key account manager', 'G5', 'indirect'], ['J-EXP', 'Export executive', 'G5', 'indirect'], ['J-CSR', 'Customer service representative', 'G3', 'indirect'], ['J-MKT', 'Marketing specialist', 'G4', 'indirect'],
  ['J-CEO', 'Chief executive officer', 'G8', 'indirect'], ['J-CFO', 'Chief financial officer', 'G8', 'indirect'], ['J-COO', 'Chief operating officer', 'G8', 'indirect'],
].map(([code, title, grade, kind]) => ({ code, title, grade, kind }));
const JOB = Object.fromEntries(JOBS.map((j) => [j.code, j]));

// units: code, name, cost center, parent, kind
export const ORG = [
  ['NVE', 'Nile Vision Electronics S.A.E.', null, null, 'company'], ['MGT', 'Top management', 'CC-MGT', 'NVE', 'dept'], ['PRD', 'Production', null, 'NVE', 'dept'],
  ['FA1', 'Final assembly line FA-1', 'CC-FA1', 'PRD', 'section'], ['FA2', 'Final assembly line FA-2', 'CC-FA2', 'PRD', 'section'], ['SMT', 'SMT line 1', 'CC-SMT', 'PRD', 'section'], ['THT', 'THT / wave / test cell', 'CC-THT', 'PRD', 'section'],
  ['REL', 'Relief pool', 'CC-REL', 'PRD', 'section'], ['PMG', 'Production management', 'CC-PMG', 'PRD', 'section'], ['WHL', 'Warehouse and logistics', 'CC-WHL', 'NVE', 'dept'], ['QA', 'Quality', 'CC-QA', 'NVE', 'dept'], ['MNT', 'Maintenance and facilities', 'CC-MNT', 'NVE', 'dept'],
  ['ENG', 'Engineering', 'CC-ENG', 'NVE', 'dept'], ['SCM', 'Supply chain, planning and purchasing', 'CC-SCM', 'NVE', 'dept'], ['EHS', 'EHS', 'CC-EHS', 'NVE', 'dept'], ['FIN', 'Finance and accounting', 'CC-FIN', 'NVE', 'dept'],
  ['HRA', 'HR and administration', 'CC-HRA', 'NVE', 'dept'], ['ITM', 'IT and MES', 'CC-ITM', 'NVE', 'dept'], ['SAL', 'Sales, marketing and customer service', 'CC-SAL', 'NVE', 'dept'],
].map(([code, name, cost_center, parent, kind]) => ({ code, name, cost_center, parent, kind }));
export const COST_CENTERS = ORG.filter((o) => o.cost_center).map((o) => ({ code: o.cost_center, name: o.name, org_unit: o.code, direct: ['FA1', 'FA2', 'SMT', 'THT', 'REL'].includes(o.code) }));
const UNIT_CC = Object.fromEntries(ORG.map((o) => [o.code, o.cost_center]));

// ---------------------------------------------------------------- headcount specification
// [unit, job, count per team, teams, line, op]
const SPEC = [];
const S = (unit, job, n, teams = ['D'], extra = {}) => SPEC.push({ unit, job, n, teams, ...extra });
S('MGT', 'J-CEO', 1); S('MGT', 'J-CFO', 1); S('MGT', 'J-COO', 1);
S('PMG', 'J-PM', 1); S('PMG', 'J-SUP', 1, ['A', 'B']); S('PMG', 'J-SUP', 1, ['A', 'B'], { line: 'FA-2' }); S('PMG', 'J-SUP', 1, ['D'], { line: 'SMT-1' });
for (const line of ['FA-1', 'FA-2']) {
  const unit = line === 'FA-1' ? 'FA1' : 'FA2';
  for (const o of FA_OPS) {
    const n = line === 'FA-1' ? o[5] : o[6]; if (!n) continue;
    const job = ['SWD', 'WB', 'FT', 'HPT', 'VIS'].includes(o[1]) ? 'J-TST' : ['PKG', 'PAL'].includes(o[1]) ? 'J-PACK' : 'J-OPR';
    S(unit, job, n, ['A', 'B'], { line, op: o[1] });
  }
  S(unit, 'J-LDR', 1, ['A', 'B'], { line, op: 'LEADER' }); S(unit, 'J-FLT', 2, ['A', 'B'], { line, op: 'HANDLER' }); S(unit, 'J-REP', 1, ['A', 'B'], { line, op: 'RPR' });
}
S('SMT', 'J-SMTOP', 1, ['A', 'B'], { line: 'SMT-1', op: 'SPP' }); S('SMT', 'J-SMTOP', 1, ['A', 'B'], { line: 'SMT-1', op: 'MT1' }); S('SMT', 'J-SMTOP', 1, ['A', 'B'], { line: 'SMT-1', op: 'MT2' });
S('SMT', 'J-SMTOP', 1, ['A', 'B'], { line: 'SMT-1', op: 'RFL' }); S('SMT', 'J-AOI', 1, ['A', 'B'], { line: 'SMT-1', op: 'AOI' }); S('SMT', 'J-REP', 1, ['A', 'B'], { line: 'SMT-1', op: 'RPR' });
S('THT', 'J-THT', 6, ['A', 'B'], { line: 'THT-1', op: 'INS' }); S('THT', 'J-THT', 1, ['A', 'B'], { line: 'THT-1', op: 'WAV' }); S('THT', 'J-REP', 2, ['A', 'B'], { line: 'THT-1', op: 'TUP' });
S('THT', 'J-TST', 1, ['A', 'B'], { line: 'THT-1', op: 'ICT' }); S('THT', 'J-TST', 1, ['A', 'B'], { line: 'THT-1', op: 'HPT' }); S('THT', 'J-THT', 1, ['A', 'B'], { line: 'THT-1', op: 'BRN' });
S('REL', 'J-OPR', 4, ['A', 'B'], { line: 'POOL', grade: 'G2' });   // 8 cross-trained operators
S('WHL', 'J-WHS', 1); S('WHL', 'J-WHK', 2, ['A', 'B']); S('WHL', 'J-REC', 3, ['D']); S('WHL', 'J-KIT', 3, ['A', 'B']); S('WHL', 'J-FLT', 3, ['D']); S('WHL', 'J-SHIP', 2, ['D']); S('WHL', 'J-IMP', 1);
S('QA', 'J-IQC', 3, ['D']); S('QA', 'J-OQC', 2, ['A', 'B']); S('QA', 'J-LAB', 2); S('QA', 'J-QE', 3); S('QA', 'J-CQE', 1); S('QA', 'J-QM', 1);
S('MNT', 'J-MTC', 3, ['A', 'B']); S('MNT', 'J-MEN', 2); S('MNT', 'J-MM', 1);
S('ENG', 'J-PE', 2); S('ENG', 'J-TE', 1); S('ENG', 'J-IE', 1); S('ENG', 'J-NPI', 1); S('ENG', 'J-SE', 1); S('ENG', 'J-EM', 1); S('ENG', 'J-TT', 1);
S('SCM', 'J-SCM', 1); S('SCM', 'J-MRP', 1); S('SCM', 'J-PLN', 2); S('SCM', 'J-BUY', 3);
S('EHS', 'J-EHS', 1); S('EHS', 'J-EHT', 1);
S('FIN', 'J-FM', 1); S('FIN', 'J-ACC', 3); S('FIN', 'J-CAC', 1);
S('HRA', 'J-HRM', 1); S('HRA', 'J-HRO', 2); S('HRA', 'J-NUR', 1);
S('ITM', 'J-IT', 2);
S('SAL', 'J-SM', 1); S('SAL', 'J-KAM', 2); S('SAL', 'J-EXP', 1); S('SAL', 'J-CSR', 3); S('SAL', 'J-MKT', 1);

export const POSITIONS = [];
const posKey = new Map();
function positionFor(s, team) {
  const code = `POS-${s.unit}-${s.job.slice(2)}${s.op ? '-' + s.op : ''}${s.line && !s.op ? '-' + s.line.replace('-', '') : ''}-${team}`;
  if (!posKey.has(code)) { const p = { code, unit: s.unit, job: s.job, team, line: s.line || null, op: s.op || null, headcount: 0 }; posKey.set(code, p); POSITIONS.push(p); }
  return posKey.get(code);
}

// ---------------------------------------------------------------- names (invented)
const MALE = ['Ahmed', 'Mohamed', 'Mahmoud', 'Mostafa', 'Ali', 'Hassan', 'Hussein', 'Ibrahim', 'Khaled', 'Amr', 'Tarek', 'Sherif', 'Karim', 'Omar', 'Youssef', 'Adel', 'Sayed', 'Ramy', 'Waleed', 'Hany', 'Essam', 'Samir', 'Nabil', 'Magdy', 'Osama', 'Walid', 'Ashraf', 'Medhat', 'Fathy', 'Gamal', 'Reda', 'Emad', 'Yasser', 'Wael', 'Bassem', 'Hatem', 'Ayman', 'Salah', 'Ismail', 'Abdallah'];
const FEMALE = ['Fatma', 'Aya', 'Mona', 'Heba', 'Nour', 'Sara', 'Dina', 'Rania', 'Eman', 'Amira', 'Salma', 'Yasmin', 'Nada', 'Hala', 'Marwa', 'Shaimaa', 'Reham', 'Asmaa', 'Samar', 'Doaa', 'Noha', 'Hend', 'Rasha', 'Mai', 'Ghada'];
const FAMILY = ['El-Sayed', 'Hassan', 'Ibrahim', 'Mansour', 'Abdel-Aziz', 'Farouk', 'Saad', 'Nasser', 'Khalil', 'Zaki', 'Fahmy', 'Soliman', 'Ramadan', 'Metwally', 'Shehata', 'Gaber', 'Habib', 'Lotfy', 'Barakat', 'Kamel', 'Awad', 'Sabry', 'Morsi', 'Taha', 'Wahba', 'Othman', 'Desouky', 'Amer', 'Shaker', 'Radwan', 'El-Sherif', 'Hegazy', 'Moussa', 'Azab', 'Bakr', 'Yassin'];
const usedNames = new Set();
function makeName(key, female) {
  for (let i = 0; ; i++) {
    const first = (female ? FEMALE : MALE)[Math.floor(U('fn', key, i) * (female ? FEMALE : MALE).length)];
    const father = MALE[Math.floor(U('mn', key, i) * MALE.length)];
    const fam = FAMILY[Math.floor(U('ln', key, i) * FAMILY.length)];
    const n = `${first} ${father} ${fam}`;
    if (!usedNames.has(n)) { usedNames.add(n); return n; }
  }
}

// ---------------------------------------------------------------- employees
const round50 = (x) => Math.round(x / 50) * 50;
function wageFor(code, grade) {
  const [lo, hi, mid] = GRADES[grade];
  const f = 0.93 + U('w', code) * 0.16;
  return Math.min(hi, Math.max(lo, round50(mid * f)));
}
const FEMALE_SHARE = { direct: 0.38, indirect: 0.30 };
export const EMPLOYEES = [];
let seq = 0;
function addEmp(o) {
  const code = `E${pad(++seq, 6)}`;
  const job = JOB[o.job];
  const grade = o.grade || job.grade;
  const gross = o.gross ?? wageFor(code, grade);
  const female = o.female ?? (U('g', code) < (job.kind === 'direct' ? FEMALE_SHARE.direct : FEMALE_SHARE.indirect) && !['J-FLT', 'J-MTC', 'J-CEO', 'J-COO'].includes(o.job));
  const e = { code, name_en: makeName(code, female), gender: female ? 'F' : 'M', unit: o.unit, cost_center: UNIT_CC[o.unit], position: o.position, job: o.job, grade, employment_type: o.employment_type || 'regular',
    hire_date: o.hire_date, first_productive_date: o.first_productive_date || o.hire_date, exit_date: null, team: o.team, line: o.line || null, op: o.op || null, gross_monthly_egp: gross, basic_egp: round50(gross * SI.basic_share), status: 'active',
    agency: o.agency || null, contract_end: o.contract_end || null, source: o.source || null, req: o.req || null };
  e.insurable_egp = Math.min(SI.max, Math.max(SI.min, e.basic_egp));
  EMPLOYEES.push(e); return e;
}
function hireDateFor(code, job) {
  const senior = ['G6', 'G7', 'G8'].includes(JOB[job].grade);
  const from = senior ? Date.UTC(2020, 6, 1) : Date.UTC(2021, 8, 1), to = Date.UTC(2026, 4, 31);
  const d = new Date(from + U('hd', code) * (to - from)); return d.toISOString().slice(0, 10);
}
for (const s of SPEC) {
  for (const team of s.teams) for (let i = 0; i < s.n; i++) {
    const p = positionFor(s, team); p.headcount++;
    const code = `E${pad(seq + 1, 6)}`;
    addEmp({ unit: s.unit, job: s.job, position: p.code, team, line: s.line, op: s.op, grade: s.grade, hire_date: hireDateFor(code, s.job) });
  }
}
export const PERMANENT_COUNT = EMPLOYEES.length;
for (const p of POSITIONS) p.vacant = 0;

// skills at window start
for (const e of EMPLOYEES) {
  const sk = [];
  const cert = (skill, level) => {
    const months = SKILLS.find((x) => x.code === skill).validity_months;
    let c = addDays('2026-06-30', -Math.floor(U('cert', e.code, skill) * (months * 30 - 150)));   // most recent certification, still valid on 2026-08-31
    if (c < addDays(e.hire_date, 3)) c = addDays(e.hire_date, 3);
    sk.push({ skill, level, certified_on: c, expires_on: addDays(c, months * 30) });
  };
  const prod = ['FA1', 'FA2', 'SMT', 'THT', 'REL'].includes(e.unit) || ['WHL', 'QA'].includes(e.unit);
  if (prod) cert('ESD', 2);
  if (e.op && OPSKILL[e.op]) cert(OPSKILL[e.op], e.op === 'LEADER' ? 3 : (U('lvl', e.code) < 0.25 ? 3 : 2));
  if (['CHS', 'LED', 'OPT', 'OCM', 'BRD', 'BCV', 'ACC'].includes(e.op) && U('ms', e.code) < 0.3) cert(['FTEST', 'PACK'][Math.floor(U('ms2', e.code) * 2)], 2);
  if (e.op === 'LEADER') cert('LEAD', 3);
  if (e.op === 'HANDLER' || e.job === 'J-FLT' && !e.op) cert('FORK', 2);
  if (e.op === 'RPR' || e.op === 'TUP' || e.unit === 'QA' && ['J-IQC', 'J-OQC', 'J-LAB'].includes(e.job)) cert('IPC610', 2);
  if (e.op === 'SPP' || e.op === 'MT1' || e.op === 'MT2' || e.op === 'RFL') cert('SMTOP', 2);
  if (e.op === 'AOI') cert('AOI', 2);
  if (e.op === 'ICT' && e.line === 'THT-1') cert('FTEST', 2);
  if (e.op === 'HPT' && e.line === 'THT-1') cert('HIPOT', 2);
  if (e.op === 'WAV') cert('SMTOP', 2);
  if (e.op === 'INS' || e.op === 'BRN') cert('SMTOP', 1);
  if (e.unit === 'REL') for (const s of ['ASSY', 'FTEST', 'PACK', 'WB', 'HIPOT']) cert(s, 2);
  if (e.job === 'J-KIT' || e.job === 'J-WHK') cert('FORK', 1);
  e.skills = sk;
}

// ---------------------------------------------------------------- turnover: 4 operator leavers per month, replaced 2 weeks later (research §10.6: 28 %/yr)
export const MOVEMENTS = [];
export const HIRING = { requisitions: [], candidates: [], training: [] };
const LEAVE_DATES = [['2026-07-08', '2026-07-22', 'REQ-0014'], ['2026-08-05', '2026-08-19', 'REQ-0015'], ['2026-09-02', '2026-09-16', 'REQ-0017']];
{
  const pool = EMPLOYEES.filter((e) => ['J-OPR', 'J-PACK'].includes(e.job) && ['FA1', 'FA2', 'THT'].includes(e.unit) && e.op);
  const taken = new Set();
  let candNo = 100;
  for (const [exit, hire, req] of LEAVE_DATES) {
    const leavers = [];
    for (let i = 0; leavers.length < 4; i++) {
      const e = pool[Math.floor(U('leaver', exit, i) * pool.length)];
      if (taken.has(e.code) || e.grade !== 'G1') continue;
      taken.add(e.code); leavers.push(e);
    }
    const cands = [];
    for (const l of leavers) {
      l.exit_date = exit; l.status = 'left'; l.exit_reason = 'resignation';
      MOVEMENTS.push({ type: 'leaver', employee: l.code, date: exit, reason: 'resignation (operator turnover 28 % / yr [E])' });
      const rep = addEmp({ unit: l.unit, job: l.job, position: l.position, team: l.team, line: l.line, op: l.op, grade: 'G1', hire_date: hire, first_productive_date: addDays(hire, 4), source: 'walk_in', req, gross: 7800 });
      rep.skills = [{ skill: 'ESD', level: 2, certified_on: addDays(hire, 3), expires_on: addDays(hire, 3 + 365) }, ...(OPSKILL[l.op] ? [{ skill: OPSKILL[l.op], level: 2, certified_on: addDays(hire, 3), expires_on: addDays(hire, 3 + 730) }] : [])];
      MOVEMENTS.push({ type: 'hire', employee: rep.code, date: hire, replaces: l.code, requisition: req, first_productive_date: rep.first_productive_date });
      cands.push({ code: `CAN-${pad(++candNo, 4)}`, requisition: req, source: 'walk_in', stage: 'hired', hired_as: rep.code, applied: addDays(hire, -12), screened: addDays(hire, -9), interviewed: addDays(hire, -6), offered: addDays(hire, -3), hired: hire });
    }
    HIRING.requisitions.push({ code: req, job: leavers[0].job === 'J-PACK' ? 'J-PACK' : 'J-OPR', count: 4, reason: 'replacement', employment_type: 'regular', raised: addDays(exit, 1), approved: addDays(exit, 2), needed_by: hire, status: 'filled', work_center: 'various', approved_by: 'E000020' });
    HIRING.candidates.push(...cands);
    HIRING.training.push({ code: `TRN-${pad(HIRING.training.length + 1, 4)}`, course: 'ESD + station induction (3 days)', dates: [hire, addDays(hire, 1), addDays(hire, 2)], attendees: cands.map((c) => c.hired_as), result: 'pass', grants: ['ESD L2', 'station L2'] });
  }
}

// ---------------------------------------------------------------- agency temps for the C shift (story B)
export const TEMP_PLAN = { requisition: 'REQ-0016', count: 40, agency: 'S-SMS', raised: '2026-08-19', approved: '2026-08-19', candidates_sent: '2026-08-20', hired: '2026-08-24', training: ['2026-08-24', '2026-08-25', '2026-08-26'], first_c_shift: '2026-08-29', contract_end: '2026-12-31',
  split: { fa2_c_operators: 22, fa2_c_relief: 4, warehouse_c_support: 6, fa2_ab_packing_palletizing: 4, smt_tht_support: 4 } };
export const TEMPS = [];
{
  const ops = []; // 22 C-shift operators mirror the FA-2 station crew
  for (const o of FA_OPS) for (let i = 0; i < o[6]; i++) ops.push(o[1]);
  const seqList = [];
  ops.forEach((op) => seqList.push({ group: 'fa2_c_operators', unit: 'FA2', line: 'FA-2', team: 'C', op }));
  for (let i = 0; i < 4; i++) seqList.push({ group: 'fa2_c_relief', unit: 'FA2', line: 'FA-2', team: 'C', op: 'RELIEF' });
  for (let i = 0; i < 6; i++) seqList.push({ group: 'warehouse_c_support', unit: 'WHL', line: null, team: 'C', op: 'KITTING' });
  for (let i = 0; i < 4; i++) seqList.push({ group: 'fa2_ab_packing_palletizing', unit: 'FA2', line: 'FA-2', team: i % 2 ? 'B' : 'A', op: i < 2 ? 'PKG' : 'PAL' });
  for (let i = 0; i < 4; i++) seqList.push({ group: 'smt_tht_support', unit: i < 2 ? 'SMT' : 'THT', line: i < 2 ? 'SMT-1' : 'THT-1', team: i % 2 ? 'B' : 'A', op: 'SUPPORT' });
  if (seqList.length !== TEMP_PLAN.count) throw new Error('temp split does not add up to 40');
  const cert = TEMP_PLAN.training[2];
  seqList.forEach((t, i) => {
    const job = ['PKG', 'PAL'].includes(t.op) ? 'J-PACK' : 'J-OPR';
    const e = addEmp({ unit: t.unit, job, position: `POS-TEMP-${t.group}`, team: t.team, line: t.line, op: t.op, grade: 'G1', hire_date: TEMP_PLAN.hired, first_productive_date: TEMP_PLAN.first_c_shift, employment_type: 'agency_temp', agency: TEMP_PLAN.agency, contract_end: TEMP_PLAN.contract_end, source: 'agency', req: TEMP_PLAN.requisition, gross: 7000 });
    e.basic_egp = 0; e.insurable_egp = 0;   // agency staff are not on NVE payroll: the agency invoices hours
    const sk = OPSKILL[t.op] || (t.op === 'RELIEF' ? 'ASSY' : t.op === 'KITTING' ? 'FORK' : t.op === 'SUPPORT' ? 'SMTOP' : null);
    e.skills = [{ skill: 'ESD', level: 2, certified_on: cert, expires_on: addDays(cert, 365) }, ...(sk ? [{ skill: sk, level: 2, certified_on: cert, expires_on: addDays(cert, 730) }] : [])];
    e.exit_date = null; TEMPS.push(e);
  });
  HIRING.requisitions.push({ code: TEMP_PLAN.requisition, job: 'J-OPR', count: 40, reason: 'crew_gap', employment_type: 'agency', agency: TEMP_PLAN.agency, raised: TEMP_PLAN.raised, approved: TEMP_PLAN.approved, needed_by: '2026-08-26', contract_months: 4, status: 'filled', work_center: 'FA-2 (C shift), warehouse, SMT/THT', approved_by: 'E000002', split: TEMP_PLAN.split });
  HIRING.candidates.push(...TEMPS.map((e, i) => ({ code: `CAN-${pad(200 + i, 4)}`, requisition: TEMP_PLAN.requisition, source: 'agency', stage: 'hired', hired_as: e.code, applied: '2026-08-20', screened: '2026-08-21', interviewed: '2026-08-22', offered: '2026-08-23', hired: TEMP_PLAN.hired })));
  HIRING.training.push({ code: `TRN-${pad(HIRING.training.length + 1, 4)}`, course: 'ESD (ANSI/ESD S20.20) 1 day + station training and certification 2 days, agency temps', dates: TEMP_PLAN.training, attendees: TEMPS.map((e) => e.code), result: 'pass', grants: ['ESD L2', 'station skill L2'], rule: 'no scheduling on a production line before onboarding (medical, PPE, ESD) is done and the qualification is valid (hr.onboarding.incomplete)' });
  for (const e of TEMPS) MOVEMENTS.push({ type: 'hire', employee: e.code, date: TEMP_PLAN.hired, requisition: TEMP_PLAN.requisition, agency: TEMP_PLAN.agency, first_productive_date: TEMP_PLAN.first_c_shift });
}
// permanent staff who move to the C shift (leader, 2 handlers, repair tech) come from the relief pool
const REL = EMPLOYEES.filter((e) => e.unit === 'REL' && e.status === 'active');
export const C_PERMANENT = [REL[0], REL[1], REL[4], REL[5]].map((e) => e.code);   // 2 from team A, 2 from team B
[['LEADER', 'LEAD', 'FA-2-LEADER'], ['HANDLER', 'FORK', 'FA-2-HANDLER'], ['HANDLER', 'FORK', 'FA-2-HANDLER'], ['RPR', 'IPC610', 'FA-2-RPR']].forEach(([role, skill], i) => {
  const e = EMPLOYEES.find((x) => x.code === C_PERMANENT[i]);
  e.c_shift_from = C_WINDOW.from; e.c_shift_to = C_WINDOW.to; e.c_role = role;
  e.skills.push({ skill, level: 2, certified_on: '2026-08-27', expires_on: addDays('2026-08-27', SKILLS.find((x) => x.code === skill).validity_months * 30) });
  MOVEMENTS.push({ type: 'c_shift_assignment', employee: e.code, from: C_WINDOW.from, to: C_WINDOW.to, role, note: 'from the relief pool; night allowance 15 % of basic while on shift C' });
});

// ---------------------------------------------------------------- attendance model (deterministic; the scenario engine and the generator evaluate the same functions)
export const ABSENT_BASE = 0.045;
const DOW_W = { 6: 1.3, 0: 1.1, 1: 0.95, 2: 0.9, 3: 0.9, 4: 0.95 };
const DOW_NORM = (1.3 + 1.1 + 0.95 + 0.9 + 0.9 + 0.95) / 6;
export const absentRate = (date) => ABSENT_BASE * (DOW_W[dow(date)] ?? 1) / DOW_NORM;
export const ATTENDANCE_MODEL = { rule: 'employee E is absent on working date D iff U("abs",E,D) < rate(D) and E is not on leave', U: 'FNV-1a 32-bit of "<seed>|abs|<employee>|<date>" / 2^32 (lib.mjs)', seed: 20260929,
  rate_base: ABSENT_BASE, weekday_weights: { Sat: 1.3, Sun: 1.1, Mon: 0.95, Tue: 0.9, Wed: 0.9, Thu: 0.95 }, normalised_to_mean: 1, unexcused_share: 0.3, unexcused_rule: 'U("unx",E,D) < 0.3 -> unpaid day (gross/30 deducted); otherwise sick/casual leave paid', late_rule: 'U("late",E,D) < 0.03 -> late 10-25 min', temps: 'agency temps use the same absence rule; the agency does not bill absent days' };
export const LEAVE = {};   // code -> [from, to]
for (const e of EMPLOYEES.filter((x) => x.employment_type === 'regular' && x.status === 'active' && x.hire_date < '2026-01-01')) {
  if (U('leave', e.code) < 0.3) {
    let start = addDays('2026-07-05', Math.floor(U('ls', e.code) * 70)); while (!isWork(start)) start = addDays(start, 1);
    const days = 6; let end = start, n = 1; while (n < days) { end = addDays(end, 1); if (isWork(end)) n++; }
    LEAVE[e.code] = [start, end]; e.leave_block = { from: start, to: end, working_days: days };
  }
}
export const onLeave = (e, d) => { const l = LEAVE[e.code]; return !!l && d >= l[0] && d <= l[1]; };
export const activeOn = (e, d) => d >= e.first_productive_date && (!e.exit_date || d <= e.exit_date) && (!e.contract_end || d <= e.contract_end);
export const absentOn = (e, d) => !onLeave(e, d) && U('abs', e.code, d) < absentRate(d);
export const unexcused = (e, d) => U('unx', e.code, d) < 0.3;
export const workedC = (e, d) => e.team === 'C' ? (d >= C_WINDOW.from && d <= C_WINDOW.to) : (e.c_shift_from && d >= e.c_shift_from && d <= e.c_shift_to);

// ---------------------------------------------------------------- overtime plan (hours per person per week; planned by HR, approved per request)
export const OT_PLAN = [
  { id: 'OT-01', who: 'FA-2 line operators, teams A and B (permanent)', filter: (e) => e.unit === 'FA2' && ['A', 'B'].includes(e.team) && e.employment_type === 'regular' && e.op && !['LEADER', 'HANDLER', 'RPR'].includes(e.op), from: '2026-08-22', to: '2026-09-24', hours_per_week: 6, days_per_week: 3, kind: 'day', reason: 'FA-2 ramp for the mega order; C shift starts 29 Aug' },
  { id: 'OT-02', who: 'Warehouse, kitting, shipping (permanent)', filter: (e) => e.unit === 'WHL' && e.employment_type === 'regular', from: '2026-08-29', to: '2026-09-24', hours_per_week: 6, days_per_week: 3, kind: 'day', reason: 'Mega-order lots 1-3: picking, palletizing, dispatch' },
  { id: 'OT-03', who: 'Shipping and FG staff, rest-day work on Fridays 4, 11 and 18 Sep (8 h, substitute day + 100 %)', filter: (e) => e.unit === 'WHL' && ['J-SHIP', 'J-FLT', 'J-KIT'].includes(e.job) && e.employment_type === 'regular', fridays: ['2026-09-04', '2026-09-11', '2026-09-18'], hours_each: 8, kind: 'rest_day', reason: 'Loading of lots 1, 2, 3 and the KSA containers before Saturday dispatch' },
  { id: 'OT-04', who: 'SMT and THT operators (permanent)', filter: (e) => ['SMT', 'THT'].includes(e.unit) && e.employment_type === 'regular', from: '2026-09-01', to: '2026-09-24', hours_per_week: 4, days_per_week: 2, kind: 'day', reason: 'Board volume for FA-2 three-shift running' },
  { id: 'OT-05', who: 'FA-1 line operators (permanent)', filter: (e) => e.unit === 'FA1' && e.employment_type === 'regular' && e.op && !['LEADER', 'HANDLER', 'RPR'].includes(e.op), from: '2026-09-01', to: '2026-09-28', hours_per_week: 2, days_per_week: 1, kind: 'day', reason: 'September demand above forecast for NV-50U/NV-55U' },
  { id: 'OT-06', who: 'Permanent C-shift overhead crew (leader, 2 handlers, repair tech)', filter: (e) => C_PERMANENT.includes(e.code), from: '2026-08-29', to: '2026-09-24', hours_per_week: 4, days_per_week: 2, kind: 'night', reason: 'Night handover and repair-loop clearing' },
];
export function otHours(e, plan, weekWorkdays) { // hours in a calendar month for employee e under plan (deterministic, evaluated by month)
  return null;
}
// compute OT hours per employee per month (by iterating weeks Saturday..Thursday inside the plan window)
export function overtimeByMonth() {
  const out = {};
  const add = (e, month, kind, h) => { const k = e.code; out[k] ??= {}; out[k][month] ??= { day: 0, night: 0, rest_day: 0 }; out[k][month][kind] += h; };
  for (const p of OT_PLAN) {
    const people = EMPLOYEES.filter((e) => p.filter(e) && e.exit_date === null);
    if (p.fridays) { for (const f of p.fridays) for (const e of people) add(e, f.slice(0, 7), 'rest_day', p.hours_each); continue; }
    const days = dateList(p.from, p.to).filter(isWork);
    const perDay = p.hours_per_week / p.days_per_week;
    const byWeek = new Map();
    for (const d of days) { const wk = addDays(d, -((dow(d) + 1) % 7)); if (!byWeek.has(wk)) byWeek.set(wk, []); byWeek.get(wk).push(d); }
    for (const [wk, wd] of byWeek) for (const e of people) {
      const chosen = [...wd].sort((a, b) => U('otd', e.code, a, p.id) - U('otd', e.code, b, p.id)).slice(0, Math.min(p.days_per_week, wd.length));
      for (const d of chosen) { if (!activeOn(e, d) || absentOn(e, d) || onLeave(e, d)) continue; add(e, d.slice(0, 7), p.kind, perDay); }
    }
  }
  return out;
}
export const OT = overtimeByMonth();

// ---------------------------------------------------------------- payroll arithmetic (Egypt 2026, research §6)
const TAX_BANDS = [[0, 40000, 0], [40000, 55000, 0.10], [55000, 70000, 0.15], [70000, 200000, 0.20], [200000, 400000, 0.225], [400000, 1200000, 0.25], [1200000, Infinity, 0.275]];   // research §6.2 [S37]
export function annualTax(taxable) { let t = 0; for (const [lo, hi, r] of TAX_BANDS) if (taxable > lo) t += (Math.min(taxable, hi) - lo) * r; return t; }
export function monthlySalaryTax(grossMonthly, eeSi) { const taxableYear = Math.max(0, (grossMonthly - eeSi) * 12 - 20000); return annualTax(taxableYear) / 12; }
export function workdaysInMonth(m) { return dateList(monthStart(m), monthEnd(m)).filter(isWork); }
export function payrollMonth(m) {
  const wd = workdaysInMonth(m), cal = dateList(monthStart(m), monthEnd(m));
  const byCC = {}; const tot = { headcount: 0, gross_earnings: 0, overtime: 0, night_allowance: 0, employer_si: 0, employee_si: 0, tax: 0, other_deductions: 0, net: 0, unpaid_absence: 0, hours: { regular: 0, overtime_day: 0, overtime_night: 0, overtime_rest_day: 0 } };
  const lines = [];
  for (const e of EMPLOYEES.filter((x) => x.employment_type === 'regular')) {
    const from = e.hire_date > monthStart(m) ? e.hire_date : monthStart(m), to = e.exit_date && e.exit_date < monthEnd(m) ? e.exit_date : monthEnd(m);
    if (from > to) continue;
    const days = diffDays(to, from) + 1, frac = days / cal.length;
    const basicPaid = e.gross_monthly_egp * frac;
    let unpaid = 0, absDays = 0;
    for (const d of wd) { if (d < from || d > to || !activeOn(e, d) && d >= e.first_productive_date) continue; if (d < e.first_productive_date) continue; if (absentOn(e, d)) { absDays++; if (unexcused(e, d)) unpaid++; } }
    const ded = unpaid * e.gross_monthly_egp / 30;
    const ot = OT[e.code]?.[m] || { day: 0, night: 0, rest_day: 0 };
    const hourly = e.gross_monthly_egp / OT_RULES.hour_divisor;
    const otPay = ot.day * hourly * (1 + OT_RULES.day_premium) + ot.night * hourly * (1 + OT_RULES.night_premium) + ot.rest_day * hourly * (1 + OT_RULES.rest_day_premium);
    let nightDays = 0; if (e.c_shift_from) for (const d of wd) if (d >= e.c_shift_from && d <= e.c_shift_to && d >= from && d <= to && !absentOn(e, d) && !onLeave(e, d)) nightDays++;
    const nightAllow = nightDays / 26 * e.basic_egp * OT_RULES.night_allowance_pct_basic;
    const gross = basicPaid - ded + otPay + nightAllow;
    const insurable = e.insurable_egp * frac;
    const eeSi = insurable * SI.ee, erSi = insurable * SI.er;
    const tax = monthlySalaryTax(gross, eeSi);
    const martyrs = gross * 0.0005;
    const net = gross - eeSi - tax - martyrs;
    const cc = e.cost_center; byCC[cc] ??= { gross_earnings: 0, overtime: 0, night_allowance: 0, employer_si: 0, employee_si: 0, tax: 0, other_deductions: 0, net: 0, headcount: 0 };
    const b = byCC[cc];
    b.gross_earnings += basicPaid - ded; b.overtime += otPay; b.night_allowance += nightAllow; b.employer_si += erSi; b.employee_si += eeSi; b.tax += tax; b.other_deductions += martyrs; b.net += net; b.headcount++;
    tot.headcount++; tot.gross_earnings += basicPaid - ded; tot.overtime += otPay; tot.night_allowance += nightAllow; tot.employer_si += erSi; tot.employee_si += eeSi; tot.tax += tax; tot.other_deductions += martyrs; tot.net += net; tot.unpaid_absence += ded;
    tot.hours.regular += wd.filter((d) => d >= from && d <= to).length * 7; tot.hours.overtime_day += ot.day; tot.hours.overtime_night += ot.night; tot.hours.overtime_rest_day += ot.rest_day;
  }
  return { month: m, total: tot, by_cost_center: byCC };
}
// agency temps: hours billed = present shifts x 8 paid hours (span incl. rest) x hourly rate (+15 % on night)
export function agencyMonth(m) {
  let hours = 0, night = 0, shifts = 0, bill = 0;
  for (const e of TEMPS) for (const d of dateList(monthStart(m), monthEnd(m))) {
    if (!isWork(d) || d < e.first_productive_date || d > e.contract_end) continue;
    if (e.team === 'C' && !(d >= C_WINDOW.from && d <= C_WINDOW.to)) continue;   // after 24 Sep the C team is redeployed (see events) - not billed inside this window
    if (absentOn(e, d)) continue;
    shifts++; hours += 8; if (e.team === 'C') { night += 8; bill += 8 * AGENCY.hourly_night; } else bill += 8 * AGENCY.hourly;
  }
  let trainingHours = 0;
  for (const d of TEMP_PLAN.training) if (d.startsWith(m)) { trainingHours += 8 * TEMPS.length; bill += 8 * TEMPS.length * AGENCY.hourly; }   // paid induction days are billed at the day rate
  return { month: m, temps: TEMPS.length, shifts, hours: hours + trainingHours, worked_hours: hours, training_hours: trainingHours, night_hours: night, amount_egp: r2(bill), vat_egp: r2(bill * 0.14) };
}
