// ハイバネーションで Durable Object インスタンスがメモリから消えても
// 状態が壊れないことの検証（本番でしか起きない経路をローカルで再現する）。
//
//   S=/tmp/do-persist && rm -rf $S
//   npx wrangler dev --port 8793 --local --persist-to $S &
//   node scripts/e2e-hibernation-setup.mjs > ctx.json   # 途中まで進んだ部屋を作る
//   # dev サーバを kill して同じ --persist-to で再起動（= 全DOインスタンスが破棄される）
//   node scripts/e2e-hibernation.mjs                    # ctx.json を読んで復元を検証
//
const BASE="http://localhost:8793";
const ctx=JSON.parse((await import("node:fs")).default.readFileSync("ctx.json","utf8"));
let fail=0; const check=(n,ok,x="")=>{console.log(`${ok?"  OK  ":"  NG  "} ${n}${x?" :: "+x:""}`);if(!ok)fail++;};

const res=await fetch(`${BASE}/api/rooms/${ctx.roomId}/state`);
check("インスタンス破棄後も部屋が生きている", res.status===200, `status=${res.status}`);
if(res.status!==200){process.exit(1);}
const st=await res.json();
check("ユーザーが2人とも残っている", st.users.length===2, `users=${st.users.length}`);
check("status=playing が保持されている", st.status==="playing", st.status);
check("設定 winCondition が保持されている", st.settings.winCondition.type==="count"&&st.settings.winCondition.value===3, JSON.stringify(st.settings.winCondition));
check("設定 maxRounds が保持されている", st.settings.maxRounds===5, String(st.settings.maxRounds));
check("ラウンドが保持されている", st.rounds.length===1&&st.rounds[0].id===ctx.roundId);
check("お題が保持されている", st.rounds[0].topic==="好きな寿司ネタ", st.rounds[0].topic);
check("回答が保持されている", st.rounds[0].answers.length===1&&st.rounds[0].answers[0].value==="まぐろ", JSON.stringify(st.rounds[0].answers));

// gmToken (meta) も storage から復元されているか
const ok=await fetch(`${BASE}/api/rooms/${ctx.roomId}/round/${ctx.roundId}/open`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({roundId:ctx.roundId,gmToken:ctx.gmToken})});
check("復帰後も gmToken が有効（GM操作が通る）", ok.status===200, `status=${ok.status}`);
const bad=await fetch(`${BASE}/api/rooms/${ctx.roomId}/round/${ctx.roundId}/open`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({roundId:ctx.roundId,gmToken:"wrong"})});
check("復帰後も不正トークンは 403", bad.status===403, `status=${bad.status}`);

// 復帰後にゲームを最後まで進められるか
const jd=await (await fetch(`${BASE}/api/rooms/${ctx.roomId}/round/${ctx.roundId}/result`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({roundId:ctx.roundId,unanimous:true,gmToken:ctx.gmToken})})).json();
check("復帰後も判定が通る（勝利条件3回なので未終了）", jd.ok===true&&jd.gameFinished===false, JSON.stringify(jd));

console.log(`\n${fail===0?"✅ ハイバネーション復帰は健全":`❌ ${fail} 件失敗`}`);
process.exit(fail===0?0:1);
