'use strict';

const canvas = document.getElementById('court');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const statusText = document.getElementById('status');
const pauseButton = document.getElementById('pause');
const lobby = document.getElementById('lobby');
const W = 960, H = 600, paddleH = 90, paddleW = 12;
const joinId = new URLSearchParams(location.search).get('join');
let player = 255, computer = 255, remotePlayer = 255, scores = [0, 0], ball;
let mode = 'ready', serveDelay = 0, last = 0, sound = false, audio;
let musicEnabled = true, musicTimeout, musicIndex = 0;
let opponent = 'cpu', role, peer, connection, networkElapsed = 0;
const keys = new Set();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const vltavaTheme = [
  [64,.38],[66,.19],[67,.19],[71,.38],[69,.19],[67,.19],[66,.38],[64,.38],
  [66,.19],[67,.19],[71,.38],[69,.19],[67,.19],[66,.38],[62,.38],
  [64,.38],[66,.19],[67,.19],[71,.38],[74,.38],[71,.38],[69,.38],[67,.38],
  [66,.19],[64,.19],[62,.38],[64,.19],[66,.19],[67,.76]
];

function audioContext() { audio ||= new (window.AudioContext || window.webkitAudioContext)(); return audio; }
function beep(freq, duration = .06) {
  if (!sound) return;
  try {
    const context = audioContext(), oscillator = context.createOscillator(), gain = context.createGain();
    context.resume(); oscillator.type = 'square'; oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + duration);
  } catch (_) { /* Audio is optional. */ }
}
function playMusicNote() {
  if (!musicEnabled) return;
  try {
    const context = audioContext(), [note, beats] = vltavaTheme[musicIndex++ % vltavaTheme.length], duration = beats * .82;
    const frequency = 440 * 2 ** ((note - 69) / 12), melody = context.createOscillator(), harmony = context.createOscillator(), gain = context.createGain();
    melody.type = 'triangle'; harmony.type = 'sine'; melody.frequency.value = frequency; harmony.frequency.value = frequency / 2;
    gain.gain.setValueAtTime(.035, context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration * .92);
    melody.connect(gain); harmony.connect(gain); gain.connect(context.destination);
    melody.start(); harmony.start(); melody.stop(context.currentTime + duration); harmony.stop(context.currentTime + duration);
    musicTimeout = window.setTimeout(playMusicNote, duration * 1000);
  } catch (_) { musicEnabled = false; updateMusicButton(); }
}
function startMusic() { if (!musicEnabled || musicTimeout) return; try { audioContext().resume(); playMusicNote(); } catch (_) { musicEnabled = false; updateMusicButton(); } }
function stopMusic() { window.clearTimeout(musicTimeout); musicTimeout = undefined; }
function updateMusicButton() { const button = document.getElementById('music'); button.textContent = musicEnabled ? 'MUSIC ON' : 'MUSIC OFF'; button.setAttribute('aria-pressed', String(musicEnabled)); }
function setStatus(text) { statusText.textContent = text; }
function serve(direction) { ball = {x: W / 2, y: H / 2, vx: direction * 360, vy: (Math.random() * 2 - 1) * 160}; serveDelay = .8; }
function send(data) { if (connection?.open) connection.send(data); }
function showOverlay(title, message, button = 'HRÁT SOLO ↗') {
  document.getElementById('title').textContent = title; document.getElementById('message').innerHTML = message; document.getElementById('start').textContent = button; overlay.hidden = false;
}
function prepareRound() {
  scores = [0, 0]; player = computer = remotePlayer = (H - paddleH) / 2; mode = 'playing'; overlay.hidden = true; pauseButton.textContent = 'PAUSE';
  serve(Math.random() < .5 ? -1 : 1); setStatus(opponent === 'friend' ? 'MATCH ON · YOU ARE RED' : 'GAME ON · FIRST TO 7'); startMusic(); beep(440);
}
function start() {
  if (role === 'guest') return;
  prepareRound();
  if (role === 'host') send({type: 'start'});
}
function pause(remote = false) {
  if (role === 'guest' && !remote) { setStatus('THE HOST CONTROLS PAUSE'); return; }
  if (mode !== 'playing' && mode !== 'paused') return;
  mode = mode === 'playing' ? 'paused' : 'playing';
  if (mode === 'paused') showOverlay('INTERMISSION', 'The host paused the match.', 'RESUME MATCH ↗'); else overlay.hidden = true;
  pauseButton.textContent = mode === 'paused' ? 'RESUME' : 'PAUSE'; setStatus(mode === 'paused' ? 'PAUSED' : 'MATCH ON');
  if (role === 'host' && !remote) send({type: 'pause', paused: mode === 'paused'});
}
function finish(side) {
  mode = 'finished'; showOverlay(side === 0 ? 'YOU WIN!' : 'GAME OVER', `${scores[0]} — ${scores[1]} · ${side === 0 ? 'A living room legend is born.' : 'The rematch is yours.'}`, role === 'guest' ? 'WAIT FOR HOST' : 'PLAY AGAIN ↗');
  setStatus('FINAL SCORE · ' + scores.join(' — '));
}
function point(side) {
  scores[side]++; beep(side === 0 ? 660 : 180, .18);
  if (scores[side] >= 7) { finish(side); if (role === 'host') send({type: 'finished', scores, winner: side}); }
  else { serve(side === 0 ? -1 : 1); setStatus(side === 0 ? 'YOUR POINT' : opponent === 'friend' ? 'FRIEND SCORES' : 'COMPUTER SCORES'); }
}
function updateGuest(dt) {
  const move = Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'));
  computer = clamp(computer + move * 540 * dt, 16, H - paddleH - 16);
  send({type: 'move', y: computer});
}
function broadcastState() { send({type: 'state', player, computer, ball: {...ball}, scores: [...scores], serveDelay, mode}); }
function update(dt) {
  if (mode !== 'playing') return;
  if (role === 'guest') { updateGuest(dt); return; }
  const move = Number(keys.has('ArrowDown') || keys.has('s')) - Number(keys.has('ArrowUp') || keys.has('w'));
  player = clamp(player + move * 540 * dt, 16, H - paddleH - 16);
  if (opponent === 'friend') computer = remotePlayer;
  else { const target = ball.vx > 0 ? ball.y - paddleH / 2 : (H - paddleH) / 2; computer = clamp(computer + clamp(target - computer, -275 * dt, 275 * dt), 16, H - paddleH - 16); }
  if (serveDelay > 0) { serveDelay -= dt; return; }
  ball.x += ball.vx * dt; ball.y += ball.vy * dt;
  if (ball.y < 17 || ball.y > H - 17) { ball.y = clamp(ball.y, 17, H - 17); ball.vy *= -1; beep(240); }
  for (const [x, y, direction] of [[40, player, 1], [W - 52, computer, -1]]) {
    if (ball.vx * direction < 0 && ball.x + 7 >= x && ball.x - 7 <= x + paddleW && ball.y + 7 >= y && ball.y - 7 <= y + paddleH) {
      const speed = Math.min(760, Math.hypot(ball.vx, ball.vy) * 1.065), angle = clamp((ball.y - y - paddleH / 2) / (paddleH / 2), -1, 1) * 1.02;
      ball.vx = direction * speed * Math.cos(angle); ball.vy = speed * Math.sin(angle); ball.x = direction === 1 ? x + paddleW + 7 : x - 7; beep(480);
    }
  }
  if (ball.x < -10) point(1); else if (ball.x > W + 10) point(0);
  if (role === 'host') { networkElapsed += dt; if (networkElapsed >= 1 / 30) { networkElapsed = 0; broadcastState(); } }
}
function draw() {
  ctx.fillStyle = '#082754'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = '#f5f8ff88'; ctx.lineWidth = 2; ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.setLineDash([8, 12]); ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 20); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#fff'; ctx.shadowColor = '#69aeff'; ctx.shadowBlur = 12; ctx.font = '56px Courier New'; ctx.textAlign = 'center'; ctx.fillText(String(scores[0]).padStart(2, '0'), W / 2 - 90, 90); ctx.fillText(String(scores[1]).padStart(2, '0'), W / 2 + 90, 90);
  ctx.shadowBlur = 0; ctx.font = '11px Courier New'; ctx.fillStyle = '#d4e8ff'; ctx.fillText(role === 'guest' ? 'FRIEND' : 'YOU', W / 2 - 90, 115); ctx.fillText(opponent === 'friend' && role === 'host' ? 'FRIEND' : 'CPU', W / 2 + 90, 115);
  ctx.fillStyle = '#e31c3d'; ctx.shadowColor = '#ff6880'; ctx.shadowBlur = 12; ctx.fillRect(40, player, paddleW, paddleH); ctx.fillStyle = '#fff'; ctx.shadowColor = '#77b6ff'; ctx.fillRect(W - 52, computer, paddleW, paddleH);
  if (ball) { ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.fillRect(ball.x - 7, ball.y - 7, 14, 14); } ctx.shadowBlur = 0;
}
function frame(time) { const dt = Math.min((time - last) / 1000 || 0, .04); last = time; for (let remaining = dt; remaining > 0; remaining -= 1 / 240) update(Math.min(remaining, 1 / 240)); draw(); requestAnimationFrame(frame); }
function attachConnection(nextConnection) {
  connection = nextConnection;
  connection.on('open', () => { if (role === 'host') { lobby.hidden = true; setStatus('FRIEND CONNECTED · STARTING MATCH'); start(); } else setStatus('CONNECTED · WAITING FOR HOST'); });
  connection.on('data', receiveData);
  connection.on('close', () => { if (mode === 'playing' || mode === 'paused') { mode = 'finished'; showOverlay('FRIEND LEFT', 'The connection has closed. Host another match to play again.'); setStatus('CONNECTION CLOSED'); } });
}
function receiveData(data) {
  if (!data?.type) return;
  if (data.type === 'move' && role === 'host') remotePlayer = clamp(data.y, 16, H - paddleH - 16);
  if (data.type === 'start' && role === 'guest') prepareRound();
  if (data.type === 'state' && role === 'guest') { player = data.player; computer = data.computer; ball = data.ball; scores = data.scores; serveDelay = data.serveDelay; mode = data.mode; }
  if (data.type === 'pause' && role === 'guest') { if ((data.paused && mode === 'playing') || (!data.paused && mode === 'paused')) pause(true); }
  if (data.type === 'finished' && role === 'guest') { scores = data.scores; finish(data.winner); }
}
function peerFailure() { role = undefined; opponent = 'cpu'; lobby.hidden = true; showOverlay('CONNECTION FAILED', 'Could not create the match. Check your connection and try hosting again.'); setStatus('MATCH SERVICE UNAVAILABLE'); }
function makePeer() {
  if (!window.Peer) { peerFailure(); return null; }
  const nextPeer = new window.Peer(); nextPeer.on('error', peerFailure); return nextPeer;
}
function inviteUrl(id) { const url = new URL(location.href); url.searchParams.set('join', id); return url.toString(); }
function showInvite(url) {
  const qr = document.getElementById('qr'); qr.innerHTML = '';
  document.getElementById('invite-link').href = url; document.getElementById('invite-link').textContent = url;
  if (window.QRCode) new window.QRCode(qr, {text: url, width: 210, height: 210, colorDark: '#061c46', colorLight: '#ffffff', correctLevel: window.QRCode.CorrectLevel.M});
  else qr.textContent = 'Copy the link below to invite your friend.';
  lobby.hidden = false;
}
function hostMatch() {
  opponent = 'friend'; role = 'host'; overlay.hidden = true; setStatus('CREATING YOUR MATCH…'); peer = makePeer();
  if (!peer) return;
  peer.on('open', id => { showInvite(inviteUrl(id)); setStatus('SCAN THE CODE TO INVITE A FRIEND'); });
  peer.on('connection', attachConnection);
}
function joinMatch() {
  if (!joinId) return start();
  opponent = 'friend'; role = 'guest'; setStatus('JOINING FRIEND…'); peer = makePeer();
  if (!peer) return;
  peer.on('open', () => attachConnection(peer.connect(joinId, {reliable: true})));
}
function cancelInvite() {
  if (connection) connection.close(); if (peer) peer.destroy(); peer = connection = undefined; role = undefined; opponent = 'cpu'; lobby.hidden = true;
  showOverlay('ČESKÝ TENIS', 'A classic living-room match, in Czech colours.<br>Move your paddle. Keep the ball alive.'); setStatus('READY WHEN YOU ARE · YOU vs COMPUTER');
}
function primaryAction() { if (mode === 'paused') return pause(); if (mode === 'ready' && joinId && !role) return joinMatch(); if (role !== 'guest') start(); }

document.getElementById('start').onclick = primaryAction;
document.getElementById('host').onclick = hostMatch;
pauseButton.onclick = pause;
document.getElementById('reset').onclick = () => role === 'guest' ? setStatus('THE HOST CONTROLS RESET') : start();
document.getElementById('sound').onclick = function () { sound = !sound; this.textContent = sound ? 'SOUND ON' : 'SOUND OFF'; this.setAttribute('aria-pressed', String(sound)); beep(440); };
document.getElementById('music').onclick = function () { musicEnabled = !musicEnabled; if (musicEnabled) startMusic(); else stopMusic(); updateMusicButton(); };
document.getElementById('copy-invite').onclick = async () => { const url = document.getElementById('invite-link').href; try { await navigator.clipboard.writeText(url); setStatus('INVITE LINK COPIED'); } catch (_) { window.prompt('Copy this invite link:', url); } };
document.getElementById('close-invite').onclick = cancelInvite;
window.addEventListener('keydown', e => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (['ArrowUp', 'ArrowDown', ' ', 'w', 's'].includes(key) && e.target.tagName !== 'BUTTON') e.preventDefault(); keys.add(key); if (key === ' ' && !e.repeat && e.target.tagName !== 'BUTTON') { if (mode === 'ready') primaryAction(); else if (mode !== 'finished') pause(); } });
window.addEventListener('keyup', e => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => { keys.clear(); if (mode === 'playing' && role !== 'guest') pause(); });
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); movePointer(e); }); canvas.addEventListener('pointermove', movePointer);
function movePointer(e) { if (mode === 'playing' && role !== 'guest') { const rect = canvas.getBoundingClientRect(); player = clamp((e.clientY - rect.top) * H / rect.height - paddleH / 2, 16, H - paddleH - 16); } }
if (joinId) { showOverlay('JOIN A FRIEND', 'You will control the white paddle.<br>Press JOIN when you are ready.', 'JOIN MATCH ↗'); document.getElementById('host').hidden = true; }
serve(1); requestAnimationFrame(frame);
