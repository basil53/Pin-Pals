import { useState, useEffect, useRef } from "react";
import { loadPlayers, loadSessions, savePlayer as dbSavePlayer, saveSession as dbSaveSession } from "./supabase.js";

// ─── Bowling logic ─────────────────────────────────────────────────────────────
function calcScore(frames) {
  let total = 0;
  const rolls = [];
  frames.forEach(f => {
    if (f.roll1 !== null && f.roll1 !== undefined) rolls.push(f.roll1);
    if (f.roll2 !== null && f.roll2 !== undefined) rolls.push(f.roll2);
    if (f.roll3 !== null && f.roll3 !== undefined) rolls.push(f.roll3);
  });
  let ri = 0;
  for (let fi = 0; fi < 10 && fi < frames.length; fi++) {
    const f = frames[fi];
    if (f.roll1 === null || f.roll1 === undefined) break;
    if (fi < 9) {
      if (f.roll1 === 10) { total += 10 + (rolls[ri+1]??0) + (rolls[ri+2]??0); ri += 1; }
      else if ((f.roll1 + (f.roll2??0)) === 10) { total += 10 + (rolls[ri+2]??0); ri += 2; }
      else { total += (f.roll1??0) + (f.roll2??0); ri += 2; }
    } else { total += (f.roll1??0) + (f.roll2??0) + (f.roll3??0); }
  }
  return total;
}

function frameRunningScores(frames) {
  const scores = [];
  const rolls = [];
  frames.forEach(f => {
    if (f.roll1 !== null && f.roll1 !== undefined) rolls.push(f.roll1);
    if (f.roll2 !== null && f.roll2 !== undefined) rolls.push(f.roll2);
    if (f.roll3 !== null && f.roll3 !== undefined) rolls.push(f.roll3);
  });
  let total = 0, ri = 0;
  for (let fi = 0; fi < 10 && fi < frames.length; fi++) {
    const f = frames[fi];
    if (f.roll1 === null || f.roll1 === undefined) { scores.push(null); continue; }
    if (fi < 9) {
      if (f.roll1 === 10) {
        if (rolls[ri+1]===undefined||rolls[ri+2]===undefined){scores.push(null);ri+=1;continue;}
        total += 10+rolls[ri+1]+rolls[ri+2]; ri += 1;
      } else if (f.roll2===null||f.roll2===undefined){scores.push(null);ri+=1;continue;}
      else if (f.roll1+f.roll2===10) {
        if(rolls[ri+2]===undefined){scores.push(null);ri+=2;continue;}
        total+=10+rolls[ri+2]; ri+=2;
      } else { total+=f.roll1+f.roll2; ri+=2; }
    } else {
      if(f.roll2===null||f.roll2===undefined){scores.push(null);continue;}
      if((f.roll1===10||f.roll1+f.roll2===10)&&(f.roll3===null||f.roll3===undefined)){scores.push(null);continue;}
      total+=(f.roll1??0)+(f.roll2??0)+(f.roll3??0);
    }
    scores.push(total);
  }
  return scores;
}

function isStrike(f) { return f.roll1 === 10; }
function isSpare(f, fi) { return fi < 9 && f.roll1 !== 10 && f.roll2 !== null && f.roll2 !== undefined && f.roll1 + f.roll2 === 10; }

// Work out what the next roll to enter is for a set of frames
function nextRollInfo(frames) {
  for (let fi = 0; fi < 10; fi++) {
    const f = frames[fi];
    if (fi < 9) {
      if (f.roll1 === null) return { fi, roll: 1 };
      if (f.roll1 !== 10 && f.roll2 === null) return { fi, roll: 2 };
    } else {
      if (f.roll1 === null) return { fi, roll: 1 };
      if (f.roll2 === null) return { fi, roll: 2 };
      if ((f.roll1 === 10 || f.roll1 + f.roll2 === 10) && f.roll3 === null) return { fi, roll: 3 };
    }
  }
  return null; // game complete
}

function maxPinsForRoll(frames, fi, roll) {
  const f = frames[fi];
  if (fi < 9) return roll === 2 ? 10 - (f.roll1 ?? 0) : 10;
  if (roll === 1) return 10;
  if (roll === 2) return f.roll1 === 10 ? 10 : 10 - (f.roll1 ?? 0);
  if (roll === 3) {
    if (f.roll1 === 10 && f.roll2 === 10) return 10;
    if (f.roll1 === 10) return 10 - (f.roll2 ?? 0);
    return 10;
  }
  return 10;
}

function enterRoll(frames, fi, roll, val) {
  const nf = frames.map(f => ({ ...f }));
  if (roll === 1) nf[fi].roll1 = val;
  else if (roll === 2) nf[fi].roll2 = val;
  else nf[fi].roll3 = val;
  return nf;
}

function calcStats(sessions, playerId) {
  const mine = sessions.filter(s => s.playerId === playerId && s.frames);
  if (!mine.length) return null;
  let totalGames=0,totalScore=0,highGame=0,strikes=0,spares=0,totalFrames=0,opens=0,perfectGames=0,gutter=0,totalFirstBall=0,firstBallCount=0;
  mine.forEach(s => {
    const score = calcScore(s.frames);
    totalGames++; totalScore+=score;
    if(score>highGame) highGame=score;
    if(score===300) perfectGames++;
    s.frames.forEach((f,fi)=>{
      if(f.roll1===null||f.roll1===undefined) return;
      totalFrames++; totalFirstBall+=f.roll1; firstBallCount++;
      if(f.roll1===0) gutter++;
      if(isStrike(f)) strikes++;
      else if(isSpare(f,fi)) spares++;
      else if(fi<9) opens++;
    });
  });
  return {
    totalGames, average: Math.round(totalScore/totalGames), highGame, perfectGames,
    strikePercent: totalFrames?Math.round((strikes/totalFrames)*100):0,
    sparePercent: (totalFrames-strikes)>0?Math.round((spares/(totalFrames-strikes))*100):0,
    openPercent: totalFrames?Math.round((opens/totalFrames)*100):0,
    avgFirstBall: firstBallCount?(totalFirstBall/firstBallCount).toFixed(1):0,
    gutterBalls: gutter, strikes, spares,
  };
}

function emptyFrames() {
  return Array.from({length:10},(_,i)=>({roll1:null,roll2:null,roll3:i===9?null:undefined}));
}
function uid() { return Math.random().toString(36).slice(2,10); }

// Player colour palette — each player in a group game gets a distinct accent
const PLAYER_COLORS = ["#e8a84a","#2a8fc8","#3ab07a","#e85d26","#8b5cf6","#e84040"];

const C = {
  navy:"#0d1b2a", navyMid:"#152236", navyLight:"#1e3352",
  amber:"#c8882a", amberLight:"#e8a84a",
  pin:"#f0ede6", pinDim:"#b8b4aa",
  strike:"#e85d26", spare:"#2a8fc8",
  green:"#3ab07a", red:"#e84040", purple:"#8b5cf6",
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:${C.navy};color:${C.pin};font-family:'Inter',sans-serif;min-height:100vh;}
  .app{max-width:900px;margin:0 auto;padding:0 16px 80px;}
  .header{padding:28px 0 20px;border-bottom:1px solid ${C.navyLight};margin-bottom:28px;display:flex;align-items:center;gap:16px;}
  .header-pins{display:flex;gap:3px;align-items:flex-end;}
  .pin-icon{width:10px;background:${C.pin};border-radius:3px 3px 5px 5px;}
  .header-title{font-family:'Bebas Neue',sans-serif;font-size:36px;letter-spacing:2px;color:${C.pin};line-height:1;}
  .header-sub{font-size:12px;color:${C.pinDim};letter-spacing:1px;text-transform:uppercase;margin-top:2px;}
  .nav{display:flex;gap:4px;margin-bottom:28px;background:${C.navyMid};border-radius:10px;padding:4px;}
  .nav-btn{flex:1;padding:10px 8px;border:none;border-radius:7px;cursor:pointer;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;background:transparent;color:${C.pinDim};transition:all 0.2s;letter-spacing:0.3px;}
  .nav-btn.active{background:${C.amber};color:${C.navy};}
  .nav-btn:hover:not(.active){color:${C.pin};background:${C.navyLight};}
  .card{background:${C.navyMid};border-radius:12px;padding:20px;margin-bottom:16px;border:1px solid ${C.navyLight};}
  .card-title{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;color:${C.amberLight};margin-bottom:16px;}
  .field{margin-bottom:14px;}
  .label{display:block;font-size:11px;font-weight:600;color:${C.pinDim};letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;}
  .input{width:100%;padding:10px 14px;border-radius:8px;background:${C.navyLight};border:1px solid rgba(200,136,42,0.2);color:${C.pin};font-family:'Inter',sans-serif;font-size:14px;outline:none;transition:border-color 0.2s;}
  .input:focus{border-color:${C.amber};}
  .input-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .btn{padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;transition:all 0.18s;letter-spacing:0.3px;}
  .btn-primary{background:${C.amber};color:${C.navy};}
  .btn-primary:hover{background:${C.amberLight};}
  .btn-primary:disabled{opacity:0.4;cursor:default;}
  .btn-ghost{background:transparent;color:${C.pinDim};border:1px solid ${C.navyLight};}
  .btn-ghost:hover{color:${C.pin};border-color:${C.pin};}
  .btn-purple{background:${C.purple};color:white;}
  .btn-purple:hover{background:#7c3aed;}
  .btn-sm{padding:6px 14px;font-size:12px;}
  .btn-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;}
  .player-card{background:${C.navyMid};border-radius:12px;padding:18px 20px;margin-bottom:12px;border:1px solid ${C.navyLight};display:flex;align-items:center;gap:16px;cursor:pointer;transition:border-color 0.2s;}
  .player-card:hover{border-color:${C.amber};}
  .player-avatar{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,${C.amber},${C.navyLight});display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:22px;color:${C.navy};flex-shrink:0;}
  .player-info{flex:1;min-width:0;}
  .player-nick{font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:1px;color:${C.pin};}
  .player-fullname{font-size:12px;color:${C.pinDim};}
  .player-stat-row{display:flex;gap:16px;margin-top:6px;flex-wrap:wrap;}
  .player-stat{font-size:12px;color:${C.pinDim};}
  .player-stat span{color:${C.amberLight};font-weight:600;font-family:'JetBrains Mono',monospace;}
  .stats-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-bottom:16px;}
  .stat-box{background:${C.navyLight};border-radius:10px;padding:14px;text-align:center;}
  .stat-val{font-family:'JetBrains Mono',sans-serif;font-size:28px;font-weight:600;color:${C.amberLight};line-height:1;}
  .stat-lbl{font-size:10px;color:${C.pinDim};text-transform:uppercase;letter-spacing:0.8px;margin-top:4px;}
  .stat-strike .stat-val{color:${C.strike};}
  .stat-spare .stat-val{color:${C.spare};}
  .stat-green .stat-val{color:${C.green};}
  .scorecard{overflow-x:auto;}
  .scorecard-table{border-collapse:collapse;min-width:560px;width:100%;}
  .scorecard-table th{font-family:'Bebas Neue',sans-serif;font-size:14px;letter-spacing:1px;color:${C.pinDim};text-align:center;padding:4px 2px;font-weight:400;}
  .frame-cell{border:1px solid ${C.navyLight};text-align:center;vertical-align:top;min-width:52px;position:relative;background:${C.navyMid};}
  .frame-rolls{display:flex;justify-content:flex-end;gap:2px;padding:4px 4px 2px;min-height:26px;align-items:center;}
  .roll-badge{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;font-family:'JetBrains Mono',monospace;}
  .roll-strike{background:${C.strike};color:white;}
  .roll-spare{background:${C.spare};color:white;}
  .roll-gutter{background:${C.navyLight};color:${C.pinDim};}
  .roll-normal{background:${C.navyLight};color:${C.pin};}
  .frame-score{font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;color:${C.pin};padding:3px 4px 5px;text-align:center;min-height:24px;border-top:1px solid ${C.navyLight};}
  .frame-score.strike-frame{color:${C.strike};}
  .frame-score.spare-frame{color:${C.spare};}
  .sc-player-label{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;padding:8px 0 4px;}
  .keypad{display:grid;grid-template-columns:repeat(6,1fr);gap:6px;margin:14px 0;}
  .key-btn{padding:12px 4px;border-radius:8px;border:1px solid ${C.navyLight};background:${C.navyLight};color:${C.pin};cursor:pointer;font-family:'JetBrains Mono',monospace;font-size:15px;font-weight:600;transition:all 0.15s;}
  .key-btn:hover{border-color:${C.amber};color:${C.amber};}
  .key-btn.key-strike{border-color:${C.strike};color:${C.strike};}
  .session-row{display:flex;align-items:center;gap:12px;padding:14px 18px;background:${C.navyMid};border-radius:10px;margin-bottom:8px;border:1px solid ${C.navyLight};cursor:pointer;transition:border-color 0.2s;}
  .session-row:hover{border-color:${C.amber};}
  .session-score{font-family:'JetBrains Mono',monospace;font-size:32px;font-weight:700;color:${C.amberLight};min-width:50px;text-align:center;}
  .session-meta{flex:1;}
  .session-date{font-size:13px;color:${C.pin};font-weight:500;}
  .session-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px;}
  .badge{font-size:10px;font-weight:700;padding:2px 7px;border-radius:20px;letter-spacing:0.4px;}
  .badge-strike{background:rgba(232,93,38,0.18);color:${C.strike};}
  .badge-spare{background:rgba(42,143,200,0.18);color:${C.spare};}
  .badge-perfect{background:rgba(200,136,42,0.25);color:${C.amberLight};}
  .badge-scan{background:rgba(139,92,246,0.2);color:${C.purple};}
  .toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${C.green};color:white;padding:10px 22px;border-radius:30px;font-weight:600;font-size:14px;z-index:999;pointer-events:none;animation:fadeup 0.3s ease;}
  @keyframes fadeup{from{opacity:0;transform:translateX(-50%) translateY(12px);}to{opacity:1;transform:translateX(-50%) translateY(0);}}
  .empty{text-align:center;color:${C.pinDim};padding:40px 0;font-size:14px;}
  .empty-icon{font-size:40px;margin-bottom:8px;}
  .section-title{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;color:${C.pinDim};margin-bottom:14px;text-transform:uppercase;}
  .back-btn{display:inline-flex;align-items:center;gap:6px;margin-bottom:20px;background:none;border:none;color:${C.amber};cursor:pointer;font-family:'Inter',sans-serif;font-size:13px;font-weight:600;padding:0;}
  .back-btn:hover{color:${C.amberLight};}
  .progress-bar{height:6px;border-radius:3px;background:${C.navyLight};overflow:hidden;margin-top:4px;}
  .progress-fill{height:100%;border-radius:3px;transition:width 0.4s ease;}
  .method-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px;}
  .method-card{border-radius:12px;padding:20px;border:2px solid ${C.navyLight};cursor:pointer;transition:all 0.2s;text-align:center;background:${C.navyLight};}
  .method-card:hover{border-color:${C.amber};}
  .method-icon{font-size:32px;margin-bottom:8px;}
  .method-label{font-family:'Bebas Neue',sans-serif;font-size:18px;letter-spacing:1px;}
  .method-desc{font-size:11px;color:${C.pinDim};margin-top:4px;line-height:1.4;}
  .upload-area{border:2px dashed ${C.purple};border-radius:12px;padding:32px;text-align:center;cursor:pointer;transition:all 0.2s;background:rgba(139,92,246,0.05);}
  .upload-area:hover{background:rgba(139,92,246,0.1);}
  .upload-preview{width:100%;max-height:200px;object-fit:contain;border-radius:8px;margin-bottom:12px;}
  .scan-status{padding:12px 16px;border-radius:8px;font-size:13px;margin-bottom:12px;}
  .scan-loading{background:rgba(139,92,246,0.15);color:${C.purple};border:1px solid rgba(139,92,246,0.3);}
  .scan-success{background:rgba(58,176,122,0.15);color:${C.green};border:1px solid rgba(58,176,122,0.3);}
  .scan-error{background:rgba(232,64,64,0.15);color:${C.red};border:1px solid rgba(232,64,64,0.3);}
  .frame-editor{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0;}
  .frame-edit-box{background:${C.navyLight};border-radius:8px;padding:10px;min-width:80px;text-align:center;}
  .frame-edit-num{font-size:10px;color:${C.pinDim};font-weight:600;letter-spacing:0.5px;margin-bottom:6px;}
  .frame-edit-rolls{display:flex;gap:4px;justify-content:center;}
  .roll-mini-input{width:28px;height:28px;border-radius:6px;background:${C.navy};border:1px solid ${C.navyLight};color:${C.pin};text-align:center;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;outline:none;padding:0;}
  .roll-mini-input:focus{border-color:${C.amber};}
  .spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(255,255,255,0.3);border-top-color:white;border-radius:50%;animation:spin 0.7s linear infinite;vertical-align:middle;margin-right:8px;}
  @keyframes spin{to{transform:rotate(360deg);}}

  /* ── Multi-player game styles ── */
  .player-selector{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;}
  .player-select-chip{display:flex;align-items:center;gap:6px;padding:6px 12px 6px 6px;border-radius:30px;border:2px solid ${C.navyLight};background:${C.navyLight};cursor:pointer;transition:all 0.2s;font-size:13px;font-weight:600;color:${C.pinDim};}
  .player-select-chip.selected{color:${C.navy};}
  .player-select-chip:hover{border-color:${C.amber};}
  .chip-avatar{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',sans-serif;font-size:11px;color:${C.navy};font-weight:700;}

  .multi-scorecards{display:flex;flex-direction:column;gap:12px;margin-bottom:16px;}
  .multi-scorecard-row{border-radius:12px;padding:14px 16px;border:2px solid ${C.navyLight};cursor:pointer;transition:all 0.2s;background:${C.navyMid};}
  .multi-scorecard-row.active-player{background:rgba(255,255,255,0.04);}
  .multi-scorecard-header{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
  .multi-player-name{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1px;}
  .multi-score-badge{font-family:'JetBrains Mono',monospace;font-size:20px;font-weight:700;margin-left:auto;}
  .multi-roll-hint{font-size:11px;color:${C.pinDim};margin-left:4px;margin-top:2px;}
  .active-indicator{width:8px;height:8px;border-radius:50%;flex-shrink:0;animation:pulse 1.2s ease-in-out infinite;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}

  .keypad-section{background:${C.navyMid};border-radius:12px;padding:16px;border:1px solid ${C.navyLight};margin-bottom:12px;}
  .keypad-label{font-size:11px;color:${C.pinDim};text-transform:uppercase;letter-spacing:0.8px;font-weight:600;margin-bottom:10px;}

  .game-complete-banner{background:linear-gradient(135deg,rgba(200,136,42,0.2),rgba(58,176,122,0.1));border:1px solid ${C.amber};border-radius:12px;padding:20px;text-align:center;margin-bottom:16px;}
  .podium{display:flex;justify-content:center;align-items:flex-end;gap:8px;margin-top:16px;}
  .podium-slot{display:flex;flex-direction:column;align-items:center;gap:4px;}
  .podium-name{font-family:'Bebas Neue',sans-serif;font-size:16px;letter-spacing:1px;}
  .podium-score{font-family:'JetBrains Mono',monospace;font-size:22px;font-weight:700;}
  .podium-block{border-radius:6px 6px 0 0;width:64px;display:flex;align-items:center;justify-content:center;font-size:18px;}

  @media(max-width:480px){
    .input-row{grid-template-columns:1fr;}
    .stats-grid{grid-template-columns:repeat(2,1fr);}
    .header-title{font-size:28px;}
    .keypad{grid-template-columns:repeat(4,1fr);}
    .method-grid{grid-template-columns:1fr;}
  }
`;

// ─── Sub-components ────────────────────────────────────────────────────────────
function RollBadge({ value, prevValue, isLast10 }) {
  if (value === null || value === undefined) return null;
  if (value === 10 && !isLast10) return <div className="roll-badge roll-strike">X</div>;
  if (isLast10 && value === 10) return <div className="roll-badge roll-strike">X</div>;
  if (!isLast10 && prevValue !== null && prevValue !== undefined && prevValue + value === 10)
    return <div className="roll-badge roll-spare">/</div>;
  if (value === 0) return <div className="roll-badge roll-gutter">-</div>;
  return <div className="roll-badge roll-normal">{value}</div>;
}

function ScorecardDisplay({ frames, nickname, color }) {
  const running = frameRunningScores(frames);
  return (
    <div className="scorecard">
      {nickname && <div className="sc-player-label" style={{color: color || C.amberLight}}>{nickname}</div>}
      <table className="scorecard-table">
        <thead><tr>{frames.map((_,i)=><th key={i} colSpan={i===9?3:2}>{i+1}</th>)}</tr></thead>
        <tbody><tr>{frames.map((f,fi)=>(
          <td key={fi} className="frame-cell" colSpan={fi===9?3:2}>
            <div className="frame-rolls">
              {fi<9
                ? (<><RollBadge value={f.roll1}/><RollBadge value={f.roll2} prevValue={f.roll1}/></>)
                : (<><RollBadge value={f.roll1} isLast10/><RollBadge value={f.roll2} prevValue={f.roll1===10?null:f.roll1} isLast10/>{f.roll3!==undefined&&<RollBadge value={f.roll3} isLast10/>}</>)
              }
            </div>
            <div className={`frame-score${isStrike(f)?" strike-frame":isSpare(f,fi)?" spare-frame":""}`}>
              {running[fi]??""}
            </div>
          </td>
        ))}</tr></tbody>
      </table>
    </div>
  );
}

// ─── Multi-player game (live + photo/manual past entry) ───────────────────────
function MultiPlayerGame({ gamePlayers, gameDate, gameVenue, onComplete, mode }) {
  // mode: 'live' | 'past'
  const [framesMap, setFramesMap] = useState(() => {
    const m = {};
    gamePlayers.forEach(p => { m[p.id] = emptyFrames(); });
    return m;
  });
  const [activePlayerId, setActivePlayerId] = useState(gamePlayers[0]?.id);

  // Past-entry state — one player at a time through photo/manual
  const [pastStep, setPastStep] = useState(0); // which player index we're entering
  const [pastMethod, setPastMethod] = useState(null); // null | 'photo' | 'manual'
  const [pastScanned, setPastScanned] = useState(false);
  const [pastScanNotes, setPastScanNotes] = useState("");

  // ── LIVE mode logic ──
  const activeFrames = framesMap[activePlayerId];
  const rollInfo = activeFrames ? nextRollInfo(activeFrames) : null;
  const max = rollInfo ? maxPinsForRoll(activeFrames, rollInfo.fi, rollInfo.roll) : 0;
  const keys = Array.from({length: max + 1}, (_, i) => i);
  const allDone = gamePlayers.every(p => nextRollInfo(framesMap[p.id]) === null);

  const handleKey = (val) => {
    if (!rollInfo) return;
    const newFrames = enterRoll(activeFrames, rollInfo.fi, rollInfo.roll, val);
    const newMap = { ...framesMap, [activePlayerId]: newFrames };
    setFramesMap(newMap);
    if (!nextRollInfo(newFrames)) {
      const next = gamePlayers.find(p => p.id !== activePlayerId && nextRollInfo(newMap[p.id]) !== null);
      if (next) setActivePlayerId(next.id);
    }
  };

  // ── PAST mode logic ──
  const pastPlayer = gamePlayers[pastStep];
  const pastColor = pastPlayer ? PLAYER_COLORS[pastStep % PLAYER_COLORS.length] : C.amber;
  const pastFrames = pastPlayer ? framesMap[pastPlayer.id] : null;
  const allPastDone = pastStep >= gamePlayers.length;

  const confirmPastPlayer = () => {
    setPastStep(s => s + 1);
    setPastMethod(null);
    setPastScanned(false);
    setPastScanNotes("");
  };

  const updatePastFrames = (frames) => {
    setFramesMap(m => ({ ...m, [pastPlayer.id]: frames }));
  };

  const Podium = () => (
    <div className="game-complete-banner">
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:2,color:C.amberLight}}>🎳 Game Over!</div>
      <div className="podium" style={{marginTop:16}}>
        {[...gamePlayers].sort((a,b)=>calcScore(framesMap[b.id])-calcScore(framesMap[a.id])).map((p,rank)=>{
          const color=PLAYER_COLORS[gamePlayers.findIndex(x=>x.id===p.id)%PLAYER_COLORS.length];
          const score=calcScore(framesMap[p.id]);
          const heights=[64,48,36,28];
          return (
            <div key={p.id} className="podium-slot">
              <div className="podium-name" style={{color}}>{p.nickname}</div>
              <div className="podium-score" style={{color}}>{score}</div>
              <div className="podium-block" style={{background:color,height:heights[rank]||24}}>
                {rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":""}
              </div>
            </div>
          );
        })}
      </div>
      <button className="btn btn-primary" style={{marginTop:20}} onClick={()=>onComplete(framesMap)}>
        Save All Games
      </button>
    </div>
  );

  // ── PAST entry UI ──
  if (mode === "past") {
    if (allPastDone) return <Podium/>;
    return (
      <div>
        {/* Progress bar across players */}
        <div style={{display:"flex",gap:6,marginBottom:16,alignItems:"center"}}>
          {gamePlayers.map((p,i)=>{
            const color=PLAYER_COLORS[i%PLAYER_COLORS.length];
            const done=i<pastStep;
            const active=i===pastStep;
            return (
              <div key={p.id} style={{flex:1,textAlign:"center"}}>
                <div style={{height:4,borderRadius:2,background:done||active?color:C.navyLight,marginBottom:4,opacity:done?0.5:1}}/>
                <div style={{fontSize:10,color:active?color:done?C.green:C.pinDim,fontWeight:600}}>{done?"✓":p.nickname}</div>
              </div>
            );
          })}
        </div>

        {/* Current player entry */}
        <div className="card" style={{borderColor:pastColor}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
            <div className="player-avatar" style={{background:`linear-gradient(135deg,${pastColor},${C.navyLight})`,width:40,height:40,fontSize:16}}>
              {pastPlayer.nickname.slice(0,2).toUpperCase()}
            </div>
            <div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,letterSpacing:1,color:pastColor}}>{pastPlayer.nickname}</div>
              <div style={{fontSize:11,color:C.pinDim}}>Player {pastStep+1} of {gamePlayers.length}</div>
            </div>
          </div>

          {!pastMethod && (
            <>
              <div className="label" style={{marginBottom:10}}>How would you like to enter {pastPlayer.nickname}'s score?</div>
              <div className="method-grid">
                <div className="method-card" onClick={()=>setPastMethod("photo")}>
                  <div className="method-icon">📸</div>
                  <div className="method-label" style={{color:C.purple}}>Photo Scan</div>
                  <div className="method-desc">AI reads the scorecard from a photo</div>
                </div>
                <div className="method-card" onClick={()=>setPastMethod("manual")}>
                  <div className="method-icon">✎</div>
                  <div className="method-label" style={{color:C.pinDim}}>Manual Entry</div>
                  <div className="method-desc">Type in each frame directly</div>
                </div>
              </div>
            </>
          )}

          {pastMethod==="photo" && (
            <div>
              <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>{setPastMethod(null);setPastScanned(false);}}>← Change method</button>
              <PhotoScanner onFramesScanned={(frames,notes)=>{updatePastFrames(frames);setPastScanNotes(notes||"");setPastScanned(true);}}/>
              {pastScanned && (
                <div style={{marginTop:16}}>
                  {pastScanNotes&&<div style={{fontSize:12,color:C.pinDim,marginBottom:10,padding:"8px 12px",background:C.navyLight,borderRadius:8}}>ℹ️ {pastScanNotes}</div>}
                  <div style={{fontSize:12,color:C.pinDim,marginBottom:8,fontWeight:600}}>Review & correct if needed:</div>
                  <ManualFrameEditor frames={pastFrames} setFrames={updatePastFrames}/>
                  <ScorecardDisplay frames={pastFrames} color={pastColor}/>
                  <div style={{marginTop:14}}>
                    <button className="btn btn-primary" onClick={confirmPastPlayer}>
                      {pastStep<gamePlayers.length-1?`Next: ${gamePlayers[pastStep+1]?.nickname} →`:"Review & Save →"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {pastMethod==="manual" && (
            <div>
              <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setPastMethod(null)}>← Change method</button>
              <ManualFrameEditor frames={pastFrames} setFrames={updatePastFrames}/>
              <div style={{marginTop:14}}>
                <button className="btn btn-primary" onClick={confirmPastPlayer}>
                  {pastStep<gamePlayers.length-1?`Next: ${gamePlayers[pastStep+1]?.nickname} →`:"Review & Save →"}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview of already-entered players */}
        {pastStep > 0 && (
          <div>
            <div className="section-title" style={{marginTop:8}}>Entered so far</div>
            {gamePlayers.slice(0,pastStep).map((p,i)=>{
              const color=PLAYER_COLORS[i%PLAYER_COLORS.length];
              return (
                <div key={p.id} className="multi-scorecard-row" style={{borderColor:color,marginBottom:8}}>
                  <div className="multi-scorecard-header">
                    <div className="multi-player-name" style={{color}}>{p.nickname}</div>
                    <div style={{fontSize:11,color:C.green,marginLeft:4}}>✓ Done</div>
                    <div className="multi-score-badge" style={{color}}>{calcScore(framesMap[p.id])}</div>
                  </div>
                  <ScorecardDisplay frames={framesMap[p.id]} color={color}/>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── LIVE mode UI ──
  return (
    <div>
      <div className="multi-scorecards">
        {gamePlayers.map((p, pi) => {
          const color = PLAYER_COLORS[pi % PLAYER_COLORS.length];
          const frames = framesMap[p.id];
          const score = calcScore(frames);
          const pRollInfo = nextRollInfo(frames);
          const isActive = p.id === activePlayerId;
          const isDone = !pRollInfo;
          return (
            <div key={p.id}
              className={`multi-scorecard-row${isActive?" active-player":""}`}
              style={{borderColor:isActive?color:C.navyLight,cursor:isDone?"default":"pointer"}}
              onClick={()=>!isDone&&setActivePlayerId(p.id)}>
              <div className="multi-scorecard-header">
                {isActive&&!isDone&&<div className="active-indicator" style={{background:color}}/>}
                <div className="multi-player-name" style={{color}}>{p.nickname}</div>
                {pRollInfo&&isActive&&<div className="multi-roll-hint">Frame {pRollInfo.fi+1} · Roll {pRollInfo.roll}</div>}
                {isDone&&<div style={{fontSize:11,color:C.green,marginLeft:4}}>✓ Done</div>}
                <div className="multi-score-badge" style={{color}}>{score}</div>
              </div>
              <ScorecardDisplay frames={frames} color={color}/>
            </div>
          );
        })}
      </div>

      {!allDone && rollInfo && (
        <div className="keypad-section" style={{borderColor:PLAYER_COLORS[gamePlayers.findIndex(p=>p.id===activePlayerId)%PLAYER_COLORS.length]}}>
          <div className="keypad-label">
            {gamePlayers.find(p=>p.id===activePlayerId)?.nickname} — Frame {rollInfo.fi+1}, Roll {rollInfo.roll}
          </div>
          <div className="keypad">
            {keys.map(k=>(
              <button key={k} className={`key-btn${k===10?" key-strike":""}`} onClick={()=>handleKey(k)}>
                {k===10?"X":k===0?"-":k}
              </button>
            ))}
          </div>
          {gamePlayers.length>1&&(
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
              <div style={{fontSize:11,color:C.pinDim,width:"100%",marginBottom:4}}>Switch to:</div>
              {gamePlayers.filter(p=>p.id!==activePlayerId&&nextRollInfo(framesMap[p.id])!==null).map((p)=>{
                const origIdx=gamePlayers.findIndex(x=>x.id===p.id);
                const color=PLAYER_COLORS[origIdx%PLAYER_COLORS.length];
                return (
                  <button key={p.id} onClick={()=>setActivePlayerId(p.id)}
                    style={{padding:"5px 12px",borderRadius:20,border:`1px solid ${color}`,background:"transparent",color,cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"Inter,sans-serif"}}>
                    {p.nickname}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {allDone && <Podium/>}
    </div>
  );
}

// ─── Photo scanner ─────────────────────────────────────────────────────────────
function PhotoScanner({ onFramesScanned }) {
  const [image, setImage] = useState(null);
  const [imageB64, setImageB64] = useState(null);
  const [status, setStatus] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileRef = useRef();

  const processFile = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => { setImage(e.target.result); setImageB64(e.target.result.split(",")[1]); setStatus(null); };
    reader.readAsDataURL(file);
  };

  const scanImage = async () => {
    if (!imageB64) return;
    setStatus("loading");
    try {
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6", max_tokens: 1000,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB64 } },
            { type: "text", text: `Read this bowling scorecard. Return ONLY JSON, no other text:
{"frames":[{"roll1":<n>,"roll2":<n_or_null>,"roll3":<n_or_null>},...10 frames],"confidence":"high"|"medium"|"low","notes":"<issues>"}
Strike frames 1-9: roll1=10, roll2=null. Always 10 frames.` }
          ]}]
        })
      });
      const data = await resp.json();
      const text = data.content?.map(b=>b.text||"").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g,"").trim());
      const frames = parsed.frames.map((f,i)=>({ roll1:f.roll1??null, roll2:f.roll2??null, roll3:i===9?(f.roll3??null):undefined }));
      setStatus("success");
      onFramesScanned(frames, parsed.notes);
    } catch { setStatus("error"); setErrorMsg("Couldn't read the scorecard — try a clearer photo or enter manually."); }
  };

  return (
    <div>
      {!image ? (
        <div className="upload-area" onClick={()=>fileRef.current.click()}
          onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();processFile(e.dataTransfer.files[0]);}}>
          <div style={{fontSize:40,marginBottom:8}}>📸</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:20,letterSpacing:1,color:C.purple}}>Drop a photo here</div>
          <div style={{fontSize:12,color:C.pinDim,marginTop:6}}>or tap to choose from your camera roll</div>
          <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>processFile(e.target.files[0])}/>
        </div>
      ) : (
        <div>
          <img src={image} alt="Scorecard" className="upload-preview"/>
          {status==="loading"&&<div className="scan-status scan-loading"><span className="spinner"/>Reading your scorecard…</div>}
          {status==="success"&&<div className="scan-status scan-success">✓ Scorecard read — review the frames below</div>}
          {status==="error"&&<div className="scan-status scan-error">✗ {errorMsg}</div>}
          <div className="btn-row">
            {status!=="loading"&&<button className="btn btn-purple" onClick={scanImage}>{status==="success"?"Re-scan":"🔍 Scan Scorecard"}</button>}
            <button className="btn btn-ghost btn-sm" onClick={()=>{setImage(null);setImageB64(null);setStatus(null);}}>Change photo</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ManualFrameEditor({ frames, setFrames }) {
  const updateRoll = (fi, roll, raw) => {
    const val = raw===""||raw==="-"?null:raw.toUpperCase()==="X"?10:parseInt(raw);
    if(val!==null&&(isNaN(val)||val<0||val>10)) return;
    const nf=frames.map(f=>({...f})); nf[fi][roll]=val; setFrames(nf);
  };
  return (
    <div>
      <div style={{fontSize:12,color:C.pinDim,marginBottom:10}}>Type <strong style={{color:C.strike}}>X</strong> or <strong style={{color:C.strike}}>10</strong> for a strike.</div>
      <div className="frame-editor">
        {frames.map((f,fi)=>(
          <div key={fi} className="frame-edit-box">
            <div className="frame-edit-num">F{fi+1}</div>
            <div className="frame-edit-rolls">
              <input className="roll-mini-input" value={f.roll1===null?"":f.roll1===10?"X":f.roll1} onChange={e=>updateRoll(fi,"roll1",e.target.value)} placeholder="·"/>
              {(fi<9&&f.roll1!==10)||fi===9?(<input className="roll-mini-input" value={f.roll2===null?"":f.roll2===10?"X":f.roll2} onChange={e=>updateRoll(fi,"roll2",e.target.value)} placeholder="·"/>):null}
              {fi===9&&(<input className="roll-mini-input" value={f.roll3===null?"":f.roll3===10?"X":f.roll3} onChange={e=>updateRoll(fi,"roll3",e.target.value)} placeholder="·"/>)}
            </div>
          </div>
        ))}
      </div>
      <ScorecardDisplay frames={frames}/>
    </div>
  );
}

// ─── Single-player live scoring (unchanged) ────────────────────────────────────
function ScoringInput({ frames, setFrames, onComplete }) {
  const rollInfo = nextRollInfo(frames);
  const done = !rollInfo;
  const max = rollInfo ? maxPinsForRoll(frames, rollInfo.fi, rollInfo.roll) : 0;
  const keys = Array.from({length: max+1}, (_,i)=>i);

  const handleKey = (val) => {
    if (!rollInfo) return;
    const nf = enterRoll(frames, rollInfo.fi, rollInfo.roll, val);
    setFrames(nf);
    if (!nextRollInfo(nf)) setTimeout(()=>onComplete(nf), 300);
  };

  return (
    <div>
      <ScorecardDisplay frames={frames}/>
      {!done ? (
        <>
          <div style={{marginTop:14,marginBottom:6,fontSize:12,color:C.pinDim,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600}}>
            Frame {rollInfo.fi+1} · Roll {rollInfo.roll}
          </div>
          <div className="keypad">
            {keys.map(k=>(
              <button key={k} className={`key-btn${k===10?" key-strike":""}`} onClick={()=>handleKey(k)}>
                {k===10?"X":k===0?"-":k}
              </button>
            ))}
          </div>
        </>
      ):(
        <div style={{marginTop:16,textAlign:"center",color:C.green,fontWeight:700,fontSize:15}}>
          🎳 Game complete! Final score: {calcScore(frames)}
        </div>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("players");
  const [players, setPlayers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [view, setView] = useState(null);

  useEffect(()=>{
    Promise.all([loadPlayers(), loadSessions()]).then(([rawPlayers, sessions])=>{
      const normPlayers = rawPlayers.map(p=>({ id:p.id, firstName:p.first_name, lastName:p.last_name, nickname:p.nickname, location:p.location, createdAt:p.created_at }));
      setPlayers(normPlayers); setSessions(sessions); setLoading(false);
    });
  },[]);

  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(""),2800); };

  // ── New player ──
  const [newPlayer, setNewPlayer] = useState({firstName:"",lastName:"",nickname:"",location:""});
  const handleCreatePlayer = async () => {
    if(!newPlayer.firstName.trim()||!newPlayer.nickname.trim()) return;
    const p={id:uid(),...newPlayer,createdAt:Date.now()};
    await dbSavePlayer(p); setPlayers(prev=>[...prev,p]);
    setNewPlayer({firstName:"",lastName:"",nickname:"",location:""}); setView(null);
    showToast(`${p.nickname} added to Pin Pals!`);
  };

  // ── New game state ──
  const [gameFrames, setGameFrames] = useState(emptyFrames());
  const [gamePlayer, setGamePlayer] = useState(null);
  const [gamePlayers, setGamePlayers] = useState([]); // multi-player
  const [gameDate, setGameDate] = useState(new Date().toISOString().slice(0,10));
  const [gameVenue, setGameVenue] = useState("");
  const [entryMethod, setEntryMethod] = useState(null);
  const [gameMode, setGameMode] = useState(null); // 'solo' | 'group'
  const [scanNotes, setScanNotes] = useState("");
  const [scannedImage, setScannedImage] = useState(false);

  const startGame = (player) => {
    setGamePlayer(player); setGameFrames(emptyFrames());
    setGameDate(new Date().toISOString().slice(0,10)); setGameVenue("");
    setEntryMethod(null); setGameMode(null); setScanNotes(""); setScannedImage(false);
    setGamePlayers([player]);
    setView({type:"new-game"});
  };

  const handleGameComplete = async (frames, source="live") => {
    const session = { id:uid(), playerId:gamePlayer.id, frames, score:calcScore(frames), date:gameDate, venue:gameVenue, source, createdAt:Date.now() };
    await dbSaveSession(session); setSessions(prev=>[...prev,session]);
    showToast(`Game saved — ${session.score} pins!`);
    setView({type:"player",data:gamePlayer});
  };

  const handleMultiGameComplete = async (framesMap) => {
    const saved = [];
    for (const p of gamePlayers) {
      const frames = framesMap[p.id];
      const session = { id:uid(), playerId:p.id, frames, score:calcScore(frames), date:gameDate, venue:gameVenue, source:"live", createdAt:Date.now() };
      await dbSaveSession(session);
      saved.push(session);
    }
    setSessions(prev=>[...prev,...saved]);
    showToast(`${gamePlayers.length} games saved! 🎳`);
    setView(null);
  };

  const playerSessions = (pid) => sessions.filter(s=>s.playerId===pid).sort((a,b)=>b.createdAt-a.createdAt);

  if(loading) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",color:C.pinDim,fontFamily:"Inter,sans-serif",gap:12}}>
      <div style={{fontSize:36}}>🎳</div>
      <div style={{fontSize:14}}>Loading Pin Pals…</div>
    </div>
  );

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <div className="header">
          <div className="header-pins">{[22,34,22].map((h,i)=><div key={i} className="pin-icon" style={{height:h}}/>)}</div>
          <div>
            <div className="header-title">Pin Pals</div>
            <div className="header-sub">Bowling Tracker</div>
          </div>
        </div>

        {/* ── PLAYER PROFILE ── */}
        {view?.type==="player"&&(()=>{
          const p=players.find(x=>x.id===view.data.id)||view.data;
          const ps=playerSessions(p.id);
          const stats=calcStats(sessions,p.id);
          return (
            <div>
              <button className="back-btn" onClick={()=>setView(null)}>← Back to players</button>
              <div className="card">
                <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
                  <div className="player-avatar">{p.nickname.slice(0,2).toUpperCase()}</div>
                  <div>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:28,letterSpacing:1,color:C.pin}}>{p.nickname}</div>
                    <div style={{fontSize:13,color:C.pinDim}}>{p.firstName} {p.lastName}</div>
                    {p.location&&<div style={{fontSize:11,color:C.pinDim,marginTop:2}}>📍 {p.location}</div>}
                  </div>
                </div>
                <div className="btn-row">
                  <button className="btn btn-primary btn-sm" onClick={()=>startGame(p)}>+ Add Game</button>
                </div>
              </div>
              {stats?(
                <div className="card">
                  <div className="card-title">Lifetime Stats</div>
                  <div className="stats-grid">
                    <div className="stat-box"><div className="stat-val">{stats.average}</div><div className="stat-lbl">Average</div></div>
                    <div className="stat-box"><div className="stat-val">{stats.highGame}</div><div className="stat-lbl">High Game</div></div>
                    <div className="stat-box"><div className="stat-val">{stats.totalGames}</div><div className="stat-lbl">Games</div></div>
                    <div className="stat-box stat-strike"><div className="stat-val">{stats.strikePercent}%</div><div className="stat-lbl">Strike Rate</div></div>
                    <div className="stat-box stat-spare"><div className="stat-val">{stats.sparePercent}%</div><div className="stat-lbl">Spare Conv.</div></div>
                    <div className="stat-box"><div className="stat-val">{stats.avgFirstBall}</div><div className="stat-lbl">Avg 1st Ball</div></div>
                    <div className="stat-box stat-strike"><div className="stat-val">{stats.strikes}</div><div className="stat-lbl">Total Strikes</div></div>
                    <div className="stat-box stat-spare"><div className="stat-val">{stats.spares}</div><div className="stat-lbl">Total Spares</div></div>
                    {stats.perfectGames>0&&<div className="stat-box stat-green"><div className="stat-val">{stats.perfectGames}</div><div className="stat-lbl">Perfect 300s</div></div>}
                    <div className="stat-box"><div className="stat-val">{stats.openPercent}%</div><div className="stat-lbl">Open Frames</div></div>
                    <div className="stat-box"><div className="stat-val">{stats.gutterBalls}</div><div className="stat-lbl">Gutter Balls</div></div>
                  </div>
                </div>
              ):(
                <div className="card"><div style={{color:C.pinDim,fontSize:13}}>No games yet — hit <strong style={{color:C.amber}}>Add Game</strong> to get started.</div></div>
              )}
              <div className="section-title">Game History</div>
              {ps.length===0&&<div className="empty"><div className="empty-icon">🎳</div>No games recorded yet</div>}
              {ps.map(s=>{
                const stk=s.frames.filter(f=>isStrike(f)).length;
                const spr=s.frames.filter((f,fi)=>isSpare(f,fi)).length;
                return (
                  <div key={s.id} className="session-row" onClick={()=>setView({type:"session",data:s})}>
                    <div className="session-score">{s.score}</div>
                    <div className="session-meta">
                      <div className="session-date">{s.date}{s.venue?` · ${s.venue}`:""}</div>
                      <div className="session-badges">
                        {stk>0&&<span className="badge badge-strike">⚡ {stk} strikes</span>}
                        {spr>0&&<span className="badge badge-spare">✓ {spr} spares</span>}
                        {s.score===300&&<span className="badge badge-perfect">★ PERFECT</span>}
                        {s.source==="photo"&&<span className="badge badge-scan">📸 Scanned</span>}
                      </div>
                    </div>
                    <div style={{color:C.pinDim,fontSize:20}}>›</div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── SESSION DETAIL ── */}
        {view?.type==="session"&&(()=>{
          const s=view.data;
          const p=players.find(x=>x.id===s.playerId);
          return (
            <div>
              <button className="back-btn" onClick={()=>p?setView({type:"player",data:p}):setView(null)}>← Back</button>
              <div className="card">
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:11,color:C.pinDim,textTransform:"uppercase",letterSpacing:"0.8px",fontWeight:600,marginBottom:4}}>
                    {s.date}{s.venue?` · ${s.venue}`:""}
                    {s.source==="photo"&&<span style={{marginLeft:8,color:C.purple}}>📸 Photo scan</span>}
                  </div>
                  <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:40,fontWeight:700,color:C.amberLight}}>{s.score}</div>
                </div>
                <ScorecardDisplay frames={s.frames} nickname={p?.nickname}/>
              </div>
            </div>
          );
        })()}

        {/* ── NEW GAME ── */}
        {view?.type==="new-game"&&(
          <div>
            <button className="back-btn" onClick={()=>setView(null)}>← Cancel</button>
            <div className="card">
              <div className="card-title">New Game</div>

              {/* Date & venue */}
              <div className="input-row" style={{marginBottom:14}}>
                <div className="field">
                  <label className="label">Date</label>
                  <input className="input" type="date" value={gameDate} onChange={e=>setGameDate(e.target.value)}/>
                </div>
                <div className="field">
                  <label className="label">Venue (optional)</label>
                  <input className="input" type="text" placeholder="e.g. Lucky Strike" value={gameVenue} onChange={e=>setGameVenue(e.target.value)}/>
                </div>
              </div>

              {/* Step 1: solo or group — only show if no game mode chosen yet */}
              {!gameMode && (
                <>
                  <div className="label" style={{marginBottom:10}}>Game type</div>
                  <div className="method-grid" style={{marginBottom:20}}>
                    <div className="method-card" onClick={()=>setGameMode("solo")}>
                      <div className="method-icon">🎳</div>
                      <div className="method-label" style={{color:C.amberLight}}>Solo Game</div>
                      <div className="method-desc">Just you — score one game</div>
                    </div>
                    <div className="method-card" onClick={()=>setGameMode("group")}>
                      <div className="method-icon">👥</div>
                      <div className="method-label" style={{color:C.spare}}>Group Game</div>
                      <div className="method-desc">2–6 players, all scorecards on screen</div>
                    </div>
                  </div>
                </>
              )}

              {/* Group: player picker */}
              {gameMode==="group" && !entryMethod && (
                <div>
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setGameMode(null)}>← Change type</button>
                  <div className="label" style={{marginBottom:8}}>Select players (tap to add/remove)</div>
                  <div className="player-selector" style={{marginBottom:16}}>
                    {players.map((p, pi) => {
                      const selected = gamePlayers.some(x=>x.id===p.id);
                      const color = selected ? PLAYER_COLORS[gamePlayers.findIndex(x=>x.id===p.id) % PLAYER_COLORS.length] : C.pinDim;
                      return (
                        <div key={p.id}
                          className={`player-select-chip${selected?" selected":""}`}
                          style={selected ? {borderColor:color, background:color+"22", color} : {}}
                          onClick={()=>{
                            if(selected) setGamePlayers(prev=>prev.filter(x=>x.id!==p.id));
                            else if(gamePlayers.length < 6) setGamePlayers(prev=>[...prev,p]);
                          }}>
                          <div className="chip-avatar" style={{background:color+"33",color}}>{p.nickname.slice(0,2).toUpperCase()}</div>
                          {p.nickname}
                          {selected && <span style={{marginLeft:2}}>✓</span>}
                        </div>
                      );
                    })}
                  </div>
                  {gamePlayers.length < 2 && <div style={{fontSize:12,color:C.pinDim,marginBottom:12}}>Select at least 2 players to start a group game.</div>}
                  {gamePlayers.length >= 2 && (
                    <div>
                      <div className="label" style={{marginBottom:10}}>Game type</div>
                      <div className="method-grid">
                        <div className="method-card" onClick={()=>setEntryMethod("multi-live")}>
                          <div className="method-icon">🎳</div>
                          <div className="method-label" style={{color:C.amberLight}}>Live Game</div>
                          <div className="method-desc">Score as you bowl — all cards on screen</div>
                        </div>
                        <div className="method-card" onClick={()=>setEntryMethod("multi-past")}>
                          <div className="method-icon">📸</div>
                          <div className="method-label" style={{color:C.purple}}>Past Game</div>
                          <div className="method-desc">Scan or enter each player's scorecard from a past game</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Solo: method picker */}
              {gameMode==="solo" && !entryMethod && (
                <div>
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setGameMode(null)}>← Change type</button>
                  <div className="label" style={{marginBottom:10}}>How would you like to enter this game?</div>
                  <div className="method-grid">
                    <div className="method-card" onClick={()=>setEntryMethod("live")}>
                      <div className="method-icon">🎳</div>
                      <div className="method-label" style={{color:C.amberLight}}>Live Scoring</div>
                      <div className="method-desc">Enter each roll as you bowl</div>
                    </div>
                    <div className="method-card" onClick={()=>setEntryMethod("photo")}>
                      <div className="method-icon">📸</div>
                      <div className="method-label" style={{color:C.purple}}>Photo Scan</div>
                      <div className="method-desc">AI reads a photo of your scorecard</div>
                    </div>
                    <div className="method-card" onClick={()=>setEntryMethod("manual")} style={{gridColumn:"1/-1"}}>
                      <div className="method-icon">✎</div>
                      <div className="method-label" style={{color:C.pinDim}}>Manual Entry</div>
                      <div className="method-desc">Type in each frame directly</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Multi-player live game */}
              {entryMethod==="multi-live" && (
                <div>
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setEntryMethod(null)}>← Back</button>
                  <MultiPlayerGame
                    gamePlayers={gamePlayers}
                    gameDate={gameDate}
                    gameVenue={gameVenue}
                    onComplete={handleMultiGameComplete}
                    mode="live"
                  />
                </div>
              )}

              {/* Multi-player past game (photo/manual per player) */}
              {entryMethod==="multi-past" && (
                <div>
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setEntryMethod(null)}>← Back</button>
                  <MultiPlayerGame
                    gamePlayers={gamePlayers}
                    gameDate={gameDate}
                    gameVenue={gameVenue}
                    onComplete={handleMultiGameComplete}
                    mode="past"
                  />
                </div>
              )}

              {/* Solo live */}
              {entryMethod==="live" && (
                <div>
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setEntryMethod(null)}>← Change method</button>
                  <ScoringInput frames={gameFrames} setFrames={setGameFrames} onComplete={(f)=>handleGameComplete(f,"live")}/>
                </div>
              )}

              {/* Photo scan */}
              {entryMethod==="photo" && (
                <div>
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setEntryMethod(null)}>← Change method</button>
                  <PhotoScanner onFramesScanned={(f,n)=>{setGameFrames(f);setScanNotes(n||"");setScannedImage(true);}}/>
                  {scannedImage && (
                    <div style={{marginTop:16}}>
                      {scanNotes&&<div style={{fontSize:12,color:C.pinDim,marginBottom:10,padding:"8px 12px",background:C.navyLight,borderRadius:8}}>ℹ️ {scanNotes}</div>}
                      <div style={{fontSize:12,color:C.pinDim,marginBottom:8,fontWeight:600}}>Review & correct if needed:</div>
                      <ManualFrameEditor frames={gameFrames} setFrames={setGameFrames}/>
                      <div className="btn-row" style={{marginTop:14}}>
                        <button className="btn btn-primary" onClick={()=>handleGameComplete(gameFrames,"photo")}>Save Game</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Manual */}
              {entryMethod==="manual" && (
                <div>
                  <button className="btn btn-ghost btn-sm" style={{marginBottom:14}} onClick={()=>setEntryMethod(null)}>← Change method</button>
                  <ManualFrameEditor frames={gameFrames} setFrames={setGameFrames}/>
                  <div className="btn-row" style={{marginTop:14}}>
                    <button className="btn btn-primary" onClick={()=>handleGameComplete(gameFrames,"manual")}>Save Game</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── NEW PLAYER ── */}
        {view?.type==="new-player"&&(
          <div>
            <button className="back-btn" onClick={()=>setView(null)}>← Cancel</button>
            <div className="card">
              <div className="card-title">Create Profile</div>
              <div className="input-row">
                <div className="field">
                  <label className="label">First Name</label>
                  <input className="input" placeholder="e.g. Nicholas" value={newPlayer.firstName} onChange={e=>setNewPlayer(p=>({...p,firstName:e.target.value}))}/>
                </div>
                <div className="field">
                  <label className="label">Last Name</label>
                  <input className="input" placeholder="e.g. Bayly" value={newPlayer.lastName} onChange={e=>setNewPlayer(p=>({...p,lastName:e.target.value}))}/>
                </div>
              </div>
              <div className="field">
                <label className="label">Nickname — shown on scorecards</label>
                <input className="input" placeholder='e.g. "Nicky" or "Spare Me"' value={newPlayer.nickname} onChange={e=>setNewPlayer(p=>({...p,nickname:e.target.value}))}/>
              </div>
              <div className="field">
                <label className="label">Location (optional)</label>
                <input className="input" placeholder="e.g. London, UK" value={newPlayer.location} onChange={e=>setNewPlayer(p=>({...p,location:e.target.value}))}/>
              </div>
              <button className="btn btn-primary" onClick={handleCreatePlayer} disabled={!newPlayer.firstName.trim()||!newPlayer.nickname.trim()}>
                Create Profile
              </button>
            </div>
          </div>
        )}

        {/* ── MAIN TABS ── */}
        {!view&&(
          <>
            <div className="nav">
              <button className={`nav-btn${tab==="players"?" active":""}`} onClick={()=>setTab("players")}>Players</button>
              <button className={`nav-btn${tab==="leaderboard"?" active":""}`} onClick={()=>setTab("leaderboard")}>Leaderboard</button>
              <button className={`nav-btn${tab==="recent"?" active":""}`} onClick={()=>setTab("recent")}>Recent Games</button>
              <button className={`nav-btn${tab==="group"?" active":""}`} onClick={()=>{setGameMode("group");setGamePlayers([]);setGameDate(new Date().toISOString().slice(0,10));setGameVenue("");setEntryMethod(null);setView({type:"new-game"});}}>
                👥 Group
              </button>
            </div>

            {tab==="players"&&(
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
                  <div className="section-title" style={{margin:0}}>All Players</div>
                  <button className="btn btn-primary btn-sm" onClick={()=>setView({type:"new-player"})}>+ Add Player</button>
                </div>
                {players.length===0&&<div className="empty"><div className="empty-icon">🎳</div><div>No players yet</div><div style={{marginTop:8,fontSize:12}}>Add the first profile to get started</div></div>}
                {players.map(p=>{
                  const stats=calcStats(sessions,p.id);
                  return (
                    <div key={p.id} className="player-card" onClick={()=>setView({type:"player",data:p})}>
                      <div className="player-avatar">{p.nickname.slice(0,2).toUpperCase()}</div>
                      <div className="player-info">
                        <div className="player-nick">{p.nickname}</div>
                        <div className="player-fullname">{p.firstName} {p.lastName}{p.location?` · ${p.location}`:""}</div>
                        {stats?(
                          <div className="player-stat-row">
                            <div className="player-stat">Avg <span>{stats.average}</span></div>
                            <div className="player-stat">High <span>{stats.highGame}</span></div>
                            <div className="player-stat">⚡ <span>{stats.strikePercent}%</span></div>
                            <div className="player-stat">Games <span>{stats.totalGames}</span></div>
                          </div>
                        ):<div className="player-stat" style={{marginTop:4}}>No games yet</div>}
                      </div>
                      <div style={{color:C.pinDim,fontSize:20}}>›</div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab==="leaderboard"&&(
              <div>
                <div className="section-title">Leaderboard</div>
                {players.length===0&&<div className="empty"><div className="empty-icon">🏆</div>Add players to see standings</div>}
                {[
                  {key:"average",label:"Average Score",suffix:""},
                  {key:"highGame",label:"High Game",suffix:""},
                  {key:"strikePercent",label:"Strike Rate",suffix:"%"},
                  {key:"sparePercent",label:"Spare Conversion",suffix:"%"},
                ].map(({key,label,suffix})=>{
                  const ranked=players.map(p=>({p,stats:calcStats(sessions,p.id)})).filter(x=>x.stats).sort((a,b)=>b.stats[key]-a.stats[key]);
                  if(!ranked.length) return null;
                  const max=ranked[0]?.stats[key]||1;
                  return (
                    <div key={key} className="card" style={{marginBottom:16}}>
                      <div className="card-title">{label}</div>
                      {ranked.map(({p,stats},i)=>(
                        <div key={p.id} style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,color:i===0?C.amberLight:C.pinDim,minWidth:22,textAlign:"center"}}>{i+1}</div>
                          <div className="player-avatar" style={{width:32,height:32,fontSize:13}}>{p.nickname.slice(0,2).toUpperCase()}</div>
                          <div style={{flex:1}}>
                            <div style={{fontSize:14,fontWeight:600,color:C.pin}}>{p.nickname}</div>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{width:`${(stats[key]/max)*100}%`,background:key==="strikePercent"?C.strike:key==="sparePercent"?C.spare:C.amber}}/>
                            </div>
                          </div>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:16,fontWeight:700,color:C.amberLight,minWidth:48,textAlign:"right"}}>
                            {stats[key]}{suffix}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {tab==="recent"&&(
              <div>
                <div className="section-title">Recent Games</div>
                {sessions.length===0&&<div className="empty"><div className="empty-icon">🎳</div>No games recorded yet</div>}
                {[...sessions].sort((a,b)=>b.createdAt-a.createdAt).slice(0,30).map(s=>{
                  const p=players.find(x=>x.id===s.playerId);
                  const stk=s.frames.filter(f=>isStrike(f)).length;
                  const spr=s.frames.filter((f,fi)=>isSpare(f,fi)).length;
                  return (
                    <div key={s.id} className="session-row" onClick={()=>setView({type:"session",data:s})}>
                      <div className="session-score">{s.score}</div>
                      <div className="session-meta">
                        <div className="session-date" style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:18,letterSpacing:1,color:C.amberLight}}>{p?.nickname??"Unknown"}</div>
                        <div style={{fontSize:11,color:C.pinDim}}>{s.date}{s.venue?` · ${s.venue}`:""}</div>
                        <div className="session-badges">
                          {stk>0&&<span className="badge badge-strike">⚡ {stk}</span>}
                          {spr>0&&<span className="badge badge-spare">✓ {spr}</span>}
                          {s.score===300&&<span className="badge badge-perfect">★ PERFECT</span>}
                          {s.source==="photo"&&<span className="badge badge-scan">📸</span>}
                        </div>
                      </div>
                      <div style={{color:C.pinDim,fontSize:20}}>›</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {toast&&<div className="toast">{toast}</div>}
    </>
  );
}
