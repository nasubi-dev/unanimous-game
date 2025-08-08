import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { ApiError, connectWs, getRoomState, gmTokenStore, updateSettings, userIdStore } from "../lib/api";

export function meta() {
  return [{ title: "Room" }];
}

export default function Room() {
  const params = useParams();
  const id = params.id!;
  const [state, setState] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selfId, setSelfId] = useState<string | null>(null);

  useEffect(() => {
    // まず状態とselfIdを設定
    setSelfId(userIdStore.load(id) || null);
    
    // REST APIで状態を取得
    getRoomState(id)
      .then(setState)
      .catch(() => setToast("状態の取得に失敗しました"));

    // WebSocket接続を設定
    let ws = connectWs(id);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("WebSocket connected");
    };
    
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") {
          setState(msg.room);
        }
        if (msg.type === "userJoined") {
          setState((prev: any) => ({
            ...prev,
            users: [...(prev?.users ?? []), msg.user],
          }));
        }
      } catch (e) {
        console.error("WebSocket message error:", e);
      }
    };
    
    ws.onclose = () => {
      console.log("WebSocket closed, attempting reconnect...");
      // simple retry
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          const newWs = connectWs(id);
          wsRef.current = newWs;
        }
      }, 1000);
    };
    
    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [id]);

  if (!state) return <p>Loading...</p>;
  return (
    <div className="p-4">
      {toast && (
        <div className="mb-3 inline-block bg-red-600 text-white text-sm px-3 py-2 rounded">
          {toast}
        </div>
      )}
      <h1 className="text-2xl font-semibold">Room #{state.id}</h1>
      <h2 className="mt-4 mb-2 font-medium">Users</h2>
      <ul className="space-y-1">
        {state.users?.map((u: any) => (
          <li key={u.id} className="flex items-center gap-2">
            <span className={selfId === u.id ? "me" : undefined}>{u.name}</span>
            {u.isGM && (
              <span className="text-[10px] bg-amber-500 text-white rounded px-1 py-0.5 uppercase tracking-wide">
                GM
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* ルーム設定（waiting中のみ） */}
      {state.status === "waiting" && (
        <div className="mt-6 p-4 rounded border border-gray-200 dark:border-gray-700 max-w-xl">
          <h3 className="font-medium mb-3">ルーム設定{gmTokenStore.load(state.id) ? "（GM専用）" : ""}</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm mb-1">お題の出題者</label>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="topicMode"
                    checked={state.settings?.topicMode === "gm"}
                    onChange={() => setState((s: any) => ({ ...s, settings: { ...s.settings, topicMode: "gm" } }))}
                    disabled={!gmTokenStore.load(state.id)}
                  />
                  <span>GMが決める</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="topicMode"
                    checked={state.settings?.topicMode === "all"}
                    onChange={() => setState((s: any) => ({ ...s, settings: { ...s.settings, topicMode: "all" } }))}
                    disabled={!gmTokenStore.load(state.id)}
                  />
                  <span>全員一周する</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1">勝利条件</label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={state.settings?.winCondition?.type}
                    onChange={(e) => {
                      const t = e.target.value as any;
                      setState((s: any) => ({
                        ...s,
                        settings: {
                          ...s.settings,
                          winCondition: t === "none" ? { type: "none" } : { type: t, value: s.settings?.winCondition?.value ?? 1 },
                        },
                      }));
                    }}
                    className="border rounded p-2"
                    disabled={!gmTokenStore.load(state.id)}
                  >
                    <option value="count">n回一致クリア</option>
                    <option value="consecutive">n回連続一致</option>
                    <option value="none">勝利条件なし</option>
                  </select>
                  {state.settings?.winCondition?.type !== "none" && (
                    <input
                      type="number"
                      min={1}
                      value={(state.settings?.winCondition?.type !== "none" && state.settings?.winCondition?.value) || 1}
                      onChange={(e) =>
                        setState((s: any) => ({
                          ...s,
                          settings: {
                            ...s.settings,
                            winCondition: {
                              type: s.settings?.winCondition?.type,
                              value: Math.max(1, Number(e.target.value || 1)),
                            },
                          },
                        }))
                      }
                      className="w-20 border rounded p-2"
                      disabled={!gmTokenStore.load(state.id)}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2">
              {gmTokenStore.load(state.id) && (
                <button
                  disabled={saving}
                  onClick={async () => {
                    const token = gmTokenStore.load(state.id);
                    if (!token) {
                      setToast("GM権限がありません");
                      return;
                    }
                    setSaving(true);
                    try {
                      await updateSettings(state.id, {
                        gmToken: token,
                        settings: state.settings,
                      });
                      setToast("設定を保存しました");
                    } catch (e) {
                      const err = e as ApiError;
                      setToast(err.status === 403 ? "GM権限がありません (403)" : "設定の保存に失敗しました");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className={`rounded px-4 py-2 text-white ${
                    saving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  設定を保存
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 自分のユーザー名をハイライト */}
      <style>{`.me { background: color-mix(in oklab, var(--color-amber-500, #f59e0b) 20%, transparent); padding: 2px 4px; border-radius: 4px; }`}</style>
    </div>
  );
}
