/* お試し用のサンプルデータ */
(function (root) {
  function weekly(days, periods) {
    const out = [];
    for (const d of days) for (const p of periods) out.push(d + '|' + p);
    return out;
  }
  function makeSample(month) {
    const teachers = [
      { id: 't1', name: '佐藤先生', levels: ['中学', '高校'], subjects: ['数学', '理科', '物理', '化学'], weekly: weekly([1, 2, 4, 5], [0, 1, 2, 3]) },
      { id: 't2', name: '鈴木先生', levels: ['中学', '高校'], subjects: ['英語', '国語'], weekly: weekly([1, 3, 5, 6], [0, 1, 2, 3]) },
      { id: 't3', name: '高橋先生', levels: ['中学', '高校'], subjects: ['国語', '社会', '日本史', '世界史'], weekly: weekly([2, 3, 4, 6], [0, 1, 2]) },
      { id: 't4', name: '田中先生', subjects: ['数学', '英語'], weekly: weekly([1, 2, 3, 4, 5], [1, 2, 3]) },
      { id: 't5', name: '伊藤先生', subjects: ['理科', '社会', '数学'], weekly: weekly([3, 4, 5, 6], [0, 1, 2, 3]) },
      { id: 't6', name: '渡辺先生', subjects: ['英語', '国語', '社会'], weekly: weekly([1, 2, 5, 6], [0, 1, 2]) },
    ].map(t => Object.assign({ levels: ['中学'], offDates: [], capacity: '' }, t));
    const names = ['青木 蓮', '石井 陽葵', '上田 湊', '遠藤 結菜', '岡田 大翔', '加藤 凛', '木村 悠真', '小林 結衣',
      '斎藤 蒼', '清水 咲良', '中村 陽翔', '西田 芽依', '原 樹', '松本 心春'];
    const patterns = [[1, 3, 5], [2, 4, 6], [1, 2, 4], [3, 5, 6], [1, 4, 6], [2, 3, 5]];
    const students = names.map((name, i) => {
      const five = i % 3 !== 2;
      const days = patterns[i % patterns.length].slice();
      if (five) days.push([2, 3, 5, 1, 6, 4][i % 6]);
      return {
        id: 's' + (i + 1), name, grade: ['中1', '中2', '中3'][i % 3], course: five ? 5 : 3,
        counts: {}, weekly: weekly([...new Set(days)], i % 4 === 0 ? [1, 2, 3] : [0, 1, 2]), offDates: [], ngs: [],
      };
    });
    // 高校生は教科を自由に選ぶ
    const high = [
      { name: '森 陽向', grade: '高1', subjects: ['英語', '数学'], days: [1, 3, 5] },
      { name: '山口 美桜', grade: '高2', subjects: ['数学', '物理', '化学'], days: [1, 2, 4, 5] },
      { name: '吉田 颯太', grade: '高3', subjects: ['英語', '国語', '日本史'], days: [2, 3, 5, 6] },
    ];
    high.forEach((h, i) => students.push({
      id: 'h' + (i + 1), name: h.name, grade: h.grade, course: 'free', subjects: h.subjects,
      counts: {}, weekly: weekly(h.days, [1, 2, 3]), offDates: [], ngs: [],
    }));
    students[0].counts = { 数学: 6, 英語: 6 };
    students[2].ngs.push({ id: 'ng1', teacherId: 't4', from: month + '-01', to: month + '-20', reason: '授業中に叱られたため' });
    students[5].ngs.push({ id: 'ng2', teacherId: 't2', from: '', to: '', reason: '相性' });
    return { teachers, students };
  }

  /* 試す用：ランダムな「テスト太郎」を作る */
  const SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];
  const HIGH_SUBJECTS = ['物理', '化学', '生物', '日本史', '世界史', '地理', '公民'];
  function pick(arr, n) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }
  function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }
  function randomPeriods(total, len) {
    len = Math.min(len, total);
    const start = rand(0, total - len);
    return Array.from({ length: len }, (_, i) => start + i);
  }
  function nextNumber(list, prefix) {
    let n = 0;
    for (const x of list) {
      const m = String(x.name).match(new RegExp('^' + prefix + '(\\d+)'));
      if (m) n = Math.max(n, Number(m[1]));
    }
    return n + 1;
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  function makeRandomTeacher(state) {
    const days = state.settings.openWeekdays;
    const P = state.settings.periods.length;
    const r = Math.random();
    const levels = r < 0.5 ? ['中学'] : r < 0.7 ? ['高校'] : ['中学', '高校'];
    let subjects = pick(SUBJECTS, rand(1, 3));
    if (levels.includes('高校') && Math.random() < 0.6) subjects = [...new Set(subjects.concat(pick(HIGH_SUBJECTS, rand(1, 2))))];
    if (!levels.includes('高校')) subjects = pick(SUBJECTS, rand(1, 3));
    return {
      id: uid('t'), name: 'テスト太郎先生' + nextNumber(state.teachers, 'テスト太郎先生'),
      levels, subjects,
      weekly: weekly(pick(days, Math.min(days.length, rand(3, 5))), randomPeriods(P, rand(3, P))),
      offDates: [], capacity: '', memo: 'テスト用',
    };
  }

  function makeRandomStudent(state, month) {
    const days = state.settings.openWeekdays;
    const P = state.settings.periods.length;
    const isHigh = Math.random() < 0.35;
    const course = isHigh ? 'free' : Math.random() < 0.6 ? 5 : 3;
    let subjects = [];
    if (isHigh) {
      // 高校生は、高校対応の講師が教えられる科目から選ぶ（いなければ英数国）
      const offered = [...new Set(state.teachers.filter(t => (t.levels || []).includes('高校')).flatMap(t => t.subjects))]
        .filter(x => x !== '理科' && x !== '社会');
      subjects = pick(offered.length ? offered : ['英語', '数学', '国語'], rand(2, 3));
    }
    const s = {
      id: uid('s'), name: 'テスト太郎' + nextNumber(state.students, 'テスト太郎'),
      grade: pick(isHigh ? ['高1', '高2', '高3'] : ['中1', '中2', '中3'], 1)[0], course, subjects, counts: {},
      // 5科目は回数が多いので来られる曜日も多めにする
      weekly: weekly(pick(days, Math.min(days.length, course === 5 ? rand(4, 5) : rand(3, 4))), randomPeriods(P, rand(2, 3))),
      offDates: [], ngs: [], memo: 'テスト用',
    };
    if (state.teachers.length && Math.random() < 0.25) {
      const t = pick(state.teachers, 1)[0];
      s.ngs.push({ id: uid('ng'), teacherId: t.id, from: month + '-01', to: month + '-' + String(rand(10, 20)).padStart(2, '0'), reason: '授業中に叱られたため（テスト）' });
    }
    return s;
  }

  const api = { makeSample, makeRandomTeacher, makeRandomStudent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(this);
