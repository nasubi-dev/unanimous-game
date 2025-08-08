import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  ApiError,
  createRoom,
  joinRoom,
  gmTokenStore,
  userIdStore,
} from "../lib/api";
import { getIconForName } from "../lib/icons";

function getOrCreatePlayerName(): string {
  let name = localStorage.getItem("playerName") || "";
  if (!name) {
    name = `guest${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem("playerName", name);
  }
  return name;
}

function getOrCreatePlayerIcon(): string | number {
  const saved = localStorage.getItem("playerIcon");
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      // パースに失敗した場合は名前に基づいてアイコンを設定
      const playerName = getOrCreatePlayerName();
      const newIcon = getIconForName(playerName);
      localStorage.setItem("playerIcon", JSON.stringify(newIcon));
      return newIcon;
    }
  } else {
    // 初回は名前に基づいてアイコンを設定
    const playerName = getOrCreatePlayerName();
    const newIcon = getIconForName(playerName);
    localStorage.setItem("playerIcon", JSON.stringify(newIcon));
    return newIcon;
  }
}

export default function RoomGateway() {
  const nav = useNavigate();
  const [playerName, setPlayerName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showJoin, setShowJoin] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);

  useEffect(() => {
    setPlayerName(getOrCreatePlayerName());
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  async function onCreate() {
    const name = getOrCreatePlayerName();
    const icon = getOrCreatePlayerIcon();
    setLoading("create");
    try {
      const res = await createRoom({ name, icon });
      gmTokenStore.save(res.roomId, res.gmToken);
      if (res.gmUserId) userIdStore.save(res.roomId, res.gmUserId);
      nav(`/room/${res.roomId}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 400) setToast(err.body || "作成に失敗しました (400)");
      else setToast("ルームの作成に失敗しました");
    } finally {
      setLoading(null);
    }
  }

  const roomIdOk = /^\d{4}$/.test(roomId);

  async function onJoin() {
    if (!roomIdOk) return;
    const name = getOrCreatePlayerName();
    const icon = getOrCreatePlayerIcon();
    setLoading("join");
    try {
      const jr = await joinRoom(roomId, { name, icon });
      if (jr?.userId) userIdStore.save(roomId, jr.userId);
      nav(`/room/${roomId}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 400) setToast(err.body || "参加に失敗しました (400)");
      else setToast("参加に失敗しました");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="flex items-center justify-center pt-16 pb-4">
      <div className="flex-1 flex flex-col items-center gap-16 min-h-0">
        <div className="max-w-[420px] w-full space-y-6 px-4 relative">
          {toast && (
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-red-600 text-white text-base px-3 py-2 rounded shadow">
              {toast}
            </div>
          )}
          <nav className="rounded-3xl border border-gray-200 p-6 dark:border-gray-700 space-y-5">
            <p className="text-center text-lg text-gray-700 dark:text-gray-200">
              ようこそ、{playerName}
            </p>
            {!showJoin ? (
              <div className="space-y-3">
                <button
                  onClick={onCreate}
                  disabled={loading === "create"}
                  className={`w-full rounded py-3 text-lg text-white ${
                    loading === "create"
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  ルームを作成
                </button>
                <button
                  type="button"
                  onClick={() => setShowJoin(true)}
                  className="w-full rounded py-3 text-lg text-white bg-gray-800 hover:bg-black"
                >
                  参加する
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setShowJoin(false)}
                  className="w-full rounded py-3 text-lg text-gray-800 bg-gray-100 hover:bg-gray-200 dark:text-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700"
                >
                  戻る
                </button>
                <div className="space-y-2">
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    value={roomId}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").slice(0, 4);
                      setRoomId(v);
                    }}
                    placeholder="4桁の番号"
                    className="w-full border rounded p-3 text-base"
                  />
                  <button
                    onClick={onJoin}
                    disabled={!roomIdOk || loading === "join"}
                    className={`w-full rounded py-3 text-lg text-white ${
                      roomIdOk && loading !== "join"
                        ? "bg-emerald-600 hover:bg-emerald-700"
                        : "bg-gray-400 cursor-not-allowed"
                    }`}
                  >
                    このルームに参加
                  </button>
                </div>
              </div>
            )}
          </nav>
        </div>
      </div>
    </main>
  );
}
