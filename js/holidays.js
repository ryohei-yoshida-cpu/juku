/* 日本の祝日計算（振替休日・国民の休日を含む） */
(function (root) {
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function nthMonday(y, m, n) {
    const first = new Date(y, m - 1, 1).getDay();
    const offset = (8 - first) % 7; // 最初の月曜までの日数
    return 1 + offset + (n - 1) * 7;
  }
  function vernal(y) { return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }
  function autumnal(y) { return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4)); }

  const cache = {};
  function holidaysOfYear(y) {
    if (cache[y]) return cache[y];
    const h = {};
    const add = (m, d, name) => { h[ymd(y, m, d)] = name; };
    add(1, 1, '元日');
    add(1, nthMonday(y, 1, 2), '成人の日');
    add(2, 11, '建国記念の日');
    if (y >= 2020) add(2, 23, '天皇誕生日');
    add(3, vernal(y), '春分の日');
    add(4, 29, '昭和の日');
    add(5, 3, '憲法記念日');
    add(5, 4, 'みどりの日');
    add(5, 5, 'こどもの日');
    add(7, nthMonday(y, 7, 3), '海の日');
    if (y >= 2016) add(8, 11, '山の日');
    add(9, nthMonday(y, 9, 3), '敬老の日');
    add(9, autumnal(y), '秋分の日');
    add(10, nthMonday(y, 10, 2), y >= 2020 ? 'スポーツの日' : '体育の日');
    add(11, 3, '文化の日');
    add(11, 23, '勤労感謝の日');

    // 国民の休日（前日と翌日が祝日の平日）
    const base = Object.keys(h);
    for (const key of base) {
      const [yy, mm, dd] = key.split('-').map(Number);
      const mid = new Date(yy, mm - 1, dd + 1);
      const next = new Date(yy, mm - 1, dd + 2);
      const midKey = ymd(mid.getFullYear(), mid.getMonth() + 1, mid.getDate());
      const nextKey = ymd(next.getFullYear(), next.getMonth() + 1, next.getDate());
      if (!h[midKey] && h[nextKey] && mid.getDay() !== 0) h[midKey] = '国民の休日';
    }
    // 振替休日（祝日が日曜なら、その後の最初の祝日でない日）
    for (const key of Object.keys(h)) {
      const [yy, mm, dd] = key.split('-').map(Number);
      if (new Date(yy, mm - 1, dd).getDay() !== 0) continue;
      let i = 1;
      for (;;) {
        const d = new Date(yy, mm - 1, dd + i);
        const k = ymd(d.getFullYear(), d.getMonth() + 1, d.getDate());
        if (!h[k]) { h[k] = '振替休日'; break; }
        i++;
      }
    }
    cache[y] = h;
    return h;
  }

  function holidayName(dateStr) {
    const y = Number(dateStr.slice(0, 4));
    return holidaysOfYear(y)[dateStr] || null;
  }

  const api = { holidaysOfYear, holidayName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.JPHolidays = api;
})(this);
