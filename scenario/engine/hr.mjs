// The people side of the book, entered and lived through HR-System's own HTTP API (never its database):
//   at the start   organisation, jobs, positions, skills, the people employed that day with their qualifications, shifts, the working
//                  calendar, shift assignments, approved leave, the overtime settings, the skills each station needs (in GMES)
//   every morning  what the book says happens that day: leavers, requisitions raised and approved, candidates moving through their
//                  stages, hires, training sessions and their results, qualifications reached, new assignments, overtime asked and approved
//                  (the person who asks is never the person who approves: HR enforces it, so two users act), then HR publishes to GMES
//   for production who is present today (the book's absence model), who of them is qualified at each station, how many heads each line has
//                  against the crew it needs (the throughput factor), and the person to book on each scan
//   every evening GMES closes the production day: the labour facts go to HR
import { createHash } from 'node:crypto';
import { addDays, dateList, isWork, dow, HOLIDAYS, U as RND } from '../gen/lib.mjs';
import * as P from '../gen/people.mjs';
import { client } from './client.mjs';

const uuid5 = (ns, name) => {
  const h = createHash('sha1'); h.update(Buffer.from(ns.replace(/-/g, ''), 'hex')); h.update(name, 'utf8');
  const b = h.digest(); b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;
  const x = b.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
};
const WORKER = { regular: 'Regular', agency_temp: 'Agency', fixed_term: 'Fixed-term' };
const ETYPE = { regular: 'regular', agency_temp: 'agency', fixed_term: 'fixed_term' };

export async function setupHr({ h, hr, gm, g, book, pump, log }) {
  const { from, to } = book.meta.window;
  const people = book.people;
  const company = h.company;
  const empGid = (code) => uuid5(company, `hr:employee:${code}`);
  const refused = [];   // what HR refused, with its reasons: an honest list, never hidden
  const stats = { employees: 0, hired: 0, left: 0, requisitions: 0, candidates: 0, trainings: 0, leave: 0, overtime: 0, qualifications: 0, assignments: 0, gapRows: 0, published: 0, labourDays: 0, labourFacts: 0 };

  // a second person raises what the first approves: HR refuses an approval by the person who raised the record
  const officerPw = h.logins.hr.password;
  await hr('POST', '/api/admin/users', { username: 'hr.officer', display_name: 'HR officer', password: officerPw + 'Tmp1', profile: 'hr_officer' });
  const ho = client(hr.base, 'hr_sid', () => ['POST', '/api/login', { username: 'hr.officer', password: officerPw + 'Tmp1' }]);
  await ho('POST', '/api/login', { username: 'hr.officer', password: officerPw + 'Tmp1' }, { allow: true });
  await ho('POST', '/api/password', { old: officerPw + 'Tmp1', new: officerPw }, { allow: true });
  const ho2 = client(hr.base, 'hr_sid', () => ['POST', '/api/login', { username: 'hr.officer', password: officerPw }]);
  await ho2('POST', '/api/login', { username: 'hr.officer', password: officerPw });

  const put = async (c, entity, code, fields, ver = null) => (await c('PUT', `/api/${entity}/${encodeURIComponent(code)}`, { fields, expected_ver: ver })).row;
  const tryPut = async (what, fn) => { try { return await fn(); } catch (e) { refused.push(`${what}: ${e.message.replace(/^\S+ \S+: /, '').slice(0, 160)}`); return null; } };
  const row = {};   // rows by entity|code: id and version, kept up to date from every answer

  // ---------------------------------------------------------------- organisation
  const units = await hr('GET', '/api/org_unit');
  const companyUnit = units.find((u) => u.type === 'company');
  const site = await put(hr, 'org_unit', 'SITE-10R', { type: 'site', name: '10th of Ramadan plant', parent_id: companyUnit.id, attrs: {} });
  const bu = await put(hr, 'org_unit', 'BU-OPS', { type: 'business_unit', name: 'Operations', parent_id: site.id, attrs: {} });
  const unit = {};
  const ordered = [...people.org].filter((o) => o.kind !== 'company');
  for (const o of ordered.filter((x) => x.kind === 'dept')) unit[o.code] = await put(hr, 'org_unit', o.code, { type: 'department', name: o.name, parent_id: bu.id, attrs: { cost_center: o.cost_center } });
  for (const o of ordered.filter((x) => x.kind === 'section')) unit[o.code] = await put(hr, 'org_unit', o.code, { type: 'section', name: o.name, parent_id: unit[o.parent].id, attrs: { cost_center: o.cost_center } });
  const job = {};
  for (const j of people.jobs) job[j.code] = await put(hr, 'job', j.code, { title: j.title, family: j.kind, level: j.grade, critical: 0, attrs: {} });
  const pos = {};
  for (const p of people.positions) pos[p.code] = await put(hr, 'position', p.code, { job_id: job[p.job].id, org_unit_id: unit[p.unit].id, reports_to_id: null, status: p.vacant > 0 ? 'open' : 'filled', attrs: { team: p.team, line: p.line, op: p.op, headcount: p.headcount } });
  log(true, 'HR has the organisation, jobs and positions', `${Object.keys(unit).length + 3} units, ${Object.keys(job).length} jobs, ${Object.keys(pos).length} positions`);

  // ---------------------------------------------------------------- shifts, calendar, skills, courses, leave types, overtime settings
  const shift = {};
  for (const s of [...book.shifts, { code: 'ADM', name: 'Office day', start: '08:00', end: '16:00', rest_min: 60 }]) shift[s.code] = await put(hr, 'shift', s.code, { name: s.name, start_time: s.start, end_time: s.end, break_minutes: s.rest_min, grace_minutes: 10 });
  const holidays = Object.keys(HOLIDAYS).sort().join(',');
  const cal = await put(hr, 'work_calendar', 'PLANT', { name: 'Plant calendar (Friday rest, public holidays)', rest_days: 'FRI', holidays });
  const skill = {};
  for (const s of people.skills) skill[s.code] = await put(hr, 'skill', s.code, { name: s.name.slice(0, 200), category: s.mandatory_for ? 'Safety' : 'Operations', validity_months: s.validity_months });
  const course = await put(hr, 'course', 'ESD-STATION', { name: 'ESD + station induction (3 days)', skill_id: null, grants_level: null, validity_months: 12, duration_hours: 24, mandatory_for: 'all_production', onboarding_kind: 'esd_training' });
  const leaveType = await put(hr, 'leave_type', 'ANNUAL', { name: 'Annual leave', paid: 1, annual_days: 21, carry_over_days: 6, active: 1 });
  await hr('PUT', '/api/overtime/policy', { max_daily_minutes_incl_ot: 600, max_weekly_ot_minutes: 720, max_monthly_ot_minutes: 2400 });
  const agency = await put(hr, 'agency', 'S-SMS', { name: 'Sharqia Manpower Services', contact: 'agency desk', fee_percent: 22, active: 1 });

  // ---------------------------------------------------------------- people
  const byCode = Object.fromEntries(people.employees.map((e) => [e.code, e]));
  const hrCode = {};      // the book's employee code -> the code HR gave (hires get theirs from HR)
  const created = new Set();
  const qual = new Set(); // "<hr code>|<skill>" already in HR
  const ver = {};         // employee version, assignments
  const employedAt = (e, d) => e.hire_date <= d && (!e.exit_date || e.exit_date >= d);
  const manager = null;
  async function createEmployee(e) {
    const r = await put(hr, 'employee', e.code, { preferred_name: e.name_en, legal_name: e.name_en, employment_status: 'Active', worker_type: WORKER[e.employment_type] ?? 'Regular', hire_date: e.hire_date,
      home_site_id: site.id, position_id: pos[e.position]?.id ?? null, manager_id: manager });
    hrCode[e.code] = e.code; created.add(e.code); ver[e.code] = r.ver; stats.employees++;
    return r;
  }
  async function syncSkills(day, only) {
    for (const code of created) {
      const e = byCode[code];
      if (only && !only.has(code)) continue;
      for (const s of e.skills) {
        const k = `${hrCode[code]}|${s.skill}`;
        if (qual.has(k) || s.certified_on > day) continue;
        qual.add(k);
        const ok = await tryPut(`qualification ${k}`, () => put(hr, 'employee_skill', `${hrCode[code]}-${s.skill}`, { employee_id: empGid(hrCode[code]), skill_id: skill[s.skill].id, level: s.level, certified_on: s.certified_on, expires_on: s.expires_on ?? null, evidence: 'assessment record' }));
        if (ok) stats.qualifications++;
      }
    }
  }
  const shiftOf = (e) => (e.team === 'D' ? 'ADM' : e.team);
  const asg = new Set();
  async function assign(e) {
    if (asg.has(e.code)) return;
    asg.add(e.code);
    const c = hrCode[e.code], start = e.first_productive_date > from ? e.first_productive_date : (e.hire_date < from ? e.hire_date : from);
    const end = e.team === 'C' ? P.C_WINDOW.to : e.exit_date ?? null;
    const ok = await tryPut(`assignment ${c}`, () => put(ho2, 'shift_assignment', `${c}-${start}-R`, { employee_id: empGid(c), shift_id: shift[shiftOf(e)].id, calendar_id: cal.id, kind: 'regular', valid_from: start, valid_to: end, note: null }));
    if (ok) stats.assignments++;
  }
  async function leaveOf(e) {
    const lb = e.leave_block;
    if (!lb || lb.to < from || lb.from > to) return;
    const c = hrCode[e.code];
    const r = await tryPut(`leave request ${c}`, () => put(ho2, 'leave_request', `LV-${c}-${lb.from}`, { employee_id: empGid(c), leave_type_id: leaveType.id, from_date: lb.from, to_date: lb.to, days: lb.working_days, status: 'requested', note: 'annual leave' }));
    if (r) { const ok = await tryPut(`leave approval ${c}`, () => put(hr, 'leave_request', `LV-${c}-${lb.from}`, { status: 'approved' }, r.ver)); if (ok) stats.leave++; }
  }
  const starting = people.employees.filter((e) => e.hire_date <= from && employedAt(e, from) && e.employment_type !== 'agency_temp');
  for (const e of starting) await createEmployee(e);
  await syncSkills(from);
  for (const e of starting) await assign(e);
  for (const e of starting) await leaveOf(e);
  // C shift: permanent staff who move to it for the window get a temporary assignment
  for (const e of people.employees.filter((x) => x.c_shift_from && created.has(x.code))) {
    const c = hrCode[e.code];
    await tryPut(`C-shift cover ${c}`, () => put(ho2, 'shift_assignment', `${c}-${e.c_shift_from}-T`, { employee_id: empGid(c), shift_id: shift.C.id, calendar_id: cal.id, kind: 'temporary', valid_from: e.c_shift_from, valid_to: e.c_shift_to, note: 'C shift overhead crew' }));
  }
  log(true, 'HR has the people, their qualifications, shifts and leave', `${stats.employees} employees, ${stats.qualifications} qualifications, ${stats.assignments} assignments, ${stats.leave} leave periods${refused.length ? `, ${refused.length} refused` : ''}`);

  // ---------------------------------------------------------------- what manufacturing needs of people at each station (manufacturing's own configuration)
  for (const r of people.station_requirements) {
    if (!g.node[r.station]) continue;   // the book plays fewer models than the plant has stations for
    await gm('PUT', `/api/stations/${r.station}/requirements`, r.requires.map((q) => ({ skillCode: q.skill, minLevel: q.min_level })));
  }
  await publish();
  const mirrored = await gm('GET', '/api/workforce/status');
  log(mirrored.employees.rows > 0, 'GMES holds the people, their schedule and qualifications as HR published them', `${mirrored.employees.rows} employees, ${mirrored.schedule.rows} schedule days, ${mirrored.qualifications.rows} qualifications`);

  async function publish() {
    await hr('POST', '/api/admin/integration/run', {}, { allow: true });
    await pump();
    stats.published++;
  }

  // ---------------------------------------------------------------- the story, day by day
  const reqRow = {}, candRow = {}, sessionRow = {};
  const jobPos = (code) => pos[code]?.id ?? null;
  const hiring = { requisitions: P.HIRING.requisitions, candidates: P.HIRING.candidates, training: P.HIRING.training };
  const CAND_STAGES = ['applied', 'screened', 'interviewed', 'offered', 'hired'];

  async function morning(day) {
    // leavers
    // (the last day worked is the book's exit date: HR ends the employment the morning after, so the leaver can still be booked that day)
    for (const m of P.MOVEMENTS.filter((x) => x.type === 'leaver' && byCode[x.employee]?.exit_date && addDays(byCode[x.employee].exit_date, 1) === day)) {
      const c = hrCode[m.employee];
      if (!c) continue;
      const cur = (await hr('GET', '/api/employee')).find((x) => x.code === c);
      await tryPut(`leaver ${c}`, () => put(hr, 'employee', c, { employment_status: 'Terminated', termination_date: byCode[m.employee].exit_date }, cur.ver));
      stats.left++;
    }
    // requisitions: raised by the officer, approved by the manager
    for (const r of hiring.requisitions) {
      if (r.raised === day) {
        const isAgency = r.employment_type === 'agency';
        const x = await tryPut(`requisition ${r.code}`, () => put(ho2, 'hire_requisition', r.code, { job_id: job[r.job].id, position_id: null, work_center_code: r.work_center ?? null, count: r.count, filled: 0, employment_type: ETYPE[r.employment_type] ?? r.employment_type,
          reason: r.reason, needed_by: r.needed_by, ...(isAgency ? { agency_id: agency.id } : {}), ...(r.employment_type === 'fixed_term' ? { contract_months: 6 } : {}), status: 'draft', note: `${r.reason}: ${r.count} x ${r.job}, planned from the crew requirements and the headcount plan` }));
        if (x) { reqRow[r.code] = x; stats.requisitions++; }
      }
      if (r.approved === day && reqRow[r.code]) {
        const x = await tryPut(`requisition approval ${r.code}`, () => put(hr, 'hire_requisition', r.code, { status: 'approved' }, reqRow[r.code].ver));
        if (x) reqRow[r.code] = x;
      }
    }
    // candidates move through the stages on the dates the book gives; the hire creates the employee, contract and onboarding in one step
    for (const c of hiring.candidates) {
      const req = reqRow[c.requisition];
      if (!req) continue;
      for (const st of CAND_STAGES) {
        if (c[st] !== day) continue;
        if (st === 'applied') {
          const x = await tryPut(`candidate ${c.code}`, () => put(ho2, 'candidate', c.code, { requisition_id: req.id, display_name: byCode[c.hired_as]?.name_en ?? c.code, source: c.source, stage: 'applied', stage_date: day, note: '' }));
          if (x) { candRow[c.code] = x; stats.candidates++; }
        } else if (st === 'hired') {
          const e = byCode[c.hired_as];
          const res = await tryPut(`hire ${c.code}`, () => ho2('POST', `/api/recruitment/candidates/${c.code}/hire`, { hire_date: day, position_id: jobPos(e.position), ...(e.contract_end ? { contract_end: e.contract_end } : {}), ...(e.employment_type === 'agency_temp' ? { agency_id: agency.id } : {}) }));
          if (res) {
            hrCode[e.code] = res.employee; created.add(e.code); stats.hired++;
            // the requisition row moved (filled count)
            reqRow[c.requisition] = (await hr('GET', '/api/hire_requisition')).find((x) => x.code === c.requisition) ?? reqRow[c.requisition];
          }
        } else if (candRow[c.code]) {
          const x = await tryPut(`candidate ${c.code} ${st}`, () => put(ho2, 'candidate', c.code, { requisition_id: req.id, display_name: candRow[c.code].display_name, source: c.source, stage: st, note: '' }, candRow[c.code].ver));
          if (x) candRow[c.code] = x;
        }
      }
    }
    // onboarding: the checks other than training are done the day after the hire
    for (const e of people.employees) {
      if (!created.has(e.code) || e.hire_date < from) continue;
      if (addDays(e.hire_date, 1) === day) {
        for (const k of ['medical', 'ppe', 'badge', 'contract_signed']) await tryPut(`onboarding ${e.code} ${k}`, async () => {
          const t = (await hr('GET', `/api/recruitment/onboarding?employee=${hrCode[e.code]}`)).tasks.find((x) => x.kind === k);
          return t && !t.done_on ? put(ho2, 'onboarding_task', t.code, { employee_id: empGid(hrCode[e.code]), kind: k, due: t.due, done_on: day }, t.ver) : null;
        });
      }
    }
    // training: planned on its first day, completed on its last (the results qualify people and complete their onboarding)
    for (const t of hiring.training) {
      const codes = t.attendees.map((a) => hrCode[a]).filter(Boolean);
      if (t.dates[0] === day && codes.length) {
        const x = await tryPut(`training ${t.code}`, () => put(ho2, 'training_session', t.code, { course_id: course.id, session_date: t.dates[0], trainer: 'internal trainer', attendees: codes.map((c) => ({ employee_code: c })), status: 'planned' }));
        if (x) sessionRow[t.code] = x;
      }
      if (t.dates[t.dates.length - 1] === day && sessionRow[t.code]) {
        const x = await tryPut(`training result ${t.code}`, () => hr('POST', `/api/training/sessions/${t.code}/complete`, { results: codes.map((c) => ({ employee_code: c, result: t.result })) }));
        if (x) { stats.trainings++; for (const a of t.attendees) if (hrCode[a]) await tryPut(`station training ${a}`, async () => {
          const tk = (await hr('GET', `/api/recruitment/onboarding?employee=${hrCode[a]}`)).tasks.find((y) => y.kind === 'station_training');
          return tk && !tk.done_on ? put(ho2, 'onboarding_task', tk.code, { employee_id: empGid(hrCode[a]), kind: 'station_training', due: tk.due, done_on: day }, tk.ver) : null;
        }); }
      }
    }
    // qualifications reached today, assignments of people who become productive today
    await syncSkills(day);
    for (const e of people.employees) {
      if (created.has(e.code) && e.hire_date >= from && e.first_productive_date <= day && !asg.has(e.code)) { await assign(e); await leaveOf(e); }
    }
    for (const e of people.employees.filter((x) => x.c_shift_from === day && created.has(x.code) && x.hire_date >= from)) {
      const c = hrCode[e.code];
      await tryPut(`C-shift cover ${c}`, () => put(ho2, 'shift_assignment', `${c}-${e.c_shift_from}-T`, { employee_id: empGid(c), shift_id: shift.C.id, calendar_id: cal.id, kind: 'temporary', valid_from: e.c_shift_from, valid_to: e.c_shift_to, note: 'C shift overhead crew' }));
    }
    await overtimeFor(addDays(day, 1), day);
    await publish();
    // the staffing gap HR shows for the next two weeks, kept as a figure of the run
    const gap = await hr('GET', `/api/staffing/gap?from=${day}&to=${addDays(day, 13)}`, undefined, { allow: true });
    stats.gapRows += Array.isArray(gap) ? gap.filter((g) => (g.gap ?? g.short ?? 0) > 0).length : 0;
  }

  // overtime the book plans: asked the day before by the officer, approved by the manager
  const otDays = {};
  const otPlanDays = (p, e) => {
    const key = `${p.id}|${e.code}`;
    if (otDays[key]) return otDays[key];
    if (p.fridays) return (otDays[key] = new Set(p.fridays));
    const days = dateList(p.from, p.to).filter(isWork), byWeek = new Map(), out = new Set();
    for (const d of days) { const wk = addDays(d, -((dow(d) + 1) % 7)); if (!byWeek.has(wk)) byWeek.set(wk, []); byWeek.get(wk).push(d); }
    for (const [, wd] of byWeek) for (const d of [...wd].sort((a, b) => RND('otd', e.code, a, p.id) - RND('otd', e.code, b, p.id)).slice(0, Math.min(p.days_per_week, wd.length))) out.add(d);
    return (otDays[key] = out);
  };
  async function overtimeFor(target, today) {
    for (const p of P.OT_PLAN) {
      if (p.fridays ? !p.fridays.includes(target) : (target < p.from || target > p.to)) continue;
      for (const e of people.employees.filter((x) => created.has(x.code) && p.filter(x))) {
        if (!otPlanDays(p, e).has(target) || !P.activeOn(e, target) || P.absentOn(e, target) || P.onLeave(e, target)) continue;
        const c = hrCode[e.code], minutes = Math.round(((p.hours_each ?? p.hours_per_week / p.days_per_week)) * 60);
        const r = await tryPut(`overtime ${c} ${target}`, () => put(ho2, 'overtime_request', `OT-${c}-${target}-${p.id}`, { employee_id: empGid(c), work_date: target, planned_minutes: minutes, kind: p.kind, reason: p.reason, status: 'requested' }));
        if (r) { const ok = await tryPut(`overtime approval ${c} ${target}`, () => put(hr, 'overtime_request', `OT-${c}-${target}-${p.id}`, { status: 'approved' }, r.ver)); if (ok) stats.overtime++; }
      }
    }
  }

  // ---------------------------------------------------------------- crews for production
  const qualified = (e, requires, day) => requires.every((q) => e.skills.some((s) => s.skill === q.skill && s.level >= q.min_level && s.certified_on <= day && (!s.expires_on || s.expires_on >= day)));
  const reqOf = Object.fromEntries(people.station_requirements.map((r) => [r.station, r]));
  const presentOn = (e, day) => created.has(e.code) && P.activeOn(e, day) && !P.absentOn(e, day) && !P.onLeave(e, day) && (!e.leave_block || day < e.leave_block.from || day > e.leave_block.to);
  const planCache = new Map();
  /** Heads on a line for a shift and day: the station's own people who are present and qualified first, then the relief pool. */
  function crewPlan(line, shiftCode, day) {
    const key = `${line}|${shiftCode}|${day}`;
    if (planCache.has(key)) return planCache.get(key);
    const need = people.station_requirements.filter((r) => r.station.startsWith(line + '-') && r.crew > 0);
    const onShift = (e) => (shiftCode === 'C' ? P.workedC(e, day) : e.team === shiftCode);
    const staff = people.employees.filter((e) => e.line === line && e.op && onShift(e) && presentOn(e, day));
    const relief = people.employees.filter((e) => e.unit === 'REL' && e.team === shiftCode && presentOn(e, day));
    const used = new Set(), stations = {};
    let required = 0, filled = 0;
    for (const n of need) {
      const op = n.station.slice(line.length + 1);
      const crew = [];
      required += n.crew;
      for (const e of [...staff.filter((x) => x.op === op), ...relief]) {
        if (crew.length >= n.crew) break;
        if (used.has(e.code) || !qualified(e, n.requires, day)) continue;
        used.add(e.code); crew.push(e);
      }
      stations[op] = crew; filled += crew.length;
    }
    const out = { factor: required ? Math.min(1, filled / required) : 1, required, filled, stations, k: {} };
    planCache.set(key, out);
    return out;
  }
  function personFor(line, shiftCode, day, op) {
    const plan = crewPlan(line, shiftCode, day);
    const crew = plan.stations[op];
    if (!crew?.length) return undefined;
    const k = (plan.k[op] = (plan.k[op] ?? -1) + 1);
    const e = crew[k % crew.length];
    return { id: empGid(hrCode[e.code]), code: hrCode[e.code] };
  }

  async function evening(day) {
    const r = await gm('POST', '/api/labor/close-day', { date: day });
    stats.labourDays++; stats.labourFacts += r.published ?? 0;
    await pump();
  }

  return { morning, evening, crewPlan, personFor, stats, refused, hrCode, created };
}
