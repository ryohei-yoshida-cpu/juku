/* 時間割の自動作成・チェックのロジック（ブラウザ / Node 共用） */
(function (root) {
  const JPHolidays = (typeof module !== 'undefined' && module.exports) ? require('./holidays.js') : root.JPHolidays;

  const BASIC_SUBJECTS = ['国語', '数学', '英語', '理科', '社会'];
  const HIGH_SUBJECTS = ['物理', '化学', '生物', '日本史', '世界史', '地理', '公民'];
  const SUBJECTS = BASIC_SUBJECTS.concat(HIGH_SUBJECTS);
  // 高校の科目は、色分けなどで理科・社会のなかまとして扱う
  const SUBJECT_GROUP = { 物理: '理科', 化学: '理科', 生物: '理科', 日本史: '社会', 世界史: '社会', 地理: '社会', 公民: '社会' };
  const COURSE_SUBJECTS = { 3: ['英語', '数学', '国語'], 5: ['英語', '数学', '国語', '理科', '社会'] };
  const GRADES = ['中1', '中2', '中3', '高1', '高2', '高3'];
  const LEVELS = ['中学', '高校'];
  const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

  function pad(n) { return String(n).padStart(2, '0'); }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function dow(s) { return parseDate(s).getDay(); }
  function dayOfMonth(s) { return Number(s.slice(8, 10)); }
  function slotKey(date, period) { return date + '|' + period; }

  function monthDates(month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    const out = [];
    for (let d = 1; d <= last; d++) out.push(y + '-' + pad(m) + '-' + pad(d));
    return out;
  }

  /* その日が休みならその理由、営業日なら null */
  function closedReason(state, date) {
    const st = state.settings;
    const custom = (st.closedDates || []).find(c => c.date === date);
    if (custom) return custom.label || '休校日';
    if (st.holidaysOff !== false) {
      const h = JPHolidays.holidayName(date);
      if (h) return h;
    }
    if (!st.openWeekdays.includes(dow(date))) return WEEKDAYS[dow(date)] + '曜休み';
    return null;
  }

  function openDates(state, month) { return monthDates(month).filter(d => !closedReason(state, d)); }

  /* course は 3（英数国）・5（英数国理社）・'free'（教科を自由に選ぶ） */
  function subjectsOf(student) {
    if (student.course === 'free') return SUBJECTS.filter(s => (student.subjects || []).includes(s));
    return COURSE_SUBJECTS[student.course] || COURSE_SUBJECTS[3];
  }
  function subjectGroup(subject) { return SUBJECT_GROUP[subject] || subject; }
  function levelOf(student) { return String(student.grade || '').startsWith('高') ? '高校' : '中学'; }
  // 学校の設定がない講師（高校対応前に登録した講師）は中学のみとみなす
  function teacherLevels(teacher) { return teacher.levels && teacher.levels.length ? teacher.levels : ['中学']; }
  function teachesLevel(teacher, student) { return teacherLevels(teacher).includes(levelOf(student)); }
  function countOf(state, student, subject) {
    const c = student.counts && student.counts[subject];
    return (c === undefined || c === null || c === '') ? state.settings.defaultCount : Number(c);
  }

  function activeNG(student, teacherId, date) {
    return (student.ngs || []).find(n => n.teacherId === teacherId &&
      (!n.from || n.from <= date) && (!n.to || date <= n.to)) || null;
  }

  function personAvailable(person, date, period) {
    if ((person.offDates || []).includes(date)) return false;
    return (person.weekly || []).includes(dow(date) + '|' + period);
  }

  /* ステップ1：講師の週間パターンからその月のシフトを作る */
  function buildDefaultShift(state, month) {
    const dates = openDates(state, month);
    const shift = {};
    for (const t of state.teachers) {
      shift[t.id] = [];
      for (const d of dates) {
        for (let p = 0; p < state.settings.periods.length; p++) {
          if (personAvailable(t, d, p)) shift[t.id].push(slotKey(d, p));
        }
      }
    }
    return shift;
  }

  function getShift(state, month) {
    return (state.shifts && state.shifts[month]) || buildDefaultShift(state, month);
  }

  /* 授業の集計用インデックス */
  class Index {
    constructor() {
      this.studentSlot = new Map(); this.teacherSlot = new Map(); this.studentDay = new Map();
      this.subjDay = new Map(); this.subjDates = new Map(); this.subjTeacher = new Map();
    }
    static inc(map, key, v) { map.set(key, (map.get(key) || 0) + v); }
    apply(l, v) {
      Index.inc(this.studentSlot, l.studentId + '|' + l.date + '|' + l.period, v);
      Index.inc(this.teacherSlot, l.teacherId + '|' + l.date + '|' + l.period, v);
      Index.inc(this.studentDay, l.studentId + '|' + l.date, v);
      Index.inc(this.subjDay, l.studentId + '|' + l.subject + '|' + l.date, v);
      Index.inc(this.subjTeacher, l.studentId + '|' + l.subject + '|' + l.teacherId, v);
      const k = l.studentId + '|' + l.subject;
      const arr = this.subjDates.get(k) || [];
      if (v > 0) arr.push(l.date); else { const i = arr.indexOf(l.date); if (i >= 0) arr.splice(i, 1); }
      this.subjDates.set(k, arr);
    }
    add(l) { this.apply(l, 1); }
    remove(l) { this.apply(l, -1); }
    get(map, key) { return map.get(key) || 0; }
  }

  /* 自動配置で使う「置ける枠」の判定 */
  function canPlace(state, idx, student, subject, date, period, teacher) {
    if (!teacher.subjects.includes(subject)) return false;
    if (!teachesLevel(teacher, student)) return false;
    if (!personAvailable(student, date, period)) return false;
    if (activeNG(student, teacher.id, date)) return false;
    if (idx.get(idx.studentSlot, student.id + '|' + date + '|' + period) > 0) return false;
    if (idx.get(idx.teacherSlot, teacher.id + '|' + date + '|' + period) >= capacityOf(state, teacher)) return false;
    if (idx.get(idx.studentDay, student.id + '|' + date) >= state.settings.maxPerDay) return false;
    if (idx.get(idx.subjDay, student.id + '|' + subject + '|' + date) > 0) return false;
    return true;
  }

  function capacityOf(state, teacher) {
    return Number(teacher.capacity) > 0 ? Number(teacher.capacity) : Number(state.settings.capacity);
  }

  function teacherSlots(state, month) {
    const shift = getShift(state, month);
    const open = new Set(openDates(state, month));
    const out = [];
    for (const t of state.teachers) {
      for (const key of shift[t.id] || []) {
        const [date, p] = key.split('|');
        if (open.has(date) && Number(p) < state.settings.periods.length) out.push({ date, period: Number(p), teacher: t });
      }
    }
    out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.period - b.period);
    return out;
  }

  function score(state, idx, student, subject, slot, k, total, daysInMonth, lessonsByStudentDay) {
    let s = 0;
    // 月の中でなるべく均等に散らす
    const ideal = (k + 0.5) * daysInMonth / total;
    s += Math.abs(dayOfMonth(slot.date) - ideal) * 3;
    // 同じ教科が近い日に続かないように
    for (const d of idx.subjDates.get(student.id + '|' + subject) || []) {
      const gap = Math.abs(dayOfMonth(d) - dayOfMonth(slot.date));
      if (gap <= 1) s += 40; else if (gap <= 3) s += 15;
    }
    // 同じ日に来るなら連続したコマが良い
    const sameDay = lessonsByStudentDay.get(student.id + '|' + slot.date) || [];
    if (sameDay.length) {
      const adjacent = sameDay.some(l => Math.abs(l.period - slot.period) === 1);
      s += adjacent ? -6 : 8;
    }
    // 同じ教科は同じ講師が続けて担当する方が良い
    const sameTeacher = idx.get(idx.subjTeacher, student.id + '|' + subject + '|' + slot.teacher.id);
    const anyTeacher = (idx.subjDates.get(student.id + '|' + subject) || []).length;
    if (anyTeacher) s += sameTeacher ? -15 : 10;
    // 講師の空きコマを減らす（既に生徒がいる枠を優先）
    if (idx.get(idx.teacherSlot, slot.teacher.id + '|' + slot.date + '|' + slot.period) > 0) s -= 3;
    return s;
  }

  let seq = 0;
  function newId(prefix) { seq++; return (prefix || 'id') + Date.now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ステップ2：講師シフトの中に生徒を埋める */
  function generate(state, month, opts) {
    opts = opts || {};
    const kept = opts.keepLocked ? ((state.schedules && state.schedules[month]) || []).filter(l => l.locked) : [];
    const lessons = kept.map(l => Object.assign({}, l));
    const idx = new Index();
    const byDay = new Map();
    const addLesson = l => {
      idx.add(l);
      const k = l.studentId + '|' + l.date;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k).push(l);
    };
    lessons.forEach(addLesson);

    const slots = teacherSlots(state, month);
    const daysInMonth = monthDates(month).length;

    const demands = [];
    for (const st of state.students) {
      for (const subj of subjectsOf(st)) {
        const total = countOf(state, st, subj);
        const done = lessons.filter(l => l.studentId === st.id && l.subject === subj).length;
        if (total - done > 0) demands.push({ student: st, subject: subj, total, done, need: total - done, placed: 0, failed: false });
      }
    }
    // 空き枠が少ない（埋めにくい）生徒・教科から先に
    for (const d of demands) {
      d.options = slots.filter(sl => canPlace(state, idx, d.student, d.subject, sl.date, sl.period, sl.teacher)).length;
    }
    demands.sort((a, b) => (a.options / a.need) - (b.options / b.need));

    const maxNeed = Math.max(0, ...demands.map(d => d.need));
    for (let round = 0; round < maxNeed; round++) {
      for (const d of demands) {
        if (d.failed || d.placed >= d.need) continue;
        let best = null, bestScore = Infinity;
        for (const sl of slots) {
          if (!canPlace(state, idx, d.student, d.subject, sl.date, sl.period, sl.teacher)) continue;
          const sc = score(state, idx, d.student, d.subject, sl, d.done + d.placed, d.total, daysInMonth, byDay);
          if (sc < bestScore) { bestScore = sc; best = sl; }
        }
        if (!best) { d.failed = true; continue; }
        const l = { id: newId('l'), date: best.date, period: best.period, teacherId: best.teacher.id, studentId: d.student.id, subject: d.subject, locked: false };
        lessons.push(l);
        addLesson(l);
        d.placed++;
      }
    }
    const unfilled = demands.filter(d => d.placed < d.need).map(d => ({
      studentId: d.student.id, subject: d.subject, missing: d.need - d.placed, total: d.total,
    }));
    lessons.sort(compareLesson);
    return { lessons, unfilled };
  }

  function compareLesson(a, b) {
    return a.date < b.date ? -1 : a.date > b.date ? 1 : a.period - b.period;
  }

  /* 手動修正後のチェック：授業ID → 警告メッセージの配列 */
  function validateAll(state, month, lessons) {
    const idx = new Index();
    lessons.forEach(l => idx.add(l));
    const shift = getShift(state, month);
    const shiftSets = {};
    for (const t of state.teachers) shiftSets[t.id] = new Set(shift[t.id] || []);
    const tMap = new Map(state.teachers.map(t => [t.id, t]));
    const sMap = new Map(state.students.map(s => [s.id, s]));
    const result = new Map();
    for (const l of lessons) {
      const w = [];
      const t = tMap.get(l.teacherId), s = sMap.get(l.studentId);
      if (!t) w.push('講師が登録されていません');
      if (!s) w.push('生徒が登録されていません');
      const closed = closedReason(state, l.date);
      if (closed) w.push('休校日（' + closed + '）');
      if (t) {
        if (!shiftSets[t.id].has(slotKey(l.date, l.period))) w.push('講師のシフト外');
        if (!t.subjects.includes(l.subject)) w.push(t.name + 'は' + l.subject + 'の担当外');
        if (idx.get(idx.teacherSlot, t.id + '|' + l.date + '|' + l.period) > capacityOf(state, t)) w.push('講師の定員オーバー');
      }
      if (s) {
        const ng = t && activeNG(s, t.id, l.date);
        if (ng) w.push('NG講師' + (ng.reason ? '（' + ng.reason + '）' : ''));
        if (t && !teachesLevel(t, s)) w.push(t.name + 'は' + levelOf(s) + '生の指導に未対応');
        if (!personAvailable(s, l.date, l.period)) w.push('生徒の都合が合わない日時');
        if (!subjectsOf(s).includes(l.subject)) w.push('受講していない教科');
        if (idx.get(idx.studentSlot, s.id + '|' + l.date + '|' + l.period) > 1) w.push('生徒が同じ時間に重複');
        if (idx.get(idx.subjDay, s.id + '|' + l.subject + '|' + l.date) > 1) w.push('同じ日に同じ教科');
        if (idx.get(idx.studentDay, s.id + '|' + l.date) > state.settings.maxPerDay) w.push('1日の上限コマ数を超過');
      }
      if (l.period >= state.settings.periods.length) w.push('存在しない時限');
      if (w.length) result.set(l.id, w);
    }
    return result;
  }

  /* 生徒×教科ごとの予定数と配置数 */
  function summary(state, lessons) {
    const out = [];
    for (const s of state.students) {
      for (const subj of subjectsOf(s)) {
        const list = lessons.filter(l => l.studentId === s.id && l.subject === subj).sort(compareLesson);
        out.push({ studentId: s.id, subject: subj, total: countOf(state, s, subj), assigned: list.length, lessons: list });
      }
    }
    return out;
  }

  /* 手動追加用：今の時間割に問題なく置ける候補枠 */
  function candidates(state, month, lessons, studentId, subject, ignoreLessonId) {
    const student = state.students.find(s => s.id === studentId);
    if (!student) return [];
    const idx = new Index();
    lessons.forEach(l => { if (l.id !== ignoreLessonId) idx.add(l); });
    return teacherSlots(state, month)
      .filter(sl => canPlace(state, idx, student, subject, sl.date, sl.period, sl.teacher))
      .map(sl => ({ date: sl.date, period: sl.period, teacherId: sl.teacher.id }));
  }

  const api = {
    SUBJECTS, BASIC_SUBJECTS, HIGH_SUBJECTS, COURSE_SUBJECTS, GRADES, LEVELS, WEEKDAYS,
    subjectGroup, levelOf, teacherLevels, teachesLevel, monthDates, openDates, closedReason, subjectsOf, countOf,
    activeNG, personAvailable, buildDefaultShift, getShift, generate, validateAll, summary, candidates,
    compareLesson, newId, dow, slotKey,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Scheduler = api;
})(this);
