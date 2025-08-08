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
      .catch(() => {});
    return () => ws.close();
  }, [id]);

  if (!state) return <p>Loading...</p>;
  return (
    <div style={{ padding: 16 }}>
      <h1>Room #{state.id}</h1>
      <h2>Users</h2>
      <ul>
        {state.users?.map((u: any) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
    </div>
  );
}
