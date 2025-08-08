import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";
import { useEffect, useState } from "react";
import { ApiError, createRoom, joinRoom } from "../lib/api";
import { useNavigate } from "react-router";

export function Welcome() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const nav = useNavigate();

  async function onCreate() {
    if (!name) return;
    try {
      const res = await createRoom({ name });
      setRoomId(res.roomId);
      nav(`/room/${res.roomId}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 400) showToast(err.body || "Bad Request");
      else showToast("部屋の作成に失敗しました");
    }
  }

  async function onJoin() {
    if (!roomId || !name) return;
    try {
      await joinRoom(roomId, { name });
      nav(`/room/${roomId}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 400) showToast(err.body || "参加に失敗しました (400)");
      else showToast("参加に失敗しました");
    }
  }

  function showToast(message: string) {
    setToast(message);
  }

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center gap-16 min-h-0">
        <header className="flex flex-col items-center gap-9">
          <div className="w-[500px] max-w-[100vw] p-4">
            <img
              src={logoLight}
              alt="React Router"
              className="block w-full dark:hidden"
            />
            <img
              src={logoDark}
              alt="React Router"
              className="hidden w-full dark:block"
            />
          </div>
        </header>
        <div className="max-w-[360px] w-full space-y-6 px-4 relative">
          {toast && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-sm px-3 py-2 rounded shadow">
              {toast}
            </div>
          )}
          <nav className="rounded-3xl border border-gray-200 p-6 dark:border-gray-700 space-y-4">
            <p className="leading-6 text-gray-700 dark:text-gray-200 text-center">
              Start a room or join
            </p>
            <div className="space-y-3">
              <button
                onClick={onCreate}
                disabled={!name}
                className={`w-full rounded py-2 text-white ${
                  name ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
                }`}
              >
                Create Room
              </button>
              <div className="space-y-2">
                <input
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  placeholder="Room ID"
                  className="w-full border rounded p-2"
                />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your Name"
                  className="w-full border rounded p-2"
                />
                <button
                  onClick={onJoin}
                  disabled={!roomId || !name}
                  className={`w-full rounded py-2 text-white ${
                    roomId && name
                      ? "bg-gray-800 hover:bg-black"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                >
                  Join Room
                </button>
              </div>
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}
