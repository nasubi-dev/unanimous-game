import logoDark from "./logo-dark.svg";
import logoLight from "./logo-light.svg";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

export function Welcome() {
  const [name, setName] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem("playerName") || "";
    setName(saved);
  }, []);

  function onNext() {
    const n = name && name.trim() ? name.trim() : `guest${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem("playerName", n);
    nav("/room");
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
              名前を入力してください
            </p>
            <div className="space-y-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your Name (optional)"
                className="w-full border rounded p-2"
              />
              <button
                onClick={onNext}
                className="w-full rounded py-2 text-white bg-blue-600 hover:bg-blue-700"
              >
                次へ
              </button>
            </div>
          </nav>
        </div>
      </div>
    </main>
  );
}
