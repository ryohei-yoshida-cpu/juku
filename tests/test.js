/* 実行: node tests/test.js */
const assert = require('assert');
const H = require('../js/holidays.js');
const S = require('../js/scheduler.js');
const { makeSample, makeRandomTeacher, makeRandomStudent } = require('../js/sample.js');

let failed = 0;
function test(name, fn) {
  try { fn(); console.log('ok   ' + name); } catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + e.message); }
}

test('祝日（2026年）', () => {
  const h = H.holidaysOfYear(2026);
  assert.strictEqual(h['2026-01-12'], '成人の日');
  assert.strictEqual(h['2026-03-20'], '春分の日');
  assert.strictEqual(h['2026-05-06'], '振替休日');      // 5/3が日曜
  assert.strictEqual(h['2026-09-21'], '敬老の日');
  assert.strictEqual(h['2026-09-22'], '国民の休日');    // 敬老の日と秋分の日の間
  assert.strictEqual(h['2026-09-23'], '秋分の日');
  assert.strictEqual(h['2026-10-12'], 'スポーツの日');
  assert.strictEqual(h['2026-11-23'], '勤労感謝の日');
  assert.strictEqual(Object.keys(h).length, 18);
});

test('祝日（2025年・振替）', () => {
  const h = H.holidaysOfYear(2025);
  assert.strictEqual(h['2025-02-24'], '振替休日');
  assert.strictEqual(h['2025-05-06'], '振替休日');
  assert.strictEqual(h['2025-11-24'], '振替休日');
  assert.strictEqual(h['2025-09-23'], '秋分の日');
});

function makeState(month) {
  const s = makeSample(month);
  return {
    settings: { month, periods: [{}, {}, {}, {}], openWeekdays: [1, 2, 3, 4, 5, 6], holidaysOff: true, capacity: 2, maxPerDay: 2, defaultCount: 4, closedDates: [{ date: month + '-14', label: '塾休み' }] },
    teachers: s.teachers, students: s.students, shifts: {}, schedules: {},
  };
}

test('自動作成：ルール違反がない', () => {
  const st = makeState('2026-11');
  const { lessons, unfilled } = S.generate(st, '2026-11');
  const w = S.validateAll(st, '2026-11', lessons);
  assert.strictEqual(w.size, 0, [...w.values()].join(' / '));
  assert.ok(!lessons.some(l => l.date === '2026-11-03' || l.date === '2026-11-23'), '祝日に授業がある');
  assert.ok(!lessons.some(l => l.date === '2026-11-14'), '独自休みに授業がある');
  const need = S.summary(st, lessons).reduce((a, x) => a + x.total, 0);
  console.log('     授業 ' + lessons.length + '/' + need + '  不足 ' + unfilled.reduce((a, x) => a + x.missing, 0));
  assert.strictEqual(unfilled.length, 0);
});

test('自動作成：回数指定・3科目/5科目', () => {
  const st = makeState('2026-11');
  const { lessons } = S.generate(st, '2026-11');
  const sum = S.summary(st, lessons);
  const s1 = sum.filter(x => x.studentId === 's1');
  assert.deepStrictEqual(s1.map(x => x.subject).sort(), ['国語', '数学', '理科', '社会', '英語'].sort());
  assert.strictEqual(s1.find(x => x.subject === '数学').assigned, 6);
  assert.strictEqual(sum.filter(x => x.studentId === 's3').length, 3);
});

test('NG講師は期間中に入らない／期間後は入れる', () => {
  const st = makeState('2026-11');
  const { lessons } = S.generate(st, '2026-11');
  assert.ok(!lessons.some(l => l.studentId === 's3' && l.teacherId === 't4' && l.date <= '2026-11-20'));
  assert.ok(!lessons.some(l => l.studentId === 's6' && l.teacherId === 't2'));
  const ng = st.students[2].ngs[0];
  assert.ok(S.activeNG(st.students[2], 't4', '2026-11-20'));
  assert.ok(!S.activeNG(st.students[2], 't4', '2026-11-21'));
  assert.ok(ng);
});

test('講師シフトから外したコマには入らない', () => {
  const st = makeState('2026-11');
  const shift = S.buildDefaultShift(st, '2026-11');
  shift.t1 = [];
  st.shifts['2026-11'] = shift;
  const { lessons } = S.generate(st, '2026-11');
  assert.ok(!lessons.some(l => l.teacherId === 't1'));
});

test('🔒の授業は作り直しても残る', () => {
  const st = makeState('2026-11');
  const fixed = { id: 'fixed1', date: '2026-11-02', period: 0, teacherId: 't1', studentId: 's1', subject: '数学', locked: true };
  st.schedules['2026-11'] = [fixed];
  const { lessons } = S.generate(st, '2026-11', { keepLocked: true });
  assert.ok(lessons.some(l => l.id === 'fixed1'));
  assert.strictEqual(lessons.filter(l => l.studentId === 's1' && l.subject === '数学').length, 6);
});

test('手動修正のチェックで問題を検出', () => {
  const st = makeState('2026-11');
  const bad = [
    { id: 'a', date: '2026-11-03', period: 0, teacherId: 't4', studentId: 's3', subject: '国語', locked: true },
    { id: 'b', date: '2026-11-03', period: 0, teacherId: 't1', studentId: 's3', subject: '数学', locked: true },
  ];
  const w = S.validateAll(st, '2026-11', bad);
  const a = w.get('a').join();
  assert.ok(a.includes('休校日'));
  assert.ok(a.includes('担当外'));
  assert.ok(a.includes('NG講師'));
  assert.ok(a.includes('重複'));
});

test('テスト太郎をランダム追加：連番・自動作成で違反なし', () => {
  const st = makeState('2026-11');
  for (let i = 0; i < 3; i++) st.teachers.push(makeRandomTeacher(st));
  for (let i = 0; i < 10; i++) st.students.push(makeRandomStudent(st, '2026-11'));
  assert.deepStrictEqual(st.teachers.slice(-3).map(t => t.name), ['テスト太郎先生1', 'テスト太郎先生2', 'テスト太郎先生3']);
  assert.strictEqual(st.students[st.students.length - 1].name, 'テスト太郎10');
  for (const t of st.teachers.slice(-3)) assert.ok(t.subjects.length >= 1 && t.weekly.length >= 3);
  const { lessons } = S.generate(st, '2026-11');
  assert.strictEqual(S.validateAll(st, '2026-11', lessons).size, 0);
});

if (failed) { console.log(failed + ' failed'); process.exit(1); }
console.log('all passed');
