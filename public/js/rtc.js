// Звонки и голосовые каналы: WebRTC mesh (до 12 человек), сигналинг через сервер.
// Новичок в комнате шлёт offer каждому, остальные отвечают; дальше дорожки меняются через replaceTrack без пересогласования.
import { html, useState, useEffect, useRef, S, bump, on, rpc, sendBin, toast, Icon, Avatar, cx, showMenu, userName, fmtDur, chatInfo, confirmDlg, download, setSetting } from './lib.js';
import { sfx, SOUNDBOARD } from './fun.js';
import { openChat, sendPayload } from './store.js';

export const RTC = { chat: null, me: null, connected: false, muted: false, deaf: false, cam: false, screen: false, hand: false, canSpeak: true, vfx: '', speaking: {}, peers: {}, vol: {}, pin: null, min: false, ring: null, rec: null, fx: [], pttDown: false, localVideo: null, since: 0 };
let mic = null, vtrack = null, rawCam = null, vfxTimer = null, ice = [], actx = null, meters = {}, meterT = null, ringT = null, outT = null, outKill = null, joining = false, lastTalk = 0, camIdx = 0, sink = '', micId = '';

const room = () => S.rooms[RTC.chat] || { peers: [] };
const micTrack = () => (mic && mic.getAudioTracks()[0]) || null;
const applyMic = () => { const t = micTrack(); if (t) t.enabled = !RTC.muted && RTC.canSpeak && (!S.settings.ptt || RTC.pttDown); };
const sendState = p => RTC.chat && rpc('rtc.state', { chat: RTC.chat, ...p }).catch(() => {});
const sig = (to, data) => rpc('rtc.signal', { chat: RTC.chat, to, data }).catch(() => {});

async function getMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
  try { return await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: !!S.settings.noise, echoCancellation: !!S.settings.echo, autoGainControl: true, ...(micId ? { deviceId: { exact: micId } } : {}) } }); } catch (e) { return null; }
}

// ───── индикатор «говорит»
function watch(id, stream) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume().catch(() => {});
    unwatch(id); const src = actx.createMediaStreamSource(stream), an = actx.createAnalyser(); an.fftSize = 512; src.connect(an); meters[id] = { src, an, buf: new Uint8Array(an.fftSize), hold: 0 };
  } catch (e) { /* без индикатора проживём */ }
  if (!meterT) meterT = setInterval(tick, 130);
}
function unwatch(id) { const m = meters[id]; if (m) { try { m.src.disconnect(); } catch (e) { /* уже отключён */ } delete meters[id]; delete RTC.speaking[id]; } }
function tick() {
  let ch = false; const now = Date.now();
  for (const id in meters) {
    const m = meters[id]; m.an.getByteTimeDomainData(m.buf); let s = 0; for (let i = 0; i < m.buf.length; i++) { const v = (m.buf[i] - 128) / 128; s += v * v; }
    const own = id === RTC.me, loud = Math.sqrt(s / m.buf.length) > 0.035 && !(own && !(micTrack() && micTrack().enabled)); if (loud) m.hold = now + 350;
    const sp = m.hold > now; if (!!RTC.speaking[id] !== sp) { if (sp) RTC.speaking[id] = true; else delete RTC.speaking[id]; ch = true; } if (own && sp) lastTalk = now;
  }
  if (ch) bump();
  const c = S.chats[RTC.chat], s = c && c.server && S.servers[c.server];
  if (s && s.afk && s.afk !== RTC.chat && S.chats[s.afk] && now - lastTalk > 5 * 60e3) { lastTalk = now; toast('Вы долго молчали — уносим в AFK-канал. Отдыхайте.'); joinVoice(s.afk); }
}

// ───── соединения
function mkPeer(id, offerer) {
  const pc = new RTCPeerConnection({ iceServers: ice }), p = RTC.peers[id] = { id, pc, offerer, stream: new MediaStream(), audio: new Audio(), q: [], chain: Promise.resolve(), atx: null, vtx: null, bad: Date.now(), relay: false, rg: null, rt: 0, spT: null };
  p.audio.autoplay = true; p.audio.srcObject = p.stream; p.audio.muted = RTC.deaf; if (sink && p.audio.setSinkId) p.audio.setSinkId(sink).catch(() => {});
  pc.onicecandidate = e => { if (e.candidate) sig(id, { ice: e.candidate }); };
  pc.ontrack = e => { if (!p.stream.getTracks().includes(e.track)) p.stream.addTrack(e.track); if (e.track.kind === 'audio') { p.audio.play().catch(() => {}); watch(id, p.stream); setVol(id); } e.track.onunmute = bump; e.track.onmute = bump; bump(); };
  pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && offerer) pc.restartIce(); bump(); };
  if (offerer) {
    pc.onnegotiationneeded = () => { p.chain = p.chain.then(async () => { await pc.setLocalDescription(); sig(id, { sdp: pc.localDescription }); }).catch(e => console.warn('[rtc offer]', e)); };
    p.atx = pc.addTransceiver(micTrack() || 'audio', { direction: 'sendrecv', streams: mic ? [mic] : [] });
    p.vtx = pc.addTransceiver('video', { direction: 'sendrecv' }); if (vtrack) p.vtx.sender.replaceTrack(vtrack).catch(() => {});
  }
  return p;
}
function dropPeer(id) { const p = RTC.peers[id]; if (!p) return; try { p.pc.close(); } catch (e) { /* закрыт */ } p.audio.srcObject = null; clearTimeout(p.spT); if (p.rg) { try { p.rg.disconnect(); } catch (e) { /* уже отключён */ } } unwatch(id); delete RTC.peers[id]; if (RTC.pin === id) RTC.pin = null; }
function setVol(id) { const p = RTC.peers[id], pr = room().peers.find(x => x.id === id); if (p && pr) p.audio.volume = RTC.vol[pr.user] == null ? 1 : RTC.vol[pr.user]; }
on('rtc.signal', d => {
  if (d.chat !== RTC.chat || !RTC.me) return; const data = d.data || {};
  let p = RTC.peers[d.from]; if (!p) { if (!(data.sdp && data.sdp.type === 'offer')) return; p = mkPeer(d.from, false); }
  p.chain = p.chain.then(async () => {
    const pc = p.pc;
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        for (const t of pc.getTransceivers()) { const k = t.receiver.track.kind; if (k === 'audio' && (!p.atx || p.atx === t)) { p.atx = t; t.direction = 'sendrecv'; await t.sender.replaceTrack(micTrack()); } else if (k === 'video' && (!p.vtx || p.vtx === t)) { p.vtx = t; t.direction = 'sendrecv'; await t.sender.replaceTrack(vtrack); } }
        await pc.setLocalDescription(); sig(d.from, { sdp: pc.localDescription });
      }
      for (const c of p.q.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (data.ice) { if (pc.remoteDescription) await pc.addIceCandidate(data.ice).catch(() => {}); else p.q.push(data.ice); }
  }).catch(e => console.warn('[rtc signal]', e));
});

// ───── звук через сервер: запасной путь, когда прямое соединение не устанавливается (нет TURN, строгий NAT оператора, VPN)
// Микрофон → 16 кГц моно → сжатие μ-law (8 бит на отсчёт, около 16 КБ/с) → двоичные кадры по веб-сокету → сервер → собеседник. Видео так не передаётся.
const MU = (() => { const t = new Float32Array(256); for (let i = 0; i < 256; i++) { const u = ~i & 255, e = (u >> 4) & 7; let v = (((u & 15) << 3) + 132) << e; v -= 132; t[i] = ((u & 128) ? -v : v) / 32768; } return t; })();
function muEnc(x) { let v = Math.max(-32635, Math.min(32635, Math.round(x * 32768))), sign = 0; if (v < 0) { v = -v; sign = 128; } v += 132; let e = 7; for (let m = 0x4000; (v & m) === 0 && e > 0; m >>= 1) e--; return ~(sign | (e << 4) | ((v >> (e + 3)) & 15)) & 255; }
let cap = null, relayT = null, relayTold = false;
const audioCtx = () => { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume().catch(() => {}); return actx; };
function capStop() { if (!cap) return; cap.node.onaudioprocess = null; for (const n of [cap.src, cap.node, cap.mute]) { try { n.disconnect(); } catch (e) { /* уже отключён */ } } cap = null; }
function capStart() {
  if (cap && cap.mic === mic) return; capStop(); if (!mic || !micTrack()) return;
  try {
    const ctx = audioCtx(), src = ctx.createMediaStreamSource(mic), node = ctx.createScriptProcessor(2048, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
    const step = ctx.sampleRate / 16000; let pos = 0, quiet = 99;
    node.onaudioprocess = e => {
      const inp = e.inputBuffer.getChannelData(0), to = Object.keys(RTC.peers).filter(id => RTC.peers[id].relay);
      if (!to.length || !RTC.chat || RTC.muted || !RTC.canSpeak) { pos = 0; return; }
      const out = new Uint8Array(Math.ceil(inp.length / step) + 2); let n = 0, peak = 0;
      for (; pos < inp.length; pos += step) { const a = pos | 0, b = Math.min(inp.length, Math.max(a + 1, Math.round(pos + step))); let v = 0; for (let k = a; k < b; k++) v += inp[k]; v /= b - a; const m = v < 0 ? -v : v; if (m > peak) peak = m; out[n++] = muEnc(v); }
      pos -= inp.length;
      quiet = peak < 0.004 ? quiet + 1 : 0; if (quiet > 6) return; // тишину не шлём
      const head = [0xA1, RTC.chat.length]; for (let i = 0; i < RTC.chat.length; i++) head.push(RTC.chat.charCodeAt(i) & 255);
      head.push(to.length); for (const id of to) { head.push(id.length); for (let i = 0; i < id.length; i++) head.push(id.charCodeAt(i) & 255); }
      const f = new Uint8Array(head.length + n); f.set(head, 0); f.set(out.subarray(0, n), head.length);
      if (sendBin(f.buffer)) RTC.rout++;
    };
    src.connect(node); node.connect(mute); mute.connect(ctx.destination); cap = { mic, src, node, mute };
  } catch (e) { console.warn('[relay mic]', e); }
}
function playRelay(p, data) {
  try {
    const ctx = audioCtx(); if (!p.rg) { p.rg = ctx.createGain(); p.rg.connect(ctx.destination); }
    const pr = room().peers.find(x => x.id === p.id); p.rg.gain.value = RTC.deaf ? 0 : pr && RTC.vol[pr.user] != null ? RTC.vol[pr.user] : 1;
    const now = ctx.currentTime; if (p.rt > now + 0.6) return; // накопилось больше полсекунды — лишнее выбрасываем, чтобы не росла задержка
    const ratio = ctx.sampleRate / 16000, n = Math.floor(data.length * ratio), ab = ctx.createBuffer(1, n, ctx.sampleRate), ch = ab.getChannelData(0), last = data.length - 1; let sq = 0;
    for (let i = 0; i < n; i++) { const x = i / ratio, a = x | 0, v0 = MU[data[a]], v = v0 + (MU[data[a < last ? a + 1 : last]] - v0) * (x - a); ch[i] = v; sq += v * v; }
    if (p.rt < now + 0.02) p.rt = now + 0.12; // запас на неровную доставку
    const src = ctx.createBufferSource(); src.buffer = ab; src.connect(p.rg); src.start(p.rt); p.rt += ab.duration;
    const rms = Math.sqrt(sq / n); if (rms > RTC.rlvl) RTC.rlvl = rms;
    if (rms > 0.03) { if (!RTC.speaking[p.id]) { RTC.speaking[p.id] = true; bump(); } clearTimeout(p.spT); p.spT = setTimeout(() => { delete RTC.speaking[p.id]; bump(); }, 400); }
  } catch (e) { console.warn('[relay play]', e); }
}
on('#bin', buf => {
  const b = new Uint8Array(buf); if (b[0] !== 0xA2 || !RTC.chat || b.length < 4) return;
  const l = b[1], p = RTC.peers[String.fromCharCode.apply(null, b.subarray(2, 2 + l))];
  if (!p || p.pc.connectionState === 'connected') return;
  RTC.rin++; if (!p.relay) { p.relay = true; relayNote(); bump(); } // собеседник уже перешёл на запасной путь — отвечаем тем же
  playRelay(p, b.subarray(2 + l));
});
function relayNote() { capStart(); if (!relayTold) { relayTold = true; toast('Напрямую соединиться не вышло. Звук идёт через сервер, видео в таком режиме не передаётся.'); } }
function relayCheck() {
  if (!RTC.chat) return; const now = Date.now(); let ch = false;
  for (const p of Object.values(RTC.peers)) {
    const st = p.pc.connectionState;
    if (st === 'connected') { p.bad = 0; if (p.relay) { p.relay = false; ch = true; } continue; }
    if (!p.bad) p.bad = now;
    if (!p.relay && (st === 'failed' || now - p.bad > 5000)) { p.relay = true; ch = true; relayNote(); }
  }
  if (Object.values(RTC.peers).some(p => p.relay)) capStart(); else capStop();
  if (ch) bump();
}

// ───── вход и выход
async function join(chatId, { video, ring } = {}) {
  if (joining) return; if (RTC.chat === chatId) { RTC.min = false; bump(); return; }
  if (!window.RTCPeerConnection) return toast('Браузер не умеет WebRTC. Звонки не получатся.', 'err');
  joining = true;
  try {
    if (RTC.chat) await leaveVoice(true);
    mic = await getMic(); if (!mic) toast('Микрофон недоступен — вы только слушаете. Разрешите доступ и включите микрофон кнопкой.', 'err');
    const ch = S.chats[chatId], muted = !mic;
    const r = await rpc(ring ? 'call.start' : 'rtc.join', { chat: chatId, video: !!video, muted });
    Object.assign(RTC, { chat: chatId, me: r.you, connected: true, muted, deaf: false, cam: false, screen: false, hand: false, canSpeak: true, pin: null, min: false, since: Date.now(), ring: RTC.ring && RTC.ring.chat === chatId ? null : RTC.ring, rin: 0, rout: 0, rlvl: 0 });
    relayTold = false; clearInterval(relayT); relayT = setInterval(relayCheck, 1000);
    ice = r.ice || []; S.rooms[chatId] = r.room; lastTalk = Date.now(); stopRing();
    const self = r.room.peers.find(x => x.id === r.you); if (self) { RTC.canSpeak = self.speak !== false; if (!RTC.canSpeak) RTC.muted = true; }
    applyMic(); if (mic) watch(r.you, mic);
    for (const id of r.peers) mkPeer(id, true);
    sfx('join'); bump();
    if (ring && ch && !ch.server && r.room.peers.length < 2) { outT = setInterval(() => sfx('ring'), 3000); sfx('ring'); outKill = setTimeout(() => { if (RTC.chat === chatId && room().peers.length < 2) { toast('Не отвечает. Возможно, загорает.'); leaveVoice(); } }, 45000); }
    if (video) toggleCam();
    if (S.settings.ptt && ch && ch.server) toast('Режим рации: держите Пробел, чтобы говорить');
  } catch (e) { stopMedia(); toast(e.message, 'err'); } finally { joining = false; }
}
export const joinVoice = id => join(id, {});
export const startCall = (id, video) => { const r = S.rooms[id]; return join(id, { video, ring: !(r && r.peers.length) }); };
function stopRing() { clearInterval(ringT); clearInterval(outT); clearTimeout(outKill); ringT = outT = outKill = null; }
function stopVideo() { clearInterval(vfxTimer); vfxTimer = null; for (const t of [vtrack, rawCam]) if (t) { t.onended = null; t.stop(); } vtrack = rawCam = null; RTC.localVideo = null; RTC.cam = RTC.screen = false; }
function stopMedia() { stopVideo(); if (mic) mic.getTracks().forEach(t => t.stop()); mic = null; }
function cleanup(quiet) {
  if (!RTC.chat) return; stopRing(); stopRec();
  for (const id of Object.keys(RTC.peers)) dropPeer(id); for (const id of Object.keys(meters)) unwatch(id);
  clearInterval(meterT); meterT = null; clearInterval(relayT); relayT = null; capStop(); stopMedia();
  Object.assign(RTC, { chat: null, me: null, connected: false, muted: false, deaf: false, hand: false, speaking: {}, pin: null, min: false, fx: [], pttDown: false, since: 0 });
  if (!quiet) sfx('leave'); bump();
}
export async function leaveVoice(quiet) { const c = RTC.chat; if (!c) return; cleanup(quiet === true); await rpc('rtc.leave', { chat: c }).catch(() => {}); }

// ───── управление
export async function toggleMute() {
  if (!RTC.chat) return;
  if (!RTC.canSpeak) return toast('Вы слушатель. Поднимите руку — модератор выпустит на трибуну.');
  if (!mic) { mic = await getMic(); if (!mic) return toast('Микрофон недоступен. Проверьте разрешения браузера.', 'err'); watch(RTC.me, mic); for (const p of Object.values(RTC.peers)) if (p.atx) p.atx.sender.replaceTrack(micTrack()).catch(() => {}); RTC.muted = true; }
  RTC.muted = !RTC.muted; if (!RTC.muted && RTC.deaf) toggleDeaf(); applyMic(); sendState({ muted: RTC.muted }); sfx(RTC.muted ? 'drop' : 'pop'); bump();
}
export function toggleDeaf() { if (!RTC.chat) return; RTC.deaf = !RTC.deaf; for (const p of Object.values(RTC.peers)) p.audio.muted = RTC.deaf; if (RTC.deaf && !RTC.muted) { RTC.muted = true; applyMic(); } sendState({ deaf: RTC.deaf, muted: RTC.muted }); bump(); }
function setVideo(track, kind) {
  vtrack = track; RTC.cam = kind === 'cam'; RTC.screen = kind === 'screen'; RTC.localVideo = track ? new MediaStream([track]) : null;
  for (const p of Object.values(RTC.peers)) if (p.vtx) p.vtx.sender.replaceTrack(track).catch(() => {});
  sendState({ cam: RTC.cam, screen: RTC.screen }); bump();
}
/** Эффекты камеры считаются на канвасе: размытие, пикселизация и фиговый листок. */
function withFx(raw) {
  if (!RTC.vfx) return raw;
  const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([raw]); v.play().catch(() => {});
  const st = raw.getSettings(), W = Math.min(640, st.width || 640), H = Math.round(W * ((st.height || 480) / (st.width || 640))), cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const tiny = document.createElement('canvas'); tiny.width = 40; tiny.height = Math.round(40 * H / W); const tg = tiny.getContext('2d');
  vfxTimer = setInterval(() => {
    if (RTC.vfx === 'blur') { g.filter = 'blur(12px)'; g.drawImage(v, -20, -20, W + 40, H + 40); g.filter = 'none'; }
    else if (RTC.vfx === 'pixel') { tg.drawImage(v, 0, 0, tiny.width, tiny.height); g.imageSmoothingEnabled = false; g.drawImage(tiny, 0, 0, W, H); }
    else { g.drawImage(v, 0, 0, W, H); g.font = Math.round(H * 0.5) + 'px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🍃', W / 2, H * 0.62); }
  }, 40);
  return cv.captureStream(25).getVideoTracks()[0];
}
async function startCam() {
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput'), dev = devs.length ? devs[camIdx % devs.length] : null;
  const s = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, ...(dev && dev.deviceId ? { deviceId: { exact: dev.deviceId } } : {}) } });
  stopVideo(); rawCam = s.getVideoTracks()[0]; setVideo(withFx(rawCam), 'cam');
}
export async function toggleCam() {
  if (!RTC.chat) return; if (!RTC.canSpeak) return toast('Слушателям камера недоступна');
  if (RTC.cam) { stopVideo(); return setVideo(null); }
  try { await startCam(); } catch (e) { toast('Камера недоступна: ' + (e.name === 'NotAllowedError' ? 'нет разрешения' : 'устройство не найдено'), 'err'); }
}
async function setVfx(v) { RTC.vfx = v; if (RTC.cam) try { await startCam(); } catch (e) { toast('Не удалось перезапустить камеру', 'err'); } bump(); }
export async function toggleScreen() {
  if (!RTC.chat) return; if (!RTC.canSpeak) return toast('Слушателям демонстрация недоступна');
  if (RTC.screen) { stopVideo(); return setVideo(null); }
  if (!navigator.mediaDevices.getDisplayMedia) return toast('Этот браузер не умеет показывать экран', 'err');
  try { const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }); stopVideo(); const t = s.getVideoTracks()[0]; t.onended = () => { stopVideo(); setVideo(null); }; setVideo(t, 'screen'); } catch (e) { if (e.name !== 'NotAllowedError') toast('Не удалось начать демонстрацию', 'err'); }
}
const toggleHand = () => { RTC.hand = !RTC.hand; sendState({ hand: RTC.hand }); bump(); };
const fx = p => rpc('rtc.fx', { chat: RTC.chat, ...p }).catch(() => {});
async function devicesMenu(e) {
  const devs = await navigator.mediaDevices.enumerateDevices().catch(() => []), ins = devs.filter(d => d.kind === 'audioinput' && d.deviceId), outs = devs.filter(d => d.kind === 'audiooutput' && d.deviceId), cams = devs.filter(d => d.kind === 'videoinput' && d.deviceId);
  const useMic = async id => { micId = id; const s = await getMic(); if (!s) return toast('Этот микрофон не отвечает', 'err'); if (mic) mic.getTracks().forEach(t => t.stop()); mic = s; applyMic(); watch(RTC.me, mic); for (const p of Object.values(RTC.peers)) if (p.atx) p.atx.sender.replaceTrack(micTrack()).catch(() => {}); toast('Микрофон переключён'); };
  showMenu(e, [
    { icon: 'mic', label: 'Микрофон', sub: ins.length ? ins.map((d, i) => ({ label: d.label || 'Микрофон ' + (i + 1), on: mic && micTrack() && micTrack().getSettings().deviceId === d.deviceId, run: () => useMic(d.deviceId) })) : [{ label: 'Устройств не найдено', disabled: true }] },
    { icon: 'volume-2', label: 'Динамики', sub: outs.length && HTMLMediaElement.prototype.setSinkId ? outs.map((d, i) => ({ label: d.label || 'Выход ' + (i + 1), on: sink === d.deviceId, run: () => { sink = d.deviceId; for (const p of Object.values(RTC.peers)) p.audio.setSinkId(sink).catch(() => {}); } })) : [{ label: 'Браузер выбирает сам', disabled: true }] },
    cams.length > 1 && { icon: 'switch-camera', label: 'Сменить камеру', run: async () => { camIdx++; if (RTC.cam) try { await startCam(); } catch (er) { toast('Камера не переключилась', 'err'); } } },
    { icon: 'sparkles', label: 'Эффект камеры', sub: [['', 'Как есть'], ['blur', 'Запотевшее стекло (размытие)'], ['pixel', 'Цензура (пиксели)'], ['leaf', 'Фиговый листок']].map(([v, l]) => ({ label: l, on: RTC.vfx === v, run: () => setVfx(v) })) },
    '-',
    { icon: 'audio-lines', label: 'Шумоподавление', on: !!S.settings.noise, run: () => { setSetting({ noise: !S.settings.noise }); toast('Применится при следующем подключении микрофона'); } },
    { icon: 'radio', label: 'Режим рации (Пробел)', on: !!S.settings.ptt, run: () => { setSetting({ ptt: !S.settings.ptt }); applyMic(); bump(); } },
    { icon: 'circle-dot', label: RTC.rec ? 'Остановить запись' : 'Записать звонок', danger: !!RTC.rec, run: () => (RTC.rec ? stopRec() : startRec()) },
  ], { right: true });
}
async function startRec() {
  if (!window.MediaRecorder || !actx) return toast('Запись в этом браузере недоступна', 'err');
  if (!(await confirmDlg({ title: 'Записать звонок?', text: 'Все участники увидят, что идёт запись: в чат уйдёт сообщение. Записывать людей без их ведома нельзя — даже на нудистском пляже.', ok: 'Начать запись' }))) return;
  const dst = actx.createMediaStreamDestination(), srcs = []; const add = s => { if (s && s.getAudioTracks().length) { const n = actx.createMediaStreamSource(s); n.connect(dst); srcs.push(n); } };
  add(mic); for (const p of Object.values(RTC.peers)) add(p.stream);
  const mr = new MediaRecorder(dst.stream), parts = [], chat = RTC.chat; mr.ondataavailable = e => e.data.size && parts.push(e.data);
  mr.onstop = () => { srcs.forEach(n => { try { n.disconnect(); } catch (e) { /* ок */ } }); if (parts.length) download(`zvonok-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.webm`, new Blob(parts, { type: mr.mimeType || 'audio/webm' })); toast('Запись сохранена в загрузки'); };
  mr.start(1000); RTC.rec = mr; fx({ e: '⏺' }); sendPayload(chat, { text: '⏺ Начата запись звонка. Кто против — самое время сказать.' }); bump();
}
function stopRec() { const mr = RTC.rec; if (!mr) return; RTC.rec = null; try { mr.stop(); } catch (e) { /* уже остановлена */ } bump(); }

// ───── события сервера
on('rtc.room', d => {
  const prev = S.rooms[d.chat]; if (d.peers.length) S.rooms[d.chat] = d; else delete S.rooms[d.chat];
  if (d.chat !== RTC.chat) return;
  const ids = new Set(d.peers.map(p => p.id)); for (const id of Object.keys(RTC.peers)) if (!ids.has(id)) dropPeer(id);
  for (const p of d.peers) setVol(p.id);
  const n0 = prev ? prev.peers.length : 0; if (d.peers.length > n0) sfx('join'); else if (d.peers.length < n0) sfx('leave');
  if (d.peers.length > 1) stopRing();
  const me = d.peers.find(p => p.id === RTC.me); if (me && me.muted && !RTC.muted) { RTC.muted = true; applyMic(); }
});
on('rtc.kicked', d => { if (d.chat === RTC.chat) { cleanup(); toast('Вас отключили от голосового канала'); } });
on('rtc.force', d => {
  if (d.chat !== RTC.chat) return;
  if (d.mute !== undefined) { if (d.mute) { RTC.muted = true; applyMic(); } toast(d.mute ? 'Модератор выключил вам микрофон' : 'Модератор разрешил включить микрофон'); }
  if (d.speak !== undefined) { RTC.canSpeak = d.speak; RTC.hand = false; if (!d.speak) { RTC.muted = true; if (vtrack) { stopVideo(); setVideo(null); } } applyMic(); toast(d.speak ? 'Вас выпустили на трибуну. Микрофон в ваших руках.' : 'Вы снова в зале, среди слушателей'); }
});
on('rtc.move', d => { if (d.from === RTC.chat) { toast('Вас переместили в другой канал'); join(d.to, {}); } });
on('rtc.fx', d => {
  if (d.chat !== RTC.chat) return; if (d.sound) sfx(d.sound);
  if (d.e === '⏺') { if (d.user !== S.me.id) toast(userName(S.users[d.user]) + ' записывает звонок', 'err'); return; }
  if (d.e) { const f = { id: Math.random(), e: d.e, user: d.user, x: 8 + Math.random() * 84 }; RTC.fx.push(f); setTimeout(() => { RTC.fx = RTC.fx.filter(x => x !== f); bump(); }, 2600); }
});
on('call.ring', d => {
  if (RTC.chat) { if (RTC.chat !== d.chat) toast(`📞 ${userName(d.user)} звонит, пока вы на линии`); return; }
  RTC.ring = d; stopRing(); sfx('ring'); ringT = setInterval(() => sfx('ring'), 2600);
  if (document.hidden && window.Notification && Notification.permission === 'granted') try { new Notification('Входящий звонок', { body: userName(d.user) + (d.video ? ' звонит по видео' : ' звонит'), icon: '/icon.svg', tag: 'call', requireInteraction: true }); } catch (e) { /* не судьба */ }
  setTimeout(() => { if (RTC.ring === d) { RTC.ring = null; stopRing(); bump(); } }, 45000);
});
on('call.end', d => { if (RTC.ring && RTC.ring.chat === d.chat) { RTC.ring = null; stopRing(); } if (!d.quiet && RTC.chat === d.chat) cleanup(); });
on('call.declined', d => { if (RTC.chat === d.chat && room().peers.length < 2) { toast('Абонент отклонил звонок. Бывает.'); leaveVoice(); } });
on('init', () => { RTC.ring = null; stopRing(); if (RTC.chat) { const c = RTC.chat; cleanup(true); setTimeout(() => join(c, {}), 300); } });
const typingIn = t => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName));
window.addEventListener('keydown', e => { if (e.code === 'Space' && RTC.chat && S.settings.ptt && !typingIn(e.target)) { e.preventDefault(); if (!RTC.pttDown) { RTC.pttDown = true; applyMic(); bump(); } } });
window.addEventListener('keyup', e => { if (e.code === 'Space' && RTC.pttDown) { RTC.pttDown = false; applyMic(); bump(); } });
window.addEventListener('blur', () => { if (RTC.pttDown) { RTC.pttDown = false; applyMic(); bump(); } });
window.addEventListener('pagehide', () => { if (RTC.chat) rpc('rtc.leave', { chat: RTC.chat }).catch(() => {}); });

// ───── интерфейс
function Vid({ stream, mirror, contain }) {
  const r = useRef(); useEffect(() => { const v = r.current; if (!v) return; v.muted = true; if (v.srcObject !== stream) v.srcObject = stream; v.play().catch(() => {}); }, [stream]);
  return html`<video ref=${r} autoplay playsinline class=${cx(mirror && 'mirror', contain && 'contain')}></video>`;
}
function peerMenu(e, chat, pr) {
  e.preventDefault(); const u = S.users[pr.user], me = pr.id === RTC.me, mod = chat.can && (chat.server ? chat.can.voice : chat.can.ban), v = RTC.vol[pr.user] == null ? 1 : RTC.vol[pr.user];
  const others = chat.server ? Object.values(S.chats).filter(c => c.server === chat.server && (c.kind === 'voice' || c.kind === 'stage') && c.id !== chat.id) : [];
  const act = (a, extra) => rpc('rtc.mod', { chat: chat.id, peer: pr.id, act: a, ...extra }).catch(er => toast(er.message, 'err'));
  showMenu(e, [
    { icon: RTC.pin === pr.id ? 'pin-off' : 'pin', label: RTC.pin === pr.id ? 'Открепить' : 'Закрепить на весь экран', run: () => { RTC.pin = RTC.pin === pr.id ? null : pr.id; bump(); } },
    !me && { icon: 'volume-2', label: 'Громкость', sub: [[0, 'Выключить (0%)'], [0.25, '25%'], [0.5, '50%'], [0.75, '75%'], [1, '100%']].map(([n, l]) => ({ label: l, on: v === n, run: () => { RTC.vol[pr.user] = n; setVol(pr.id); } })) },
    !me && mod && '-',
    !me && mod && { icon: 'mic-off', label: 'Выключить микрофон (серверный мут)', run: () => act('mute') },
    !me && mod && chat.kind === 'stage' && { icon: 'megaphone', label: pr.speak ? 'Вернуть в зал' : 'Выпустить на трибуну', run: () => act('speak') },
    !me && mod && others.length > 0 && { icon: 'arrow-right', label: 'Переместить', sub: others.map(c => ({ label: c.title, run: () => act('move', { to: c.id }) })) },
    !me && mod && { icon: 'phone-off', label: 'Отключить', danger: true, run: () => act('kick') },
  ], { head: html`<div class="menu-head"><${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${36} /><div><b>${userName(u)}</b><small>${me ? 'это вы' : pr.muted ? 'микрофон выключен' : 'в эфире'}</small></div></div>` });
}
function Tile({ chat, pr, big }) {
  const u = S.users[pr.user], me = pr.id === RTC.me, p = RTC.peers[pr.id], stream = me ? RTC.localVideo : p && p.stream, hasVid = (pr.cam || pr.screen) && stream && stream.getVideoTracks().length > 0;
  const st = me ? '' : !p ? '' : p.pc.connectionState === 'connected' ? '' : p.relay ? 'через сервер' : p.pc.connectionState === 'failed' ? 'нет связи' : 'соединение…';
  return html`<div class=${cx('tile', RTC.speaking[pr.id] && !pr.muted && 'talk', big && 'big', hasVid && 'vid')} onClick=${() => { RTC.pin = RTC.pin === pr.id ? null : pr.id; bump(); }} onContextMenu=${e => peerMenu(e, chat, pr)}>
    ${hasVid ? html`<${Vid} stream=${stream} mirror=${me && pr.cam && !RTC.vfx} contain=${pr.screen} />` : html`<${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${big ? 120 : 72} />`}
    <span class="tile-n">${pr.muted && html`<${Icon} n="mic-off" s=${13} />`}${pr.deaf && html`<${Icon} n="headphone-off" s=${13} />`}${pr.screen && html`<${Icon} n="monitor-up" s=${13} />`}<b>${userName(u)}${me ? ' (вы)' : ''}</b>${st && html`<i>${st}</i>`}</span>
    ${pr.hand && html`<span class="tile-hand">✋</span>`}<button class="ib sm tile-m" aria-label="Действия" onClick=${e => { e.stopPropagation(); peerMenu(e, chat, pr); }}><${Icon} n="ellipsis" s=${16} /></button></div>`;
}
function Timer({ from }) { const [, f] = useState(0); useEffect(() => { const t = setInterval(() => f(x => x + 1), 1000); return () => clearInterval(t); }, []); return html`<span class="mono">${fmtDur((Date.now() - from) / 1000)}</span>`; }
function Controls({ chat }) {
  const stage = chat.kind === 'stage';
  const rx = e => showMenu(e, ['👍', '😂', '🔥', '👏', '❤️', '🍃', '🤡', '💀'].map(x => ({ emoji: x, label: 'Отправить ' + x, run: () => fx({ e: x }) })));
  const sb = e => showMenu(e, SOUNDBOARD.map(([k, em, l]) => ({ emoji: em, label: l, run: () => fx({ sound: k }) })));
  return html`<div class="vctl" role="toolbar" aria-label="Управление звонком">
    <button class=${cx('cb', RTC.muted && 'off', S.settings.ptt && !RTC.muted && (RTC.pttDown ? 'live' : 'ptt'))} title=${RTC.muted ? 'Включить микрофон' : 'Выключить микрофон'} onClick=${toggleMute}><${Icon} n=${RTC.muted ? 'mic-off' : 'mic'} /></button>
    <button class=${cx('cb', RTC.deaf && 'off')} title=${RTC.deaf ? 'Включить звук' : 'Выключить звук'} onClick=${toggleDeaf}><${Icon} n=${RTC.deaf ? 'headphone-off' : 'headphones'} /></button>
    <button class=${cx('cb', RTC.cam && 'on')} title="Камера" onClick=${toggleCam}><${Icon} n=${RTC.cam ? 'video' : 'video-off'} /></button>
    <button class=${cx('cb hide-s', RTC.screen && 'on')} title="Показать экран" onClick=${toggleScreen}><${Icon} n="monitor-up" /></button>
    <button class=${cx('cb', RTC.hand && 'on')} title=${stage && !RTC.canSpeak ? 'Попроситься на трибуну' : 'Поднять руку'} onClick=${toggleHand}><${Icon} n="hand" /></button>
    <button class="cb" title="Реакция" onClick=${rx}><${Icon} n="smile" /></button>
    <button class="cb hide-s" title="Звуковая панель" onClick=${sb}><${Icon} n="drum" /></button>
    <button class=${cx('cb', RTC.rec && 'rec')} title="Устройства, эффекты, запись" onClick=${devicesMenu}><${Icon} n="settings-2" /></button>
    <button class="cb end" title="Отключиться" onClick=${() => leaveVoice()}><${Icon} n="phone-off" /></button></div>`;
}
function Stage({ chat }) {
  const peers = room().peers, pin = RTC.pin && peers.find(p => p.id === RTC.pin), auto = !pin && peers.find(p => p.screen), main = pin || auto;
  const stage = chat.kind === 'stage', sp = stage ? peers.filter(p => p.speak) : peers, ls = stage ? peers.filter(p => !p.speak) : [];
  return html`<div class=${cx('stage', main && 'spot')}>
    ${main ? html`<div class="spot-main"><${Tile} chat=${chat} pr=${main} big /></div><div class="spot-strip">${peers.filter(p => p !== main).map(p => html`<${Tile} key=${p.id} chat=${chat} pr=${p} />`)}</div>`
      : html`<div class=${cx('grid', 'n' + Math.min(sp.length, 9))}>${sp.map(p => html`<${Tile} key=${p.id} chat=${chat} pr=${p} big=${sp.length === 1} />`)}${stage && !sp.length && html`<p class="hint">Трибуна пуста. Кто-нибудь, скажите что-нибудь.</p>`}</div>
        ${ls.length > 0 && html`<div class="listeners"><h5>Слушатели — ${ls.length}</h5><div>${ls.map(p => { const u = S.users[p.user]; return html`<button class="lst" onClick=${e => peerMenu(e, chat, p)}><${Avatar} src=${u && u.avatar} name=${userName(u)} color=${u ? u.color : 0} s=${40} /><span>${userName(u)}</span>${p.hand && html`<i>✋</i>`}</button>`; })}</div></div>`}`}
    <div class="fxs" aria-hidden="true">${RTC.fx.map(f => html`<span key=${f.id} style=${`left:${f.x}%`}>${f.e}<small>${userName(S.users[f.user])}</small></span>`)}</div></div>`;
}
/** Голосовой канал сервера: сцена над чатом канала. */
export function VoiceRoom({ chat }) {
  const r = S.rooms[chat.id] || { peers: [] }, here = RTC.chat === chat.id;
  if (!here) return html`<div class="vroom idle"><div class="vroom-i"><${Icon} n=${chat.kind === 'stage' ? 'radio' : 'volume-2'} s=${30} /><h3>${chat.title}</h3>
    <p>${r.peers.length ? 'Сейчас в канале: ' + r.peers.map(p => userName(S.users[p.user])).join(', ') : chat.kind === 'stage' ? 'Трибуна свободна. Самое время выступить.' : 'В канале никого. Зайдите первым — остальные подтянутся на голос.'}</p>
    <button class="btn" onClick=${() => joinVoice(chat.id)}><${Icon} n="phone-call" s=${16} /> ${chat.kind === 'stage' ? 'Войти в зал' : 'Присоединиться'}</button></div></div>`;
  return html`<div class="vroom"><${Stage} chat=${chat} />${S.settings.ptt && html`<div class="ptt-hint">${RTC.pttDown ? '🎙 Вы в эфире' : 'Рация: держите Пробел, чтобы говорить'}</div>`}<${Controls} chat=${chat} /></div>`;
}
/** Слой звонков: входящий вызов, окно звонка в личке и группе, свёрнутая плашка. */
export function CallLayer() {
  const ch = RTC.chat && S.chats[RTC.chat], ring = RTC.ring, solo = ch && !ch.server && room().peers.length < 2;
  const accept = v => { const d = RTC.ring; RTC.ring = null; stopRing(); if (d) join(d.chat, { video: v }); };
  const decline = () => { const d = RTC.ring; RTC.ring = null; stopRing(); if (d) rpc('call.decline', { chat: d.chat }).catch(() => {}); bump(); };
  return html`${ring && html`<div class="ringing" role="alertdialog" aria-label="Входящий звонок"><div class="ring-c"><div class="ring-a"><${Avatar} src=${ring.user.avatar} name=${userName(ring.user)} color=${ring.user.color} s=${112} /></div>
      <h2>${userName(ring.user)}</h2><p>${ring.video ? 'Входящий видеозвонок' : 'Входящий звонок'}${ring.title ? ' · ' + ring.title : ''}</p><small>${ring.video ? 'Накиньте что-нибудь. Или включите фиговый листок в эффектах.' : 'Голосом можно всё, вас не видно.'}</small>
      <div class="ring-b"><button class="cb end" onClick=${decline} aria-label="Отклонить"><${Icon} n="phone-off" s=${26} /></button><button class="cb go" onClick=${() => accept(false)} aria-label="Ответить голосом"><${Icon} n="phone" s=${26} /></button>${ring.video && html`<button class="cb go" onClick=${() => accept(true)} aria-label="Ответить с видео"><${Icon} n="video" s=${26} /></button>`}</div></div></div>`}
    ${ch && !ch.server && (RTC.min ? html`<button class="call-pill" onClick=${() => { RTC.min = false; bump(); }}><${Icon} n="phone-call" s=${16} /><b>${chatInfo(ch).title}</b>${solo ? 'вызов…' : html`<${Timer} from=${room().started || RTC.since} />`}</button>`
      : html`<div class="call" role="dialog" aria-label="Звонок"><header><button class="ib" title="Свернуть" onClick=${() => { RTC.min = true; bump(); }}><${Icon} n="minimize-2" /></button><div><b>${chatInfo(ch).title}</b><small>${solo ? 'Звоним… гудки идут' : html`<${Timer} from=${room().started || RTC.since} /> · ${room().peers.length} на линии`}${RTC.rec ? ' · ⏺ запись' : ''}</small></div><button class="ib" title="Открыть чат" onClick=${() => { RTC.min = true; openChat(ch.id); }}><${Icon} n="message-circle" /></button></header><${Stage} chat=${ch} /><${Controls} chat=${ch} /></div>`)}`;
}
