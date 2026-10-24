/* 塾の時間割メーカー：画面まわり */
(function () {
  'use strict';
  const S = window.Scheduler;
  const { SUBJECTS, COURSE_SUBJECTS, WEEKDAYS } = S;
  const STORAGE_KEY = 'juku-timetable-v1';
  let FRAMED = true;
  try { FRAMED = window.self !== window.top; } catch (e) { FRAMED = true; }

  // ---------- 状態 ----------
  function thisMonth() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  function defaultState() {
    return {
      settings: {
        month: thisMonth(),
        periods: [
          { label: '1限', start: '16:30', end: '17:50' },
          { label: '2限', start: '18:00', end: '19:20' },
          { label: '3限', start: '19:30', end: '20:50' },
          { label: '4限', start: '21:00', end: '22:00' },
        ],
        openWeekdays: [1, 2, 3, 4, 5, 6],
        holidaysOff: true,
        capacity: 2,
        maxPerDay: 2,
        defaultCount: 4,
        closedDates: [],
      },
      teachers: [],
      students: [],
      shifts: {},
      schedules: {},
    };
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      const base = defaultState();
      return Object.assign(base, data, { settings: Object.assign(base.settings, data.settings || {}) });
    } catch (e) {
      return defaultState();
    }
  }
  let state = load();
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { toast('保存できませんでした'); }
  }

  const ui = { tab: 'settings', schedView: 'day', week: 'all', draft: null, modalType: null };
  if (state.teachers.length && state.students.length) ui.tab = 'schedule';

  // ---------- ヘルパー ----------
  const $ = sel => document.querySelector(sel);
  const view = $('#view');
  const modal = $('#modal');
  const modalBody = $('#modal-body');
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const month = () => state.settings.month;
  const lessonsOf = () => state.schedules[month()] || (state.schedules[month()] = []);
  const teacherById = id => state.teachers.find(t => t.id === id);
  const studentById = id => state.students.find(s => s.id === id);
  const tName = id => (teacherById(id) || { name: '(削除済み講師)' }).name;
  const sName = id => (studentById(id) || { name: '(削除済み生徒)' }).name;
  function periodLabel(p) {
    const per = state.settings.periods[p];
    return per ? per.label : (p + 1) + '限';
  }
  function fmtDate(date, withYear) {
    const [y, m, d] = date.split('-').map(Number);
    const w = S.dow(date);
    const cls = w === 0 ? 'sun' : w === 6 ? 'sat' : '';
    return (withYear ? y + '/' : '') + m + '/' + d + '<span class="' + cls + '">(' + WEEKDAYS[w] + ')</span>';
  }
  function fmtDatePlain(date) {
    const [, m, d] = date.split('-').map(Number);
    return m + '/' + d + '(' + WEEKDAYS[S.dow(date)] + ')';
  }
  function ensureShift() {
    if (!state.shifts[month()]) {
      state.shifts[month()] = S.buildDefaultShift(state, month());
      save();
    }
    const shift = state.shifts[month()];
    for (const t of state.teachers) if (!shift[t.id]) shift[t.id] = S.buildDefaultShift(state, month())[t.id];
    return shift;
  }
  function weekdaysSummary(weekly) {
    const days = [...new Set((weekly || []).map(k => Number(k.split('|')[0])))].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    return days.length ? days.map(d => WEEKDAYS[d]).join('・') : '<span class="short">未設定</span>';
  }
  function allWeekly() {
    const out = [];
    for (const d of state.settings.openWeekdays) state.settings.periods.forEach((_, p) => out.push(d + '|' + p));
    return out;
  }
  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  const isTest = x => /^テスト太郎/.test(x.name);

  // ---------- 描画 ----------
  function render() {
    $('#month').value = month();
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
    const fn = { settings: renderSettings, teachers: renderTeachers, students: renderStudents, shift: renderShift, schedule: renderSchedule, data: renderData }[ui.tab];
    view.innerHTML = fn();
  }

  // ===== 設定 =====
  function renderSettings() {
    const st = state.settings;
    const dates = S.monthDates(month());
    const closed = dates.map(d => ({ d, r: S.closedReason(state, d) })).filter(x => x.r && x.r.indexOf('曜休み') < 0);
    return `
    <section class="panel">
      <h2>時限（コマ）</h2>
      <table class="table" style="max-width:520px">
        <thead><tr><th>名前</th><th>開始</th><th>終了</th><th></th></tr></thead>
        <tbody>${st.periods.map((p, i) => `
          <tr>
            <td><input type="text" size="6" value="${esc(p.label)}" data-period="${i}" data-key="label"></td>
            <td><input type="time" value="${esc(p.start)}" data-period="${i}" data-key="start"></td>
            <td><input type="time" value="${esc(p.end)}" data-period="${i}" data-key="end"></td>
            <td>${st.periods.length > 1 ? `<button type="button" class="small danger" data-action="del-period" data-i="${i}">削除</button>` : ''}</td>
          </tr>`).join('')}</tbody>
      </table>
      <div class="row"><button type="button" data-action="add-period">＋ 時限を追加</button></div>
    </section>
    <section class="panel">
      <h2>開校日・ルール</h2>
      <div class="row">開校する曜日：
        ${[1, 2, 3, 4, 5, 6, 0].map(d => `<label><input type="checkbox" data-setting="weekday" value="${d}" ${st.openWeekdays.includes(d) ? 'checked' : ''}>${WEEKDAYS[d]}</label>`).join(' ')}
      </div>
      <div class="row"><label><input type="checkbox" data-setting="holidaysOff" ${st.holidaysOff !== false ? 'checked' : ''}> 祝日は休み（振替休日・国民の休日を含む）</label></div>
      <div class="row">
        <label>講師1人が1コマで見る生徒数 <input type="number" min="1" max="10" data-setting="capacity" value="${st.capacity}">人</label>
        <label>生徒1人の1日の上限 <input type="number" min="1" max="10" data-setting="maxPerDay" value="${st.maxPerDay}">コマ</label>
        <label>1教科の月の回数（標準） <input type="number" min="0" max="20" data-setting="defaultCount" value="${st.defaultCount}">回</label>
      </div>
      <p class="hint">月の回数は生徒ごとに教科別で変更できます（生徒の登録画面）。講師ごとの人数も講師の登録画面で変更できます。</p>
    </section>
    <section class="panel">
      <h2>塾独自の休み（お盆・年末年始など）</h2>
      <div class="row">
        <input type="date" id="closed-date"> <input type="text" id="closed-label" placeholder="理由（例：年末年始）">
        <button type="button" data-action="add-closed">追加</button>
      </div>
      <div class="chips">${(st.closedDates || []).slice().sort((a, b) => a.date < b.date ? -1 : 1).map(c =>
        `<span class="chip">${esc(c.date)} ${esc(c.label)}<button type="button" data-action="del-closed" data-date="${esc(c.date)}" title="削除">×</button></span>`).join('') || '<span class="hint">なし</span>'}</div>
      <h3>${esc(month())} の休み（祝日・独自休み）</h3>
      <div class="chips">${closed.map(x => `<span class="tag">${fmtDate(x.d)} ${esc(x.r)}</span>`).join('') || '<span class="hint">なし</span>'}</div>
      <p class="hint">開校日：${S.openDates(state, month()).length}日</p>
    </section>`;
  }

  // ===== 講師 =====
  function renderTeachers() {
    return `
    <section class="panel">
      <h2>講師（${state.teachers.length}名）</h2>
      <p class="hint">担当できる教科と、出勤できる曜日・時限を登録します。ここで登録した曜日をもとに「① 講師シフト」が作られます。</p>
      <div class="row"><button type="button" class="primary" data-action="new-teacher">＋ 講師を登録</button>
        <button type="button" data-action="random-teacher" data-n="1">🎲 テスト講師を1人追加</button>
        <button type="button" data-action="random-teacher" data-n="5">🎲 5人追加</button>
        ${state.teachers.some(isTest) ? `<button type="button" class="danger" data-action="del-test-teachers">テスト講師を全部消す</button>` : ''}</div>
      ${state.teachers.length ? `
      <table class="table">
        <thead><tr><th>名前</th><th>担当教科</th><th>出勤曜日</th><th>1コマの人数</th><th>休みの日</th><th></th></tr></thead>
        <tbody>${state.teachers.map(t => `
          <tr>
            <td><b>${esc(t.name)}</b>${t.memo ? `<div class="hint">${esc(t.memo)}</div>` : ''}</td>
            <td>${SUBJECTS.filter(s => t.subjects.includes(s)).map(s => `<span class="tag subj-${s}">${s}</span>`).join('')}</td>
            <td>${weekdaysSummary(t.weekly)}</td>
            <td>${t.capacity ? esc(t.capacity) + '人' : '標準（' + state.settings.capacity + '人）'}</td>
            <td>${(t.offDates || []).length ? (t.offDates || []).sort().map(d => `<span class="tag">${fmtDate(d)}</span>`).join('') : '-'}</td>
            <td><button type="button" class="small" data-action="edit-teacher" data-id="${t.id}">編集</button>
                <button type="button" class="small danger" data-action="del-teacher" data-id="${t.id}">削除</button></td>
          </tr>`).join('')}</tbody>
      </table>` : ''}
    </section>`;
  }

  function weekGridHTML(selected) {
    const days = [1, 2, 3, 4, 5, 6, 0].filter(d => state.settings.openWeekdays.includes(d));
    const set = new Set(selected || []);
    return `
      <table class="week-grid">
        <thead><tr><th></th>${days.map(d => `<th class="${d === 0 ? 'sun' : d === 6 ? 'sat' : ''}">${WEEKDAYS[d]}</th>`).join('')}</tr></thead>
        <tbody>${state.settings.periods.map((per, p) => `
          <tr><th>${esc(per.label)}<div class="hint" style="margin:0">${esc(per.start)}</div></th>
          ${days.map(d => `<td><input type="checkbox" data-wk="${d}|${p}" ${set.has(d + '|' + p) ? 'checked' : ''}></td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      <div class="row"><button type="button" class="small" data-maction="wk-all">全部チェック</button><button type="button" class="small" data-maction="wk-none">全部外す</button></div>`;
  }
  function offDatesHTML(list) {
    return `
      <div class="row"><input type="date" id="off-date"><button type="button" class="small" data-maction="add-off">追加</button></div>
      <div class="chips">${(list || []).slice().sort().map(d => `<span class="chip">${fmtDate(d)}<button type="button" data-maction="del-off" data-date="${d}">×</button></span>`).join('') || '<span class="hint">なし</span>'}</div>`;
  }
  function readWeekGrid() {
    return [...modalBody.querySelectorAll('[data-wk]')].filter(i => i.checked).map(i => i.dataset.wk);
  }

  function openTeacherModal(t) {
    ui.modalType = 'teacher';
    ui.draft = t ? JSON.parse(JSON.stringify(t)) : { id: '', name: '', subjects: [], weekly: allWeekly(), offDates: [], capacity: '', memo: '' };
    renderTeacherModal();
    modal.showModal();
  }
  function renderTeacherModal() {
    const t = ui.draft;
    modalBody.innerHTML = `
      <h2>${t.id ? '講師を編集' : '講師を登録'}</h2>
      <div class="form-grid">
        <label for="f-name">名前</label><input type="text" id="f-name" value="${esc(t.name)}" placeholder="例：佐藤先生">
        <span>担当教科</span><div>${SUBJECTS.map(s => `<label><input type="checkbox" data-subj="${s}" ${t.subjects.includes(s) ? 'checked' : ''}>${s}</label>`).join(' ')}</div>
        <label for="f-cap">1コマの人数</label><div><input type="number" id="f-cap" min="1" max="10" value="${esc(t.capacity)}" placeholder="${state.settings.capacity}"> 人 <span class="hint">空欄なら設定の標準（${state.settings.capacity}人）</span></div>
        <span class="full-row"><b>出勤できる曜日・時限</b></span>
        <div class="full-row">${weekGridHTML(t.weekly)}</div>
        <span>休みの日</span><div>${offDatesHTML(t.offDates)}</div>
        <label for="f-memo">メモ</label><input type="text" id="f-memo" value="${esc(t.memo)}">
      </div>
      <div class="modal-actions">
        <button type="button" data-maction="close">キャンセル</button>
        <button type="button" class="primary" data-maction="save-teacher">保存</button>
      </div>`;
  }
  function readTeacherForm() {
    const t = ui.draft;
    t.name = $('#f-name').value.trim();
    t.subjects = SUBJECTS.filter(s => modalBody.querySelector(`[data-subj="${s}"]`).checked);
    t.capacity = $('#f-cap').value;
    t.weekly = readWeekGrid();
    t.memo = $('#f-memo').value.trim();
  }

  // ===== 生徒 =====
  function renderStudents() {
    const m = month();
    return `
    <section class="panel">
      <h2>生徒（${state.students.length}名）</h2>
      <p class="hint">3科目（英・数・国）か5科目（英・数・国・理・社）を選び、来られる曜日・時限とNG講師を登録します。</p>
      <div class="row"><button type="button" class="primary" data-action="new-student">＋ 生徒を登録</button>
        <button type="button" data-action="random-student" data-n="1">🎲 テスト生徒を1人追加</button>
        <button type="button" data-action="random-student" data-n="10">🎲 10人追加</button>
        ${state.students.some(isTest) ? `<button type="button" class="danger" data-action="del-test-students">テスト生徒を全部消す</button>` : ''}</div>
      ${state.students.length ? `
      <table class="table">
        <thead><tr><th>名前</th><th>学年</th><th>コース</th><th>月の回数</th><th>来られる曜日</th><th>NG講師</th><th></th></tr></thead>
        <tbody>${state.students.map(s => `
          <tr>
            <td><b>${esc(s.name)}</b>${s.memo ? `<div class="hint">${esc(s.memo)}</div>` : ''}</td>
            <td>${esc(s.grade)}</td>
            <td>${s.course}科目</td>
            <td>${S.subjectsOf(s).map(sub => `<span class="tag subj-${sub}">${sub.slice(0, 1)} ${S.countOf(state, s, sub)}</span>`).join('')}</td>
            <td>${weekdaysSummary(s.weekly)}</td>
            <td>${(s.ngs || []).map(n => {
              const now = (!n.from || n.from <= m + '-31') && (!n.to || n.to >= m + '-01');
              return `<span class="tag ${now ? 'ng' : ''}" title="${esc(n.reason)}">${esc(tName(n.teacherId))} ${n.from || n.to ? esc((n.from || '') + '〜' + (n.to || '')) : '無期限'}</span>`;
            }).join('') || '-'}</td>
            <td><button type="button" class="small" data-action="edit-student" data-id="${s.id}">編集</button>
                <button type="button" class="small danger" data-action="del-student" data-id="${s.id}">削除</button></td>
          </tr>`).join('')}</tbody>
      </table>` : ''}
    </section>`;
  }

  function openStudentModal(s) {
    ui.modalType = 'student';
    ui.draft = s ? JSON.parse(JSON.stringify(s)) : { id: '', name: '', grade: '中1', course: 5, counts: {}, weekly: allWeekly(), offDates: [], ngs: [], memo: '' };
    renderStudentModal();
    modal.showModal();
  }
  function renderStudentModal() {
    const s = ui.draft;
    modalBody.innerHTML = `
      <h2>${s.id ? '生徒を編集' : '生徒を登録'}</h2>
      <div class="form-grid">
        <label for="f-name">名前</label><input type="text" id="f-name" value="${esc(s.name)}">
        <label for="f-grade">学年</label><select id="f-grade">${['中1', '中2', '中3'].map(g => `<option ${s.grade === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <span>コース</span><div>
          <label><input type="radio" name="course" value="3" ${Number(s.course) === 3 ? 'checked' : ''} data-mchange="course">3科目（英・数・国）</label>
          <label><input type="radio" name="course" value="5" ${Number(s.course) === 5 ? 'checked' : ''} data-mchange="course">5科目（英・数・国・理・社）</label>
        </div>
        <span>月の回数</span><div>${COURSE_SUBJECTS[s.course].map(sub => `<label class="tag subj-${sub}">${sub} <input type="number" min="0" max="20" data-count="${sub}" value="${esc(s.counts[sub] != null ? s.counts[sub] : '')}" placeholder="${state.settings.defaultCount}">回</label>`).join(' ')}
          <div class="hint">空欄なら標準（${state.settings.defaultCount}回）</div></div>
        <span class="full-row"><b>来られる曜日・時限</b></span>
        <div class="full-row">${weekGridHTML(s.weekly)}</div>
        <span>来られない日</span><div>${offDatesHTML(s.offDates)}</div>
        <span class="full-row"><b>NG講師</b> <span class="hint">（叱られた・相性など。期間を空欄にすると無期限）</span></span>
        <div class="full-row">
          ${(s.ngs || []).map((n, i) => `
            <div class="row">
              <select data-ng="${i}" data-key="teacherId">${state.teachers.map(t => `<option value="${t.id}" ${n.teacherId === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>
              <input type="date" data-ng="${i}" data-key="from" value="${esc(n.from)}"> 〜
              <input type="date" data-ng="${i}" data-key="to" value="${esc(n.to)}">
              <input type="text" data-ng="${i}" data-key="reason" value="${esc(n.reason)}" placeholder="理由（例：授業中に叱られた）" size="22">
              <button type="button" class="small danger" data-maction="del-ng" data-i="${i}">削除</button>
            </div>`).join('')}
          ${state.teachers.length ? `<button type="button" class="small" data-maction="add-ng">＋ NGを追加</button>` : '<span class="hint">先に講師を登録してください</span>'}
        </div>
        <label for="f-memo">メモ</label><input type="text" id="f-memo" value="${esc(s.memo)}">
      </div>
      <div class="modal-actions">
        <button type="button" data-maction="close">キャンセル</button>
        <button type="button" class="primary" data-maction="save-student">保存</button>
      </div>`;
  }
  function readStudentForm() {
    const s = ui.draft;
    s.name = $('#f-name').value.trim();
    s.grade = $('#f-grade').value;
    s.course = Number(modalBody.querySelector('[name=course]:checked').value);
    modalBody.querySelectorAll('[data-count]').forEach(i => {
      if (i.value === '') delete s.counts[i.dataset.count]; else s.counts[i.dataset.count] = Number(i.value);
    });
    s.weekly = readWeekGrid();
    modalBody.querySelectorAll('[data-ng]').forEach(i => { s.ngs[Number(i.dataset.ng)][i.dataset.key] = i.value; });
    s.memo = $('#f-memo').value.trim();
  }

  // ===== ① 講師シフト =====
  function renderShift() {
    if (!state.teachers.length) return `<section class="panel"><h2>① 講師シフト</h2><p>先に「講師」タブで講師を登録してください。</p></section>`;
    const shift = ensureShift();
    const P = state.settings.periods.length;
    const lessons = lessonsOf();
    const used = new Set(lessons.map(l => l.teacherId + '|' + l.date + '|' + l.period));
    const sets = {};
    for (const t of state.teachers) sets[t.id] = new Set(shift[t.id] || []);
    const dates = S.monthDates(month());
    const rows = dates.map(d => {
      const closed = S.closedReason(state, d);
      if (closed) return `<tr class="closed"><td class="date">${fmtDate(d)}</td><td colspan="${state.teachers.length * P}">${esc(closed)}</td></tr>`;
      return `<tr><td class="date">${fmtDate(d)}</td>${state.teachers.map(t => {
        let h = '';
        for (let p = 0; p < P; p++) {
          const on = sets[t.id].has(d + '|' + p);
          const u = used.has(t.id + '|' + d + '|' + p);
          h += `<td class="cell ${on ? 'on' : ''} ${u ? 'used' : ''} ${p === 0 ? 'tsep' : ''}" data-action="toggle-shift" data-t="${t.id}" data-key="${d}|${p}" title="${esc(t.name)} ${esc(periodLabel(p))}${u ? '（授業あり）' : ''}">${on ? '○' : ''}</td>`;
        }
        return h;
      }).join('')}</tr>`;
    }).join('');
    return `
    <section class="panel">
      <h2>① 講師シフト（${esc(month())}）</h2>
      <p class="hint">まず講師の出勤コマを決めます。講師の登録内容（曜日・休みの日）と祝日から自動で作られます。マスをクリックすると ○（出勤）を付け外しできます。濃い色のマスは授業が入っているコマです。</p>
      <div class="row">
        <button type="button" data-action="rebuild-shift">講師の登録内容から作り直す</button>
        <span class="hint">講師1人あたり：${state.teachers.map(t => esc(t.name) + ' ' + sets[t.id].size + 'コマ').join(' / ')}</span>
      </div>
      <div class="scroll" style="max-height:70vh">
        <table class="shift-table">
          <thead>
            <tr><th rowspan="2">日付</th>${state.teachers.map(t => `<th colspan="${P}" class="tsep">${esc(t.name)}<br><span class="hint">${t.subjects.map(s => s.slice(0, 1)).join('')}</span></th>`).join('')}</tr>
            <tr>${state.teachers.map(() => state.settings.periods.map((p, i) => `<th class="${i === 0 ? 'tsep' : ''}">${i + 1}</th>`).join('')).join('')}</tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="row" style="margin-top:12px"><button type="button" class="primary" data-action="goto-schedule">次へ：② 生徒を埋める →</button></div>
    </section>`;
  }

  // ===== ② 時間割 =====
  function renderSchedule() {
    if (!state.teachers.length || !state.students.length) {
      return `<section class="panel"><h2>② 時間割</h2><p>講師と生徒を登録してください。「データ」タブからサンプルを読み込んで試すこともできます。</p></section>`;
    }
    ensureShift();
    const lessons = lessonsOf();
    const warnings = S.validateAll(state, month(), lessons);
    const sum = S.summary(state, lessons);
    const short = sum.reduce((a, x) => a + Math.max(0, x.total - x.assigned), 0);
    const totalNeed = sum.reduce((a, x) => a + x.total, 0);
    const views = { day: '日別（手動修正）', student: '生徒別', teacher: '講師別', issues: `不足・警告${short + warnings.size ? '（' + (short + warnings.size) + '）' : ''}` };
    let body = '';
    if (ui.schedView === 'day') body = renderDayView(lessons, warnings);
    else if (ui.schedView === 'student') body = renderStudentView(sum);
    else if (ui.schedView === 'teacher') body = renderTeacherView(lessons);
    else body = renderIssues(sum, lessons, warnings);
    return `
    <section class="panel no-print">
      <h2>② 時間割（${esc(month())}）</h2>
      <p class="hint">①の講師シフトの中に、生徒の来られる日時・NG講師・祝日を見ながら自動で生徒を埋めます。そのあと「日別」でドラッグ＆ドロップやクリックで手動修正できます。手動で直した授業には🔒が付き、自動作成をやり直しても残せます。</p>
      <div class="row">
        <button type="button" class="primary" data-action="generate">自動で埋める</button>
        <label><input type="checkbox" id="keep-locked" checked> 🔒（手動で直した授業）は残す</label>
        <button type="button" data-action="add-lesson">＋ 授業を手動で追加</button>
        ${FRAMED ? '' : '<button type="button" data-action="print">印刷</button>'}
        <button type="button" data-action="csv">CSV出力</button>
        <button type="button" class="danger" data-action="clear-schedule">この月の時間割を消す</button>
      </div>
      <div class="row">
        <span class="stat">授業 <b>${lessons.length}</b> / ${totalNeed}コマ</span>
        <span class="stat">不足 <b class="${short ? 'short' : 'full'}">${short}</b></span>
        <span class="stat">警告 <b class="${warnings.size ? 'short' : 'full'}">${warnings.size}</b></span>
      </div>
    </section>
    <section class="panel">
      <div class="subtabs no-print">${Object.entries(views).map(([k, v]) => `<button type="button" class="${ui.schedView === k ? 'active' : ''}" data-action="sched-view" data-v="${k}">${v}</button>`).join('')}</div>
      ${body}
    </section>`;
  }

  function weeksOfMonth() {
    const weeks = [];
    let cur = null;
    for (const d of S.monthDates(month())) {
      if (!cur || S.dow(d) === 1) { cur = []; weeks.push(cur); }
      cur.push(d);
    }
    return weeks;
  }

  function lessonChip(l, warnings) {
    const s = studentById(l.studentId);
    const w = warnings.get(l.id);
    const title = (s ? s.name + '（' + s.grade + '）' : '') + ' ' + l.subject + ' / ' + tName(l.teacherId) + (w ? '\n⚠ ' + w.join('\n⚠ ') : '') + (l.locked ? '\n🔒 手動で固定' : '');
    return `<span class="lesson subj-${esc(l.subject)} ${w ? 'warn' : ''}" draggable="true" data-lesson="${l.id}" title="${esc(title)}">${l.locked ? '<span class="lock">🔒</span>' : ''}${w ? '⚠' : ''}${esc(s ? s.name : sName(l.studentId))}<small>（${esc(s ? s.grade : '')}）</small> ${esc(l.subject)}</span>`;
  }

  function renderDayView(lessons, warnings) {
    const shift = ensureShift();
    const P = state.settings.periods.length;
    const weeks = weeksOfMonth();
    const dates = ui.week === 'all' ? S.monthDates(month()) : (weeks[Number(ui.week)] || []);
    const byKey = new Map();
    for (const l of lessons) {
      const k = l.date + '|' + l.period + '|' + l.teacherId;
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(l);
    }
    const shiftSets = {};
    for (const t of state.teachers) shiftSets[t.id] = new Set(shift[t.id] || []);
    const blocks = dates.map(d => {
      const closed = S.closedReason(state, d);
      const dayLessons = lessons.filter(l => l.date === d);
      if (closed && !dayLessons.length) return '';
      const teachers = state.teachers.filter(t => [...Array(P).keys()].some(p => shiftSets[t.id].has(d + '|' + p)) || dayLessons.some(l => l.teacherId === t.id));
      const orphan = [...new Set(dayLessons.filter(l => !teacherById(l.teacherId)).map(l => l.teacherId))];
      const cols = teachers.map(t => ({ id: t.id, name: t.name, subjects: t.subjects })).concat(orphan.map(id => ({ id, name: '(削除済み講師)', subjects: [] })));
      if (!cols.length) return `<div class="day-block"><h3>${fmtDate(d)}</h3><p class="hint">シフトに入っている講師がいません</p></div>`;
      return `
      <div class="day-block">
        <h3>${fmtDate(d)} ${closed ? `<span class="tag ng">${esc(closed)}</span>` : ''} <span class="hint">${dayLessons.length}コマ</span></h3>
        <div class="scroll"><table class="day-table">
          <thead><tr><th class="period"></th>${cols.map(c => `<th>${esc(c.name)} <span class="hint">${c.subjects.map(s => s.slice(0, 1)).join('')}</span></th>`).join('')}</tr></thead>
          <tbody>${state.settings.periods.map((per, p) => `
            <tr><th class="period">${esc(per.label)}<div class="hint" style="margin:0">${esc(per.start)}〜${esc(per.end)}</div></th>
            ${cols.map(c => {
              const on = shiftSets[c.id] && shiftSets[c.id].has(d + '|' + p);
              const list = byKey.get(d + '|' + p + '|' + c.id) || [];
              return `<td class="slot ${on ? '' : 'off'}" data-date="${d}" data-period="${p}" data-teacher="${c.id}">${list.map(l => lessonChip(l, warnings)).join('')}<button type="button" class="add" data-action="add-here" title="ここに授業を追加">＋</button></td>`;
            }).join('')}</tr>`).join('')}
          </tbody>
        </table></div>
      </div>`;
    }).join('');
    return `
      <div class="row no-print">
        <label>表示 <select id="week-filter">
          <option value="all" ${ui.week === 'all' ? 'selected' : ''}>1か月すべて</option>
          ${weeks.map((w, i) => `<option value="${i}" ${String(ui.week) === String(i) ? 'selected' : ''}>第${i + 1}週（${fmtDatePlain(w[0])}〜${fmtDatePlain(w[w.length - 1])}）</option>`).join('')}
        </select></label>
        <span class="hint">授業をドラッグして別のマスへ移動／クリックで編集・削除／マスの「＋」で追加。斜線のマスは講師のシフト外です。</span>
      </div>
      <div class="legend">${SUBJECTS.map(s => `<span class="tag subj-${s}">${s}</span>`).join('')}<span class="tag" style="border:2px solid var(--danger)">⚠ 要確認</span><span class="tag">🔒 手動で固定</span></div>
      ${blocks || '<p class="hint">表示する日がありません</p>'}`;
  }

  function renderStudentView(sum) {
    return `
      <table class="table">
        <thead><tr><th>生徒</th>${SUBJECTS.map(s => `<th>${s}</th>`).join('')}</tr></thead>
        <tbody>${state.students.map(s => `
          <tr><td><b>${esc(s.name)}</b><div class="hint">${esc(s.grade)}・${s.course}科目</div></td>
          ${SUBJECTS.map(sub => {
            const x = sum.find(r => r.studentId === s.id && r.subject === sub);
            if (!x) return '<td class="hint">-</td>';
            const cls = x.assigned < x.total ? 'short' : 'full';
            return `<td><span class="${cls}">${x.assigned}/${x.total}</span>
              ${x.assigned < x.total ? `<button type="button" class="small" data-action="add-for" data-s="${s.id}" data-sub="${sub}">＋</button>` : ''}
              <div>${x.lessons.map(l => `<div class="hint" style="margin:0;cursor:pointer" data-lesson-edit="${l.id}">${fmtDate(l.date)} ${esc(periodLabel(l.period))} ${esc(tName(l.teacherId))}</div>`).join('')}</div></td>`;
          }).join('')}</tr>`).join('')}
        </tbody>
      </table>`;
  }

  function renderTeacherView(lessons) {
    const shift = ensureShift();
    return `
      <table class="table">
        <thead><tr><th>講師</th><th>シフト</th><th>授業</th><th>担当生徒</th><th>日ごとの授業</th></tr></thead>
        <tbody>${state.teachers.map(t => {
          const mine = lessons.filter(l => l.teacherId === t.id).sort(S.compareLesson);
          const slots = new Set(mine.map(l => l.date + '|' + l.period));
          const byDate = {};
          for (const l of mine) (byDate[l.date] = byDate[l.date] || []).push(l);
          return `<tr><td><b>${esc(t.name)}</b><div>${t.subjects.map(s => `<span class="tag subj-${s}">${s.slice(0, 1)}</span>`).join('')}</div></td>
            <td>${(shift[t.id] || []).length}コマ</td>
            <td>${mine.length}人コマ<div class="hint">（使用${slots.size}コマ）</div></td>
            <td>${new Set(mine.map(l => l.studentId)).size}人</td>
            <td>${Object.keys(byDate).sort().map(d => `<div><b>${fmtDate(d)}</b> ${byDate[d].map(l => `${esc(periodLabel(l.period))}:${esc(sName(l.studentId))}(${esc(l.subject.slice(0, 1))})`).join('、')}</div>`).join('') || '-'}</td></tr>`;
        }).join('')}</tbody>
      </table>`;
  }

  function renderIssues(sum, lessons, warnings) {
    const shortList = sum.filter(x => x.assigned < x.total);
    const overList = sum.filter(x => x.assigned > x.total);
    const warnLessons = lessons.filter(l => warnings.has(l.id));
    return `
      <h3>回数が足りない（${shortList.length}件）</h3>
      ${shortList.length ? `<table class="table"><thead><tr><th>生徒</th><th>教科</th><th>配置</th><th>候補の空き枠</th><th></th></tr></thead><tbody>
        ${shortList.map(x => {
          const n = S.candidates(state, month(), lessons, x.studentId, x.subject).length;
          return `<tr><td>${esc(sName(x.studentId))}</td><td><span class="tag subj-${x.subject}">${x.subject}</span></td>
            <td class="short">${x.assigned}/${x.total}</td>
            <td>${n ? n + '枠' : '<span class="short">0枠</span> <span class="hint">来られる日時・講師シフト・NGを見直してください</span>'}</td>
            <td><button type="button" class="small" data-action="add-for" data-s="${x.studentId}" data-sub="${x.subject}">追加する</button></td></tr>`;
        }).join('')}</tbody></table>` : '<p class="full">すべての生徒が予定回数どおり入っています</p>'}
      ${overList.length ? `<h3>予定より多い（${overList.length}件）</h3><ul>${overList.map(x => `<li>${esc(sName(x.studentId))} ${x.subject} ${x.assigned}/${x.total}</li>`).join('')}</ul>` : ''}
      <h3>要確認の授業（${warnLessons.length}件）</h3>
      ${warnLessons.length ? `<table class="table"><thead><tr><th>日時</th><th>生徒</th><th>講師</th><th>内容</th><th></th></tr></thead><tbody>
        ${warnLessons.map(l => `<tr><td>${fmtDate(l.date)} ${esc(periodLabel(l.period))}</td><td>${esc(sName(l.studentId))} ${esc(l.subject)}</td><td>${esc(tName(l.teacherId))}</td>
          <td class="short">${warnings.get(l.id).map(esc).join('<br>')}</td><td><button type="button" class="small" data-lesson-edit="${l.id}">直す</button></td></tr>`).join('')}
      </tbody></table>` : '<p class="full">問題のある授業はありません</p>'}`;
  }

  // ----- 授業の編集モーダル -----
  function openLessonModal(lesson, preset) {
    ui.modalType = 'lesson';
    if (lesson) ui.draft = Object.assign({}, lesson, { locked: true, _existing: true });
    else {
      const p = preset || {};
      const st = studentById(p.studentId) || state.students[0];
      const subject = p.subject || S.subjectsOf(st)[0];
      ui.draft = {
        id: S.newId('l'), studentId: st.id, subject,
        date: p.date || S.openDates(state, month())[0] || S.monthDates(month())[0],
        period: p.period != null ? Number(p.period) : 0,
        teacherId: p.teacherId || (state.teachers.find(t => t.subjects.includes(subject)) || state.teachers[0]).id,
        locked: true, _existing: false,
      };
    }
    renderLessonModal();
    modal.showModal();
  }
  function renderLessonModal() {
    const l = ui.draft;
    const st = studentById(l.studentId);
    const subjects = st ? S.subjectsOf(st) : SUBJECTS;
    if (st && !subjects.includes(l.subject)) l.subject = subjects[0];
    const others = lessonsOf().filter(x => x.id !== l.id);
    const trial = others.concat([l]);
    const w = S.validateAll(state, month(), trial).get(l.id) || [];
    const cands = st ? S.candidates(state, month(), others, l.studentId, l.subject) : [];
    const sum = S.summary(state, others).find(x => x.studentId === l.studentId && x.subject === l.subject);
    modalBody.innerHTML = `
      <h2>${l._existing ? '授業を編集' : '授業を追加'}</h2>
      <div class="form-grid">
        <label for="l-student">生徒</label><select id="l-student" data-mchange="lesson">${state.students.map(s => `<option value="${s.id}" ${s.id === l.studentId ? 'selected' : ''}>${esc(s.name)}（${esc(s.grade)}・${s.course}科目）</option>`).join('')}</select>
        <label for="l-subject">教科</label><div><select id="l-subject" data-mchange="lesson">${subjects.map(s => `<option ${s === l.subject ? 'selected' : ''}>${s}</option>`).join('')}</select>
          ${sum ? `<span class="hint">この授業以外で ${sum.assigned}/${sum.total} 回</span>` : ''}</div>
        <label for="l-date">日付</label><select id="l-date" data-mchange="lesson">${S.monthDates(month()).map(d => {
          const c = S.closedReason(state, d);
          return `<option value="${d}" ${d === l.date ? 'selected' : ''}>${fmtDatePlain(d)}${c ? ' ※' + esc(c) : ''}</option>`;
        }).join('')}</select>
        <label for="l-period">時限</label><select id="l-period" data-mchange="lesson">${state.settings.periods.map((p, i) => `<option value="${i}" ${i === Number(l.period) ? 'selected' : ''}>${esc(p.label)}（${esc(p.start)}〜${esc(p.end)}）</option>`).join('')}</select>
        <label for="l-teacher">講師</label><select id="l-teacher" data-mchange="lesson">${state.teachers.map(t => `<option value="${t.id}" ${t.id === l.teacherId ? 'selected' : ''}>${esc(t.name)}（${t.subjects.map(s => s.slice(0, 1)).join('')}）${t.subjects.includes(l.subject) ? '' : ' ※担当外'}${st && S.activeNG(st, t.id, l.date) ? ' ※NG' : ''}</option>`).join('')}</select>
        <span></span><label><input type="checkbox" id="l-locked" ${l.locked ? 'checked' : ''}> 🔒 固定（自動作成をやり直しても残す）</label>
      </div>
      ${w.length ? `<ul class="warn-list">${w.map(x => `<li>⚠ ${esc(x)}</li>`).join('')}</ul>` : '<p class="full" style="margin:8px 0">✓ 問題ありません</p>'}
      <h3>${esc(st ? st.name : '')} の ${esc(l.subject)} を入れられる空き枠（${cands.length}件）</h3>
      <div class="cand-list">${cands.map(c => `<button type="button" class="small" data-maction="pick" data-date="${c.date}" data-period="${c.period}" data-teacher="${c.teacherId}">${fmtDatePlain(c.date)} ${esc(periodLabel(c.period))} ${esc(tName(c.teacherId))}</button>`).join('') || '<span class="hint">空き枠がありません（警告付きで入れることはできます）</span>'}</div>
      <div class="modal-actions">
        ${l._existing ? '<button type="button" class="danger left" data-maction="del-lesson">この授業を削除</button>' : ''}
        <button type="button" data-maction="close">キャンセル</button>
        <button type="button" class="primary" data-maction="save-lesson">保存</button>
      </div>`;
  }
  function readLessonForm() {
    const l = ui.draft;
    l.studentId = $('#l-student').value;
    l.subject = $('#l-subject').value;
    l.date = $('#l-date').value;
    l.period = Number($('#l-period').value);
    l.teacherId = $('#l-teacher').value;
    l.locked = $('#l-locked').checked;
  }

  // ===== データ =====
  function renderData() {
    return `
    <section class="panel">
      <h2>データの保存・読み込み</h2>
      <p class="hint">データはこのブラウザ内に自動保存されます（ほかのパソコン・ほかの人とは共有されません）。別のパソコンに移すときやバックアップには書き出しを使ってください。</p>
      <div class="row">
        <button type="button" data-action="export">書き出す</button>
        <label class="btn">ファイルから読み込む<input type="file" id="import-file" accept=".json,application/json" hidden></label>
      </div>
      <h3>書き出した文字を貼り付けて読み込む</h3>
      <textarea id="import-text" rows="4" style="width:100%" placeholder="ここに書き出したデータを貼り付け"></textarea>
      <div class="row"><button type="button" data-action="import-text">貼り付けたデータを読み込む</button></div>
    </section>
    <section class="panel">
      <h2>お試し</h2>
      <div class="row"><button type="button" data-action="sample">サンプルデータを読み込む（講師6名・生徒14名）</button></div>
      <p class="hint">今のデータは上書きされます。</p>
    </section>
    <section class="panel">
      <h2>初期化</h2>
      <div class="row"><button type="button" class="danger" data-action="reset">すべてのデータを消す</button></div>
    </section>`;
  }

  // ---------- 確認・書き出し ----------
  const confirmDlg = $('#confirm');
  let confirmFn = null;
  /* 確認ダイアログ。OKなら fn を実行して保存・再描画する（confirm() は埋め込み表示で使えないため） */
  function ask(message, fn) {
    confirmFn = fn;
    $('#confirm-msg').textContent = message;
    confirmDlg.showModal();
    return false;
  }
  confirmDlg.addEventListener('click', e => {
    const b = e.target.closest('[data-confirm]');
    if (!b) return;
    confirmDlg.close();
    const fn = confirmFn;
    confirmFn = null;
    if (b.dataset.confirm === 'ok' && fn && fn() !== false) { save(); render(); }
  });
  function importData(text) {
    let data;
    try {
      data = JSON.parse(text);
      if (!data.settings || !Array.isArray(data.teachers) || !Array.isArray(data.students)) throw new Error('形式が違います');
    } catch (err) { toast('読み込めませんでした：' + err.message); return; }
    ask('読み込んだデータで今のデータを置き換えます。よろしいですか？', () => {
      const base = defaultState();
      state = Object.assign(base, data, { settings: Object.assign(base.settings, data.settings) });
      toast('読み込みました');
    });
  }
  function openTextModal(title, hint, text, filename, fileText, type) {
    ui.modalType = 'text';
    modalBody.innerHTML = `
      <h2>${esc(title)}</h2>
      <p class="hint">${esc(hint)}</p>
      <textarea id="out-text" rows="12" readonly style="width:100%;font-family:monospace;font-size:12px">${esc(text)}</textarea>
      <div class="modal-actions">
        ${FRAMED ? '' : '<button type="button" class="left" data-maction="download">ファイルで保存</button>'}
        <button type="button" data-maction="close">閉じる</button>
        <button type="button" class="primary" data-maction="copy">コピー</button>
      </div>`;
    ui.textOut = { filename, fileText, type };
    modal.showModal();
  }

  // ---------- 操作 ----------
  const actions = {
    'add-period'() { const n = state.settings.periods.length + 1; state.settings.periods.push({ label: n + '限', start: '', end: '' }); },
    'del-period'(el) {
      return ask('この時限を削除しますか？（講師・生徒の曜日設定の時限番号がずれる場合があります）', () => {
        state.settings.periods.splice(Number(el.dataset.i), 1);
      });
    },
    'add-closed'() {
      const d = $('#closed-date').value;
      if (!d) { toast('日付を選んでください'); return false; }
      state.settings.closedDates = (state.settings.closedDates || []).filter(c => c.date !== d);
      state.settings.closedDates.push({ date: d, label: $('#closed-label').value.trim() || '休校日' });
    },
    'del-closed'(el) { state.settings.closedDates = state.settings.closedDates.filter(c => c.date !== el.dataset.date); },
    'random-teacher'(el) {
      const n = Number(el.dataset.n);
      for (let i = 0; i < n; i++) {
        const t = window.makeRandomTeacher(state);
        state.teachers.push(t);
        // 作成済みのシフトがある月には、この講師のシフトも足す
        for (const m of Object.keys(state.shifts)) state.shifts[m][t.id] = S.buildDefaultShift(state, m)[t.id];
      }
      toast('テスト講師を' + n + '人追加しました（教科・曜日はランダム）');
    },
    'random-student'(el) {
      const n = Number(el.dataset.n);
      for (let i = 0; i < n; i++) state.students.push(window.makeRandomStudent(state, month()));
      toast('テスト生徒を' + n + '人追加しました（コース・曜日・NGはランダム）');
    },
    'del-test-teachers'() {
      return ask('名前が「テスト太郎」の講師を全部消しますか？', () => {
        const ids = new Set(state.teachers.filter(isTest).map(t => t.id));
        state.teachers = state.teachers.filter(t => !ids.has(t.id));
        for (const m of Object.keys(state.shifts)) ids.forEach(id => delete state.shifts[m][id]);
        for (const m of Object.keys(state.schedules)) state.schedules[m] = state.schedules[m].filter(l => !ids.has(l.teacherId));
        for (const s of state.students) s.ngs = (s.ngs || []).filter(ng => !ids.has(ng.teacherId));
      });
    },
    'del-test-students'() {
      return ask('名前が「テスト太郎」の生徒を全部消しますか？（時間割からも消えます）', () => {
        const ids = new Set(state.students.filter(isTest).map(s => s.id));
        state.students = state.students.filter(s => !ids.has(s.id));
        for (const m of Object.keys(state.schedules)) state.schedules[m] = state.schedules[m].filter(l => !ids.has(l.studentId));
      });
    },
    'new-teacher'() { openTeacherModal(null); return false; },
    'edit-teacher'(el) { openTeacherModal(teacherById(el.dataset.id)); return false; },
    'del-teacher'(el) {
      const t = teacherById(el.dataset.id);
      return ask(t.name + ' を削除しますか？', () => {
        state.teachers = state.teachers.filter(x => x.id !== t.id);
        for (const m of Object.keys(state.shifts)) delete state.shifts[m][t.id];
      });
    },
    'new-student'() {
      if (!state.teachers.length) return ask('講師がまだ登録されていません。先に生徒を登録しますか？', () => { openStudentModal(null); return false; });
      openStudentModal(null); return false;
    },
    'edit-student'(el) { openStudentModal(studentById(el.dataset.id)); return false; },
    'del-student'(el) {
      const s = studentById(el.dataset.id);
      return ask(s.name + ' を削除しますか？（時間割からも消えます）', () => {
        state.students = state.students.filter(x => x.id !== s.id);
        for (const m of Object.keys(state.schedules)) state.schedules[m] = state.schedules[m].filter(l => l.studentId !== s.id);
      });
    },
    'toggle-shift'(el) {
      const shift = ensureShift();
      const list = shift[el.dataset.t] || (shift[el.dataset.t] = []);
      const i = list.indexOf(el.dataset.key);
      if (i >= 0) list.splice(i, 1); else list.push(el.dataset.key);
    },
    'rebuild-shift'() {
      return ask('講師の登録内容（曜日・休みの日）からシフトを作り直します。手で直した○×は元に戻ります。よろしいですか？', () => {
        state.shifts[month()] = S.buildDefaultShift(state, month());
        toast('シフトを作り直しました');
      });
    },
    'goto-schedule'() { ui.tab = 'schedule'; },
    generate() {
      const keep = $('#keep-locked').checked;
      const cur = lessonsOf();
      const run = () => {
        const res = S.generate(state, month(), { keepLocked: keep });
        state.schedules[month()] = res.lessons;
        const miss = res.unfilled.reduce((a, x) => a + x.missing, 0);
        toast(miss ? `作成しました（${miss}コマ入りきりませんでした。「不足・警告」を確認してください）` : '作成しました。すべて入りました');
        if (miss) ui.schedView = 'issues';
      };
      if (!cur.length) return run();
      return ask(keep ? '今の時間割を作り直します（🔒の授業は残します）。よろしいですか？' : '今の時間割をすべて消して作り直します。よろしいですか？', run);
    },
    'clear-schedule'() {
      return ask(month() + ' の時間割をすべて消しますか？', () => { state.schedules[month()] = []; });
    },
    'sched-view'(el) { ui.schedView = el.dataset.v; },
    'add-lesson'() { openLessonModal(null, {}); return false; },
    'add-here'(el) {
      const td = el.closest('td.slot');
      openLessonModal(null, { date: td.dataset.date, period: td.dataset.period, teacherId: td.dataset.teacher });
      return false;
    },
    'add-for'(el) { openLessonModal(null, { studentId: el.dataset.s, subject: el.dataset.sub }); return false; },
    print() { window.print(); return false; },
    csv() {
      const rows = [['日付', '曜日', '時限', '開始', '終了', '講師', '生徒', '学年', '教科', '固定']];
      for (const l of lessonsOf().slice().sort(S.compareLesson)) {
        const s = studentById(l.studentId) || {};
        const p = state.settings.periods[l.period] || {};
        rows.push([l.date, WEEKDAYS[S.dow(l.date)], periodLabel(l.period), p.start || '', p.end || '', tName(l.teacherId), s.name || '', s.grade || '', l.subject, l.locked ? '○' : '']);
      }
      const text = '﻿' + rows.map(r => r.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\r\n');
      openTextModal('CSV出力', 'Excelやスプレッドシートに貼り付けられます。', text.slice(1), '時間割_' + month() + '.csv', text, 'text/csv');
      return false;
    },
    export() {
      const json = JSON.stringify(state);
      openTextModal('データの書き出し', 'この文字をコピーしてメモ帳などに保存しておくと、あとで「読み込み」から元に戻せます。', json, 'juku-data_' + month() + '.json', json, 'application/json');
      return false;
    },
    sample() {
      const run = () => {
        const s = window.makeSample(month());
        const m = month();
        state = defaultState();
        state.settings.month = m;
        state.teachers = s.teachers;
        state.students = s.students;
        toast('サンプルを読み込みました。「① 講師シフト」→「② 時間割」の順に進めてください');
        ui.tab = 'shift';
      };
      if (!state.teachers.length && !state.students.length) return run();
      return ask('今のデータをサンプルで上書きします。よろしいですか？', run);
    },
    'import-text'() {
      importData($('#import-text').value);
      return false;
    },
    reset() {
      return ask('すべてのデータを消します。元に戻せません。よろしいですか？', () => { state = defaultState(); });
    },
  };

  view.addEventListener('click', e => {
    const editEl = e.target.closest('[data-lesson-edit]');
    if (editEl) { openLessonModal(lessonsOf().find(l => l.id === editEl.dataset.lessonEdit)); return; }
    const chip = e.target.closest('.lesson[data-lesson]');
    if (chip) { openLessonModal(lessonsOf().find(l => l.id === chip.dataset.lesson)); return; }
    const el = e.target.closest('[data-action]');
    if (!el || !actions[el.dataset.action]) return;
    const r = actions[el.dataset.action](el, e);
    if (r === false) return;
    save();
    render();
  });

  view.addEventListener('change', e => {
    const el = e.target;
    const st = state.settings;
    if (el.dataset.period != null && el.dataset.key) {
      st.periods[Number(el.dataset.period)][el.dataset.key] = el.value;
    } else if (el.dataset.setting === 'weekday') {
      const d = Number(el.value);
      st.openWeekdays = el.checked ? [...new Set(st.openWeekdays.concat([d]))] : st.openWeekdays.filter(x => x !== d);
    } else if (el.dataset.setting === 'holidaysOff') {
      st.holidaysOff = el.checked;
    } else if (el.dataset.setting) {
      const v = Number(el.value);
      if (!(v >= 0)) return;
      st[el.dataset.setting] = v;
    } else if (el.id === 'week-filter') {
      ui.week = el.value;
    } else if (el.id === 'import-file') {
      const file = el.files[0];
      if (!file) return;
      file.text().then(importData);
      el.value = '';
      return;
    } else return;
    save();
    render();
  });

  // ドラッグ＆ドロップで授業を移動
  view.addEventListener('dragstart', e => {
    const chip = e.target.closest('.lesson[data-lesson]');
    if (!chip) return;
    e.dataTransfer.setData('text/plain', chip.dataset.lesson);
    e.dataTransfer.effectAllowed = 'move';
  });
  view.addEventListener('dragover', e => {
    const td = e.target.closest('td.slot');
    if (!td) return;
    e.preventDefault();
    view.querySelectorAll('.drag-over').forEach(x => x !== td && x.classList.remove('drag-over'));
    td.classList.add('drag-over');
  });
  view.addEventListener('dragleave', e => {
    const td = e.target.closest('td.slot');
    if (td && !td.contains(e.relatedTarget)) td.classList.remove('drag-over');
  });
  view.addEventListener('drop', e => {
    const td = e.target.closest('td.slot');
    if (!td) return;
    e.preventDefault();
    const l = lessonsOf().find(x => x.id === e.dataTransfer.getData('text/plain'));
    if (!l) return;
    const same = l.date === td.dataset.date && l.period === Number(td.dataset.period) && l.teacherId === td.dataset.teacher;
    if (same) { td.classList.remove('drag-over'); return; }
    l.date = td.dataset.date;
    l.period = Number(td.dataset.period);
    l.teacherId = td.dataset.teacher;
    l.locked = true;
    save();
    render();
    const w = S.validateAll(state, month(), lessonsOf()).get(l.id);
    toast(w ? '移動しました（⚠ ' + w.join('、') + '）' : '移動しました');
  });

  // モーダル内の操作
  modalBody.addEventListener('click', e => {
    const el = e.target.closest('[data-maction]');
    if (!el) return;
    const a = el.dataset.maction;
    const type = ui.modalType;
    const read = () => (type === 'teacher' ? readTeacherForm() : type === 'student' ? readStudentForm() : readLessonForm());
    const rerender = () => (type === 'teacher' ? renderTeacherModal() : type === 'student' ? renderStudentModal() : renderLessonModal());
    if (a === 'close') { modal.close(); return; }
    if (a === 'copy') {
      const ta = $('#out-text');
      const fallback = () => { ta.focus(); ta.select(); toast('選択しました。Ctrl+C（⌘+C）でコピーしてください'); };
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(() => toast('コピーしました'), fallback); else fallback();
      return;
    }
    if (a === 'download') { download(ui.textOut.filename, ui.textOut.fileText, ui.textOut.type); return; }
    if (a === 'wk-all' || a === 'wk-none') { modalBody.querySelectorAll('[data-wk]').forEach(i => { i.checked = a === 'wk-all'; }); return; }
    read();
    const d = ui.draft;
    if (a === 'add-off') {
      const v = $('#off-date').value;
      if (v && !d.offDates.includes(v)) d.offDates.push(v);
    } else if (a === 'del-off') {
      d.offDates = d.offDates.filter(x => x !== el.dataset.date);
    } else if (a === 'add-ng') {
      d.ngs.push({ id: S.newId('ng'), teacherId: state.teachers[0].id, from: S.monthDates(month())[0], to: '', reason: '' });
    } else if (a === 'del-ng') {
      d.ngs.splice(Number(el.dataset.i), 1);
    } else if (a === 'pick') {
      d.date = el.dataset.date; d.period = Number(el.dataset.period); d.teacherId = el.dataset.teacher;
    } else if (a === 'save-teacher') {
      if (!d.name) { toast('名前を入力してください'); return; }
      if (!d.subjects.length) { toast('担当教科を1つ以上選んでください'); return; }
      const isNew = !d.id;
      if (isNew) { d.id = S.newId('t'); state.teachers.push(d); }
      else state.teachers[state.teachers.findIndex(t => t.id === d.id)] = d;
      // 登録内容が変わった講師は、その月のシフトを作り直す
      const sh = state.shifts[month()];
      if (sh) sh[d.id] = S.buildDefaultShift(state, month())[d.id];
      save(); modal.close(); render(); toast(isNew ? '登録しました' : '保存しました'); return;
    } else if (a === 'save-student') {
      if (!d.name) { toast('名前を入力してください'); return; }
      const isNew = !d.id;
      if (isNew) { d.id = S.newId('s'); state.students.push(d); }
      else state.students[state.students.findIndex(s => s.id === d.id)] = d;
      save(); modal.close(); render(); toast(isNew ? '登録しました' : '保存しました'); return;
    } else if (a === 'save-lesson') {
      const list = lessonsOf();
      const l = { id: d.id, date: d.date, period: d.period, teacherId: d.teacherId, studentId: d.studentId, subject: d.subject, locked: d.locked };
      const i = list.findIndex(x => x.id === l.id);
      if (i >= 0) list[i] = l; else list.push(l);
      list.sort(S.compareLesson);
      save(); modal.close(); render(); toast('保存しました'); return;
    } else if (a === 'del-lesson') {
      state.schedules[month()] = lessonsOf().filter(x => x.id !== d.id);
      save(); modal.close(); render(); toast('削除しました'); return;
    }
    rerender();
  });
  modalBody.addEventListener('change', e => {
    const kind = e.target.dataset.mchange;
    if (kind === 'lesson') { readLessonForm(); renderLessonModal(); }
    else if (kind === 'course') { readStudentForm(); renderStudentModal(); }
  });
  modalBody.addEventListener('submit', e => e.preventDefault());

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    ui.tab = b.dataset.tab;
    render();
  });
  $('#month').addEventListener('change', e => {
    if (!e.target.value) return;
    state.settings.month = e.target.value;
    ui.week = 'all';
    save();
    render();
  });

  render();
})();
