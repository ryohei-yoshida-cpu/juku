/* お試し用のサンプルデータ */
(function (root) {
  function weekly(days, periods) {
    const out = [];
    for (const d of days) for (const p of periods) out.push(d + '|' + p);
    return out;
  }
  function makeSample(month) {
    const teachers = [
      { id: 't1', name: '佐藤先生', subjects: ['数学', '理科'], weekly: weekly([1, 2, 4, 5], [0, 1, 2, 3]) },
      { id: 't2', name: '鈴木先生', subjects: ['英語', '国語'], weekly: weekly([1, 3, 5, 6], [0, 1, 2, 3]) },
      { id: 't3', name: '高橋先生', subjects: ['国語', '社会'], weekly: weekly([2, 3, 4, 6], [0, 1, 2]) },
      { id: 't4', name: '田中先生', subjects: ['数学', '英語'], weekly: weekly([1, 2, 3, 4, 5], [1, 2, 3]) },
      { id: 't5', name: '伊藤先生', subjects: ['理科', '社会', '数学'], weekly: weekly([3, 4, 5, 6], [0, 1, 2, 3]) },
      { id: 't6', name: '渡辺先生', subjects: ['英語', '国語', '社会'], weekly: weekly([1, 2, 5, 6], [0, 1, 2]) },
    ].map(t => Object.assign({ offDates: [], capacity: '' }, t));
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
    students[0].counts = { 数学: 6, 英語: 6 };
    students[2].ngs.push({ id: 'ng1', teacherId: 't4', from: month + '-01', to: month + '-20', reason: '授業中に叱られたため' });
    students[5].ngs.push({ id: 'ng2', teacherId: 't2', from: '', to: '', reason: '相性' });
    return { teachers, students };
  }

  /* 試す用：ランダムな「テスト太郎」を作る */
  const SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];
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
    return {
      id: uid('t'), name: 'テスト太郎先生' + nextNumber(state.teachers, 'テスト太郎先生'),
      subjects: pick(SUBJECTS, rand(1, 3)),
      weekly: weekly(pick(days, Math.min(days.length, rand(3, 5))), randomPeriods(P, rand(3, P))),
      offDates: [], capacity: '', memo: 'テスト用',
    };
  }

  function makeRandomStudent(state, month) {
    const days = state.settings.openWeekdays;
    const P = state.settings.periods.length;
    const course = Math.random() < 0.6 ? 5 : 3;
    const s = {
      id: uid('s'), name: 'テスト太郎' + nextNumber(state.students, 'テスト太郎'),
      grade: pick(['中1', '中2', '中3'], 1)[0], course, counts: {},
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
