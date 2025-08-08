import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";
import { useState } from "react";
import { createRoom, joinRoom } from "../lib/api";
import { useNavigate } from "react-router";

export function Welcome() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const nav = useNavigate();

  async function onCreate() {
    if (!name) return;
    const res = await createRoom({ name });
    setRoomId(res.roomId);
    nav(`/room/${res.roomId}`);
  }

  async function onJoin() {
    if (!roomId || !name) return;
    await joinRoom(roomId, { name });
    nav(`/room/${roomId}`);
  }
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
        <div className="max-w-[360px] w-full space-y-6 px-4">
          <nav className="rounded-3xl border border-gray-200 p-6 dark:border-gray-700 space-y-4">
            <p className="leading-6 text-gray-700 dark:text-gray-200 text-center">
              Start a room or join
            </p>
            <div className="space-y-3">
              <button
                onClick={onCreate}
                className="w-full rounded bg-blue-600 text-white py-2"
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
                  className="w-full rounded bg-gray-800 text-white py-2"
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
