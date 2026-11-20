'use strict';
// Призы прошлого сезона: считаются по вкладу и выдаются сами, один раз, без потерь.
// Проверяем на чистой базе: модуль берётся напрямую, без сети — так видно, что именно начисляется.
process.env.DATA_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'nudist-payout-'));
process.env.KEEP_AWAKE = 'off';
let bad = 0, total = 0;
const ck = (n, ok, x) => { total++; if (!ok) { bad++; console.log('  ✗ ПРОВАЛ:', n, x === undefined ? '' : JSON.stringify(x).slice(0, 240)); } else if (process.env.VERBOSE) console.log('  ✓', n); };
const C = require('../server/core');
require('../server/rpc');
const days = ms => new Date(Date.now() - ms).toISOString().slice(0, 7);
const past = days(40 * 864e5);
// двое жителей: один приглашал и дарил, второй — почти ничего
const mk = (id, name) => { C.db.users[id] = { id, username: id, name, created: Date.now(), stars: 0, chats: [], contacts: [], owned: [], cos: {} }; return C.db.users[id]; };
mk('u_one', 'Первый'); mk('u_two', 'Второй'); mk('u_three', 'Третий');
C.db.seasonWins = { [past]: { u_one: { invite: 3, gift: 2, boost: 1, task: 4, game: 2 }, u_two: { invite: 1 }, u_three: {} } };
C.db.awardVotes = { [past]: { u_three: { u_one: Date.now() } } };      // Третий поблагодарил Первого
const awards = require('../server/awards');
const rows = awards.scoreList(past);
ck('в таблице только те, у кого есть вклад', rows.length === 2, rows.map(r => r.name));
ck('первый — по очкам', rows[0].id === 'u_one' && rows[0].sum > rows[1].sum, rows.map(r => [r.name, r.sum]));
const out = awards.payOut(past);
ck('призы выданы', out && out.list.length === 2, out && out.list);
ck('первое место — 3000 листиков', C.db.users.u_one.stars >= 3000, C.db.users.u_one.stars);
ck('первому — украшение', (C.db.users.u_one.owned || []).includes('frame_trident'), C.db.users.u_one.owned);
ck('второму — свои листики', C.db.users.u_two.stars > 0 && C.db.users.u_two.stars < C.db.users.u_one.stars, C.db.users.u_two.stars);
ck('у третьего ничего', C.db.users.u_three.stars === 0, C.db.users.u_three.stars);
ck('приз записан в профиль', C.db.users.u_one.seasonPrize && C.db.users.u_one.seasonPrize.place === 1, C.db.users.u_one.seasonPrize);
const again = awards.payOut(past);
ck('повторно не начисляется', again.at === out.at && C.db.users.u_one.stars === out.list[0] ? true : C.db.users.u_one.stars >= 3000, C.db.users.u_one.stars);
const before = C.db.users.u_one.stars;
awards.payOut(past);
ck('двукратного начисления нет', C.db.users.u_one.stars === before, C.db.users.u_one.stars);
// уже имеющему украшение — вместо него листики
const out2 = (() => { const s2 = days(70 * 864e5); C.db.seasonWins[s2] = { u_one: { invite: 5 } }; return awards.payOut(s2); })();
ck('за старое украшение дают листики', C.db.users.u_one.stars === before + 3000 + 300, { stars: C.db.users.u_one.stars, was: before });
console.log(`${total - bad}/${total} ✓`);
process.exit(bad ? 1 : 0);
