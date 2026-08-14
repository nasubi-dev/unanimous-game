// Durable Object のクリーンアップ（storage.setAlarm 経由）の検証。
// タイムアウトを秒単位に縮めた dev サーバに対して実行する。
//
//   npx wrangler dev --port 8789 --local --var EMPTY_ROOM_CLEANUP_MS:4000 --var IDLE_TIMEOUT_MS:8000
//   node scripts/e2e-cleanup.mjs
//
const BASE="http://localhost:8789", WS="ws://localhost:8789";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let fail=0;
const check=(n,ok,x="")=>{console.log(`${ok?"  OK  ":"  NG  "} ${n}${x?" :: "+x:""}`);if(!ok)fail++;};
const alive=async id=>(await fetch(`${BASE}/api/rooms/${id}/state`)).status===200;

// --- A: 接続ゼロ → EMPTY_ROOM_CLEANUP_MS(4s) で破棄 ---
let c=await (await fetch(`${BASE}/api/rooms`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"GM",icon:1})})).json();
check("A: 部屋作成", await alive(c.roomId));
const closes=[];
const ws=new WebSocket(`${WS}/ws/${c.roomId}`);
ws.addEventListener("close",e=>closes.push(`${e.code}/${e.reason}`));
await new Promise(r=>ws.addEventListener("open",r));
await sleep(500);
check("A: 接続中は生きている", await alive(c.roomId));
ws.close();
await sleep(2500);
check("A: 切断2.5秒後はまだ生きている", await alive(c.roomId));
await sleep(3000);
check("A: 切断5.5秒後(>4s)に破棄されている", !(await alive(c.roomId)));

// --- B: 接続維持でも IDLE_TIMEOUT_MS(8s) 無操作なら破棄 ---
c=await (await fetch(`${BASE}/api/rooms`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"GM",icon:1})})).json();
const closes2=[];
const ws2=new WebSocket(`${WS}/ws/${c.roomId}`);
ws2.addEventListener("close",e=>closes2.push(`${e.code}/${e.reason}`));
await new Promise(r=>ws2.addEventListener("open",r));
// ping と /state ポーリングでは延命しないことを確認
for(let i=0;i<8;i++){ ws2.send(JSON.stringify({type:"ping"})); await fetch(`${BASE}/api/rooms/${c.roomId}/state`); await sleep(1000); }
check("B: ping と /state では延命しない（8秒後に破棄）", !(await alive(c.roomId)));
check("B: クライアントに room_closed が通知される", closes2.includes("1000/room_closed"), JSON.stringify(closes2));

// --- C: 操作すればアイドルタイマーが延びる ---
c=await (await fetch(`${BASE}/api/rooms`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:"GM",icon:1})})).json();
const ws3=new WebSocket(`${WS}/ws/${c.roomId}`);
await new Promise(r=>ws3.addEventListener("open",r));
for(let i=0;i<7;i++){
  await fetch(`${BASE}/api/rooms/${c.roomId}/settings`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({gmToken:c.gmToken,settings:{winCondition:{type:"count",value:1+i%3}}})});
  await sleep(1000);
}
check("C: 操作を続ければ7秒後も生きている", await alive(c.roomId));
ws3.close();

console.log(`\n${fail===0?"✅ 全て成功":`❌ ${fail} 件失敗`}`);
process.exit(fail===0?0:1);
