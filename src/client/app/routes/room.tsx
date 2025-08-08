import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { connectWs, getRoomState } from "../lib/api";

export function meta() {
  return [{ title: "Room" }];
}

export default function Room() {
  const params = useParams();
  const id = params.id!;
  const [state, setState] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let ws = connectWs(id);
    wsRef.current = ws;
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === "state") setState(msg.room);
        if (msg.type === "userJoined")
          setState((prev: any) => ({
            ...prev,
            users: [...(prev?.users ?? []), msg.user],
          }));
      } catch {}
    };
    ws.onclose = () => {
      // simple retry
      setTimeout(() => {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          wsRef.current = connectWs(id);
        }
      }, 1000);
    };
    getRoomState(id)
      .then(setState)
      .catch(() => setToast("状態の取得に失敗しました"));
    return () => ws.close();
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
            <span>{u.name}</span>
            {u.isGM && (
              <span className="text-[10px] bg-amber-500 text-white rounded px-1 py-0.5 uppercase tracking-wide">
                GM
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
