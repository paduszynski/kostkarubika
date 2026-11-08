// Kostka: cube model, validation and a two-phase (Kociemba) solver.
// Used directly by the page (validation, geometry) and from a Web Worker (solving).
//
// Facelets: 54 letters in the order U R F D L B, each face read row by row
// (U seen from above with F at the bottom, D seen from below with F at the top,
// side faces seen from the front with U on top).
(function (root) {
  'use strict';

  const FACES = 'URFDLB';

  // ---------- geometry: every sticker is (position, normal); x right, y down, z towards the viewer ----------
  const NORMALS = { U: [0, -1, 0], R: [1, 0, 0], F: [0, 0, 1], D: [0, 1, 0], L: [-1, 0, 0], B: [0, 0, -1] };
  function stickerPos(face, r, c) {
    switch (face) {
      case 'U': return [c - 1, -1, r - 1];
      case 'R': return [1, r - 1, 1 - c];
      case 'F': return [c - 1, r - 1, 1];
      case 'D': return [c - 1, 1, 1 - r];
      case 'L': return [-1, r - 1, c - 1];
      case 'B': return [1 - c, r - 1, -1];
    }
  }
  const STICKERS = [];          // index -> {pos, n}
  const STICKER_AT = {};        // "x,y,z,nx,ny,nz" -> index
  for (let f = 0; f < 6; f++) for (let k = 0; k < 9; k++) {
    const face = FACES[f], pos = stickerPos(face, (k / 3) | 0, k % 3), n = NORMALS[face];
    STICKERS.push({ pos, n });
    STICKER_AT[pos.concat(n).join(',')] = f * 9 + k;
  }

  // Each move is a quarter turn of one layer: axis (0=x,1=y,2=z), layer value, and the sign of the angle
  // for rotation matrices in this coordinate system (checked: R sends F stickers to U).
  const MOVE_AXIS = { U: [1, -1, -1], R: [0, 1, 1], F: [2, 1, 1], D: [1, 1, 1], L: [0, -1, -1], B: [2, -1, -1] };

  function rotMatrix(axis, ang) {
    const c = Math.cos(ang), s = Math.sin(ang);
    if (axis === 0) return [[1, 0, 0], [0, c, -s], [0, s, c]];
    if (axis === 1) return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }
  function mulVec(m, v) { return [0, 1, 2].map(i => m[i][0] * v[0] + m[i][1] * v[1] + m[i][2] * v[2]); }
  function roundVec(v) { return v.map(x => Math.round(x) + 0); }

  // permutation for a quarter turn: newFacelets[to] = old[from]
  const QUARTER = {};
  for (const face of FACES) {
    const [axis, layer, sign] = MOVE_AXIS[face];
    const m = rotMatrix(axis, sign * Math.PI / 2);
    const perm = new Array(54);
    for (let i = 0; i < 54; i++) {
      const s = STICKERS[i];
      if (s.pos[axis] !== layer) { perm[i] = i; continue; }
      const to = STICKER_AT[roundVec(mulVec(m, s.pos)).concat(roundVec(mulVec(m, s.n))).join(',')];
      perm[to] = i;
    }
    QUARTER[face] = perm;
  }

  function parseMoves(str) {
    return (str || '').trim().split(/\s+/).filter(Boolean).map(t => {
      const face = t[0], suf = t.slice(1);
      return { face, turns: suf === '2' ? 2 : suf === "'" ? 3 : 1, name: t };
    });
  }
  function applyMoves(facelets, moves) {
    let a = facelets.split('');
    for (const mv of (typeof moves === 'string' ? parseMoves(moves) : moves)) {
      for (let t = 0; t < mv.turns; t++) {
        const p = QUARTER[mv.face], b = new Array(54);
        for (let i = 0; i < 54; i++) b[i] = a[p[i]];
        a = b;
      }
    }
    return a.join('');
  }
  const SOLVED = FACES.split('').map(f => f.repeat(9)).join('');

  function randomScramble(n) {
    const out = [];
    let last = -1;
    while (out.length < (n || 25)) {
      const f = (Math.random() * 6) | 0;
      if (f === last || (f % 3 === last % 3 && f < last)) continue;
      out.push(FACES[f] + ['', '2', "'"][(Math.random() * 3) | 0]);
      last = f;
    }
    return out.join(' ');
  }

  // ---------- cubie level (Kociemba numbering) ----------
  // corners URF UFL ULB UBR DFR DLF DBL DRB; edges UR UF UL UB DR DF DL DB FR FL BL BR
  const CORNER_FACELET = [[8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11], [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51]];
  const CORNER_COLOR = ['URF', 'UFL', 'ULB', 'UBR', 'DFR', 'DLF', 'DBL', 'DRB'];
  const EDGE_FACELET = [[5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25], [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14]];
  const EDGE_COLOR = ['UR', 'UF', 'UL', 'UB', 'DR', 'DF', 'DL', 'DB', 'FR', 'FL', 'BL', 'BR'];

  // Checks a facelet string. Returns {ok:true, cube} or {ok:false, code, cells?, ...}.
  function check(facelets) {
    if (typeof facelets !== 'string' || facelets.length !== 54) return { ok: false, code: 'length' };
    const empty = [];
    for (let i = 0; i < 54; i++) if (FACES.indexOf(facelets[i]) < 0) empty.push(i);
    if (empty.length) return { ok: false, code: 'empty', cells: empty, count: empty.length };
    for (let f = 0; f < 6; f++) if (facelets[f * 9 + 4] !== FACES[f]) return { ok: false, code: 'centers' };
    const counts = {};
    for (const ch of facelets) counts[ch] = (counts[ch] || 0) + 1;
    const bad = FACES.split('').filter(f => counts[f] !== 9);
    if (bad.length) return { ok: false, code: 'counts', counts };

    const cp = [], co = [], ep = [], eo = [];
    for (let i = 0; i < 8; i++) {
      const fl = CORNER_FACELET[i];
      let ori = 0;
      while (ori < 3 && facelets[fl[ori]] !== 'U' && facelets[fl[ori]] !== 'D') ori++;
      if (ori === 3) return { ok: false, code: 'corner', cells: fl.slice() };
      const c1 = facelets[fl[(ori + 1) % 3]], c2 = facelets[fl[(ori + 2) % 3]];
      const j = CORNER_COLOR.findIndex(cc => cc[1] === c1 && cc[2] === c2 && (cc[0] === facelets[fl[ori]]));
      if (j < 0) return { ok: false, code: 'corner', cells: fl.slice() };
      cp[i] = j; co[i] = ori;
    }
    for (let i = 0; i < 12; i++) {
      const fl = EDGE_FACELET[i], a = facelets[fl[0]], b = facelets[fl[1]];
      let j = EDGE_COLOR.findIndex(ec => ec[0] === a && ec[1] === b);
      if (j >= 0) { ep[i] = j; eo[i] = 0; continue; }
      j = EDGE_COLOR.findIndex(ec => ec[0] === b && ec[1] === a);
      if (j < 0) return { ok: false, code: 'edge', cells: fl.slice() };
      ep[i] = j; eo[i] = 1;
    }
    // every piece exactly once
    const seenC = new Array(8).fill(-1), seenE = new Array(12).fill(-1);
    for (let i = 0; i < 8; i++) {
      if (seenC[cp[i]] >= 0) return { ok: false, code: 'dupCorner', cells: CORNER_FACELET[i].concat(CORNER_FACELET[seenC[cp[i]]]) };
      seenC[cp[i]] = i;
    }
    for (let i = 0; i < 12; i++) {
      if (seenE[ep[i]] >= 0) return { ok: false, code: 'dupEdge', cells: EDGE_FACELET[i].concat(EDGE_FACELET[seenE[ep[i]]]) };
      seenE[ep[i]] = i;
    }
    if (co.reduce((a, b) => a + b, 0) % 3) return { ok: false, code: 'twist' };
    if (eo.reduce((a, b) => a + b, 0) % 2) return { ok: false, code: 'flip' };
    if (parity(cp) !== parity(ep)) return { ok: false, code: 'parity' };
    return { ok: true, cube: { cp, co, ep, eo } };
  }
  function parity(p) {
    let s = 0;
    for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[j] < p[i]) s++;
    return s & 1;
  }

  // ---------- two-phase solver ----------
  const BASIC = [
    { cp: [3, 0, 1, 2, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // U
    { cp: [4, 1, 2, 0, 7, 5, 6, 3], co: [2, 0, 0, 1, 1, 0, 0, 2], ep: [8, 1, 2, 3, 11, 5, 6, 7, 4, 9, 10, 0], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // R
    { cp: [1, 5, 2, 3, 0, 4, 6, 7], co: [1, 2, 0, 0, 2, 1, 0, 0], ep: [0, 9, 2, 3, 4, 8, 6, 7, 1, 5, 10, 11], eo: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0] }, // F
    { cp: [0, 1, 2, 3, 5, 6, 7, 4], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // D
    { cp: [0, 2, 6, 3, 4, 1, 5, 7], co: [0, 1, 2, 0, 0, 2, 1, 0], ep: [0, 1, 10, 3, 4, 5, 9, 7, 8, 2, 6, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }, // L
    { cp: [0, 1, 3, 7, 4, 5, 2, 6], co: [0, 0, 1, 2, 0, 0, 2, 1], ep: [0, 1, 2, 11, 4, 5, 6, 10, 8, 9, 3, 7], eo: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1] }  // B
  ];
  function solvedCubie() {
    return { cp: [0, 1, 2, 3, 4, 5, 6, 7], co: [0, 0, 0, 0, 0, 0, 0, 0], ep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], eo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
  }
  function multiply(a, b) {
    const r = { cp: [], co: [], ep: [], eo: [] };
    for (let i = 0; i < 8; i++) { r.cp[i] = a.cp[b.cp[i]]; r.co[i] = (a.co[b.cp[i]] + b.co[i]) % 3; }
    for (let i = 0; i < 12; i++) { r.ep[i] = a.ep[b.ep[i]]; r.eo[i] = (a.eo[b.ep[i]] + b.eo[i]) % 2; }
    return r;
  }
  const MOVES18 = [];   // index 3*face + (power-1)
  for (let f = 0; f < 6; f++) {
    let c = BASIC[f];
    for (let p = 0; p < 3; p++) { MOVES18.push(c); c = multiply(c, BASIC[f]); }
  }
  const P2_MOVES = [0, 1, 2, 4, 7, 9, 10, 11, 13, 16]; // U U2 U' R2 F2 D D2 D' L2 B2

  const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320];
  function permRank(a) {
    let r = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      let c = 0;
      for (let j = i + 1; j < n; j++) if (a[j] < a[i]) c++;
      r += c * FACT[n - 1 - i];
    }
    return r;
  }
  function permUnrank(r, n) {
    const left = [];
    for (let i = 0; i < n; i++) left.push(i);
    const out = [];
    for (let i = 0; i < n; i++) {
      const f = FACT[n - 1 - i], d = (r / f) | 0;
      r %= f;
      out.push(left.splice(d, 1)[0]);
    }
    return out;
  }

  // coordinates
  const getTwist = c => { let t = 0; for (let i = 0; i < 7; i++) t = t * 3 + c.co[i]; return t; };
  const getFlip = c => { let t = 0; for (let i = 0; i < 11; i++) t = t * 2 + c.eo[i]; return t; };
  function getSlice(c) {
    let a = 0, x = 0;
    for (let j = 11; j >= 0; j--) if (c.ep[j] >= 8) { a += binom(11 - j, x + 1); x++; }
    return a;
  }
  function binom(n, k) {
    if (k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return Math.round(r);
  }
  const getCornerPerm = c => permRank(c.cp);
  const getEdge8Perm = c => permRank(c.ep.slice(0, 8));
  const getSlicePerm = c => permRank(c.ep.slice(8).map(e => e - 8));

  function setTwist(t) {
    const c = solvedCubie(); let s = 0;
    for (let i = 6; i >= 0; i--) { c.co[i] = t % 3; s += c.co[i]; t = (t / 3) | 0; }
    c.co[7] = (3 - s % 3) % 3; return c;
  }
  function setFlip(t) {
    const c = solvedCubie(); let s = 0;
    for (let i = 10; i >= 0; i--) { c.eo[i] = t & 1; s += c.eo[i]; t >>= 1; }
    c.eo[11] = s & 1; return c;
  }
  const SLICE_SETS = [];
  (function () {
    for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) for (let d = c + 1; d < 12; d++) {
      const cub = solvedCubie(), pos = [a, b, c, d];
      let k = 0, o = 0;
      for (let i = 0; i < 12; i++) cub.ep[i] = pos.indexOf(i) >= 0 ? 8 + k++ : o++;
      SLICE_SETS[getSlice(cub)] = cub.ep.slice();
    }
  })();
  function setSlice(s) { const c = solvedCubie(); c.ep = SLICE_SETS[s].slice(); return c; }
  function setCornerPerm(r) { const c = solvedCubie(); c.cp = permUnrank(r, 8); return c; }
  function setEdge8Perm(r) { const c = solvedCubie(); c.ep = permUnrank(r, 8).concat([8, 9, 10, 11]); return c; }
  function setSlicePerm(r) { const c = solvedCubie(); c.ep = [0, 1, 2, 3, 4, 5, 6, 7].concat(permUnrank(r, 4).map(e => e + 8)); return c; }

  function moveTable(n, set, get, moves) {
    const t = new Uint16Array(n * 18);
    for (let x = 0; x < n; x++) {
      const c = set(x);
      for (const m of moves) t[x * 18 + m] = get(multiply(c, MOVES18[m]));
    }
    return t;
  }
  function pruneTable(n1, n2, t1, t2, moves) {
    const size = n1 * n2, tab = new Int8Array(size).fill(-1), queue = new Int32Array(size);
    let head = 0, tail = 0;
    tab[0] = 0; queue[tail++] = 0;
    while (head < tail) {
      const idx = queue[head++], a = (idx / n2) | 0, b = idx % n2, d = tab[idx] + 1;
      for (const m of moves) {
        const j = t1[a * 18 + m] * n2 + t2[b * 18 + m];
        if (tab[j] < 0) { tab[j] = d; queue[tail++] = j; }
      }
    }
    return tab;
  }

  let T = null;
  function init() {
    if (T) return;
    const ALL = []; for (let i = 0; i < 18; i++) ALL.push(i);
    const twistM = moveTable(2187, setTwist, getTwist, ALL);
    const flipM = moveTable(2048, setFlip, getFlip, ALL);
    const sliceM = moveTable(495, setSlice, getSlice, ALL);
    const cpM = moveTable(40320, setCornerPerm, getCornerPerm, P2_MOVES);
    const e8M = moveTable(40320, setEdge8Perm, getEdge8Perm, P2_MOVES);
    const spM = moveTable(24, setSlicePerm, getSlicePerm, P2_MOVES);
    T = {
      twistM, flipM, sliceM, cpM, e8M, spM,
      pTwistSlice: pruneTable(2187, 495, twistM, sliceM, ALL),
      pFlipSlice: pruneTable(2048, 495, flipM, sliceM, ALL),
      pCpSp: pruneTable(40320, 24, cpM, spM, P2_MOVES),
      pE8Sp: pruneTable(40320, 24, e8M, spM, P2_MOVES)
    };
  }

  // allowed after the previous face: never the same face, and opposite faces only in one order
  const okAfter = (f, last) => last < 0 || (f !== last && !(f % 3 === last % 3 && f < last));

  function solveCubie(cube, opts) {
    init();
    const maxTime = (opts && opts.time) || 1500, t0 = Date.now();
    const path = new Int8Array(40);
    let best = null, maxTotal = 30, phase1Len = 0, nodes = 0;
    const timeUp = () => (++nodes & 1023) === 0 && Date.now() - t0 > maxTime && best;

    function phase2(cp, e8, sp, depth, n, lastF) {
      if (depth === 0) return cp === 0 && e8 === 0 && sp === 0;
      for (const m of P2_MOVES) {
        const f = (m / 3) | 0;
        if (!okAfter(f, lastF)) continue;
        const ncp = T.cpM[cp * 18 + m], ne8 = T.e8M[e8 * 18 + m], nsp = T.spM[sp * 18 + m];
        if (Math.max(T.pCpSp[ncp * 24 + nsp], T.pE8Sp[ne8 * 24 + nsp]) >= depth) continue;
        path[n] = m;
        if (phase2(ncp, ne8, nsp, depth - 1, n + 1, f)) return true;
      }
      return false;
    }
    function startPhase2(n) {
      let c = cube;
      for (let i = 0; i < n; i++) c = multiply(c, MOVES18[path[i]]);
      const cp = getCornerPerm(c), e8 = getEdge8Perm(c), sp = getSlicePerm(c);
      const h = Math.max(T.pCpSp[cp * 24 + sp], T.pE8Sp[e8 * 24 + sp]);
      const lastF = n ? (path[n - 1] / 3) | 0 : -1;
      for (let d = h; d <= Math.min(maxTotal - n, 18); d++) {
        if (phase2(cp, e8, sp, d, n, lastF)) {
          best = Array.from(path.slice(0, n + d));
          maxTotal = n + d - 1;
          return true;
        }
      }
      return false;
    }
    function phase1(tw, fl, sl, depth, n, lastF) {
      if (timeUp()) throw 'time';
      if (depth === 0) {
        // skip phase-1 endings that are already phase-2 moves (a shorter phase 1 covers them)
        if (n > 0) { const m = path[n - 1]; if (P2_MOVES.indexOf(m) >= 0) return; }
        startPhase2(n);
        return;
      }
      for (let m = 0; m < 18; m++) {
        const f = (m / 3) | 0;
        if (!okAfter(f, lastF)) continue;
        const ntw = T.twistM[tw * 18 + m], nfl = T.flipM[fl * 18 + m], nsl = T.sliceM[sl * 18 + m];
        if (Math.max(T.pTwistSlice[ntw * 495 + nsl], T.pFlipSlice[nfl * 495 + nsl]) >= depth) continue;
        path[n] = m;
        phase1(ntw, nfl, nsl, depth - 1, n + 1, f);
        if (n + depth - 1 > maxTotal) return;
      }
    }

    const tw = getTwist(cube), fl = getFlip(cube), sl = getSlice(cube);
    try {
      for (phase1Len = 0; phase1Len <= 12 && phase1Len <= maxTotal; phase1Len++) {
        const h = Math.max(T.pTwistSlice[tw * 495 + sl], T.pFlipSlice[fl * 495 + sl]);
        if (h > phase1Len) continue;
        phase1(tw, fl, sl, phase1Len, 0, -1);
      }
    } catch (e) { if (e !== 'time') throw e; }
    if (!best) return null;
    return best.map(m => FACES[(m / 3) | 0] + ['', '2', "'"][m % 3]).join(' ');
  }

  function solve(facelets, opts) {
    const r = check(facelets);
    if (!r.ok) return { error: r };
    if (facelets === SOLVED) return { moves: '' };
    const moves = solveCubie(r.cube, opts);
    if (moves === null) return { error: { code: 'nosolution' } };
    if (applyMoves(facelets, moves) !== SOLVED) return { error: { code: 'internal' } };
    return { moves };
  }

  const api = {
    FACES, SOLVED, STICKERS, STICKER_AT, MOVE_AXIS, CORNER_FACELET, EDGE_FACELET,
    rotMatrix, parseMoves, applyMoves, randomScramble, check, solve, init
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KostkaSolver = api;

  // running as a worker: answer {id, facelets} with {id, moves} or {id, error}
  if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
    root.onmessage = e => {
      const { id, type, facelets } = e.data || {};
      try {
        if (type === 'init') { init(); root.postMessage({ id, ready: true }); return; }
        root.postMessage(Object.assign({ id }, solve(facelets)));
      } catch (err) {
        root.postMessage({ id, error: { code: 'internal', message: String(err) } });
      }
    };
  }
})(typeof self !== 'undefined' ? self : this);
