#!/usr/bin/env node
/**
 * Durable Objects の使用状況を実データで検証するスクリプト。
 *
 *   node scripts/cf-usage.mjs [days]
 *
 * .env.local から CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID を読む。
 * 必要なトークン権限: Account Analytics:Read（+ Account Settings:Read があれば account_id 自動取得）
 *
 * 出力:
 *  1. GraphQL: DO の activeTime（= 課金対象の duration）を日次/時間別に集計
 *  2. Analytics Engine SQL: room_created / room_cleanup_* から
 *     「部屋数」と「1部屋あたりの生存時間」を分解
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const API = "https://api.cloudflare.com/client/v4";
const DAYS = Number(process.argv[2] ?? 3);

// --- .env.local 読み込み -------------------------------------------------
function loadEnv() {
  const env = { ...process.env };
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (!m) continue;
        env[m[1]] ??= m[2].replace(/^["']|["']$/g, "").trim();
      }
    } catch {
      /* ファイルが無ければ無視 */
    }
  }
  return env;
}

/** wrangler login 済みなら、その OAuth トークンを流用する */
function wranglerOAuthToken() {
  // OAuth アクセストークンは短命なので、wrangler に更新させてから読む。
  // （wrangler は任意のコマンド実行時に refresh_token でトークンを更新する）
  try {
    execSync("npx wrangler whoami", { stdio: "ignore", timeout: 60000 });
  } catch {
    /* 更新できなければ、保存済みトークンをそのまま試す */
  }
  const candidates = [
    `${process.env.HOME}/Library/Preferences/.wrangler/config/default.toml`,
    `${process.env.HOME}/.wrangler/config/default.toml`,
    `${process.env.HOME}/.config/.wrangler/config/default.toml`,
  ];
  for (const file of candidates) {
    try {
      const m = readFileSync(file, "utf8").match(/oauth_token\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } catch {
      /* 次の候補へ */
    }
  }
  return null;
}

const env = loadEnv();
const TOKEN = env.CLOUDFLARE_API_TOKEN || wranglerOAuthToken();
if (!TOKEN) {
  console.error(
    "CLOUDFLARE_API_TOKEN が .env.local に無く、wrangler にもログインしていません",
  );
  process.exit(1);
}
const auth = { authorization: `Bearer ${TOKEN}` };

async function accountId() {
  if (env.CLOUDFLARE_ACCOUNT_ID) return env.CLOUDFLARE_ACCOUNT_ID;
  // wrangler.toml に account_id があればそれを使う
  try {
    const m = readFileSync("wrangler.toml", "utf8").match(/account_id\s*=\s*"([^"]+)"/);
    if (m) return m[1];
  } catch {
    /* 次の手段へ */
  }
  const res = await fetch(`${API}/accounts`, { headers: auth });
  const json = await res.json();
  if (!json.success) throw new Error(JSON.stringify(json.errors));
  return json.result[0].id;
}

// --- 1. GraphQL: DO duration --------------------------------------------
async function doDuration(account, sinceISO) {
  const query = `
    query ($account: String!, $since: Time!) {
      viewer {
        accounts(filter: { accountTag: $account }) {
          durableObjectsPeriodicGroups(
            limit: 1000
            filter: { datetime_geq: $since }
            orderBy: [datetimeHour_ASC]
          ) {
            dimensions { datetimeHour }
            sum {
              activeTime
              cpuTime
              storageReadUnits
              storageWriteUnits
            }
            max { activeWebsocketConnections }
          }
          durableObjectsInvocationsAdaptiveGroups(
            limit: 1000
            filter: { datetime_geq: $since }
            orderBy: [datetimeHour_ASC]
          ) {
            dimensions { datetimeHour }
            sum { requests }
          }
        }
      }
    }`;
  const res = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { account, since: sinceISO },
    }),
  });
  return res.json();
}

// --- 2. Analytics Engine SQL --------------------------------------------
async function sql(account, statement) {
  const res = await fetch(`${API}/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { ...auth, "content-type": "text/plain" },
    body: statement,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

const DATASET = `"unanimous-game-metrics"`;
// blob1=eventType blob2=roomId
// double1=timestamp double2=value double3=userCount
// double4=socketCount double5=durationMs double6=idleMs

const QUERIES = {
  "イベント種別ごとの件数": `
    SELECT blob1 AS event, count() AS n
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${DAYS}' DAY
    GROUP BY event ORDER BY n DESC`,

  "日次: 部屋作成数 vs 部屋クリーンアップ数": `
    SELECT toDate(timestamp) AS day,
           sumIf(1, blob1 = 'room_created')          AS rooms_created,
           sumIf(1, blob1 LIKE 'room_cleanup%')      AS rooms_cleaned,
           sumIf(1, blob1 = 'ws_connected')          AS ws_connects
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${DAYS}' DAY
    GROUP BY day ORDER BY day`,

  "部屋の生存時間 (room_cleanup_* の durationMs)": `
    SELECT toDate(timestamp) AS day, blob1 AS reason,
           count() AS n,
           round(sum(double5)/1000/60)  AS total_min,
           round(avg(double5)/1000/60)  AS avg_min,
           round(max(double5)/1000/60)  AS max_min,
           round(avg(double6)/1000/60)  AS avg_idle_min
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${DAYS}' DAY
      AND blob1 LIKE 'room_cleanup%'
    GROUP BY day, reason ORDER BY day, reason`,

  "WebSocket接続の生存時間 (ws_disconnected の durationMs)": `
    SELECT toDate(timestamp) AS day,
           count() AS n,
           round(sum(double5)/1000/60) AS total_min,
           round(avg(double5)/1000/60) AS avg_min,
           round(max(double5)/1000/60) AS max_min
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${DAYS}' DAY
      AND blob1 IN ('ws_disconnected', 'ws_error')
    GROUP BY day ORDER BY day`,

  "長時間居座っている部屋 TOP20": `
    SELECT blob2 AS room, blob1 AS reason,
           round(double5/1000/60) AS alive_min,
           round(double6/1000/60) AS idle_min
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${DAYS}' DAY
      AND blob1 LIKE 'room_cleanup%'
    ORDER BY alive_min DESC LIMIT 20`,

  "部屋ごとのWS接続回数 TOP20 (再接続ループ検出)": `
    SELECT blob2 AS room, count() AS ws_connects
    FROM ${DATASET}
    WHERE timestamp > NOW() - INTERVAL '${DAYS}' DAY
      AND blob1 = 'ws_connected'
    GROUP BY room ORDER BY ws_connects DESC LIMIT 20`,
};

// --- 実行 ----------------------------------------------------------------
function table(rows) {
  if (!rows?.length) return "  (データなし)";
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) =>
    Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
  );
  const line = (cells) =>
    "  " + cells.map((v, i) => String(v ?? "").padEnd(w[i])).join("  ");
  return [line(cols), line(w.map((n) => "-".repeat(n))), ...rows.map((r) => line(cols.map((c) => r[c])))].join("\n");
}

const account = await accountId();
const since = new Date(Date.now() - DAYS * 864e5).toISOString();
console.log(`account=${account}  since=${since}\n`);

console.log("=".repeat(72));
console.log("【1】Durable Objects の実課金メトリクス (GraphQL)");
console.log("=".repeat(72));
const g = await doDuration(account, since);
if (g.errors) {
  console.log("  ERROR:", JSON.stringify(g.errors, null, 2));
} else {
  const acc = g.data?.viewer?.accounts?.[0];
  const periodic = acc?.durableObjectsPeriodicGroups ?? [];
  const invocations = acc?.durableObjectsInvocationsAdaptiveGroups ?? [];
  const reqByHour = new Map(
    invocations.map((r) => [r.dimensions.datetimeHour, r.sum.requests]),
  );
  // activeTime の単位は microsecond*128MB 相当 (= duration)。DO稼働秒に換算。
  const rows = periodic.map((r) => {
    const activeUs = r.sum.activeTime;
    return {
      hour: r.dimensions.datetimeHour,
      "DO稼働(分)": (activeUs / 1e6 / 60).toFixed(1),
      duration単位: activeUs,
      requests: reqByHour.get(r.dimensions.datetimeHour) ?? 0,
      最大WS: r.max?.activeWebsocketConnections ?? 0,
    };
  });
  console.log(table(rows));
  const totalUs = periodic.reduce((s, r) => s + r.sum.activeTime, 0);
  const byDay = new Map();
  for (const r of periodic) {
    const day = r.dimensions.datetimeHour.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + r.sum.activeTime);
  }
  console.log("\n  --- 日次サマリ (無料枠 101,562,500,000 duration/日) ---");
  console.log(
    table(
      [...byDay].map(([day, us]) => ({
        day,
        duration: us,
        "無料枠比(%)": ((us / 101562500000) * 100).toFixed(1),
        "DO稼働(時間)": (us / 1e6 / 3600).toFixed(2),
      })),
    ),
  );
  console.log(`\n  期間合計 DO稼働: ${(totalUs / 1e6 / 3600).toFixed(2)} 時間`);
}

console.log("\n" + "=".repeat(72));
console.log("【2】アプリ側イベント (Analytics Engine)");
console.log("=".repeat(72));
for (const [title, q] of Object.entries(QUERIES)) {
  console.log(`\n--- ${title} ---`);
  const r = await sql(account, q.trim());
  if (r.error) console.log("  ERROR:", r.error);
  else if (r.errors) console.log("  ERROR:", JSON.stringify(r.errors));
  else console.log(table(r.data));
}
