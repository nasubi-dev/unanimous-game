import type { Route } from "./+types/home";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  getRandomIcon,
  getRandomIconExcept,
  getIconPath,
  getIconForName,
  getSpecialIconFromName,
} from "../lib/icons";
import { AnimatedButton } from "../components";
import { Header } from "../components";
import { Expanded } from "../components";
import { Footer } from "../components";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "全員一致ゲーム - nasubi.dev" },
    { name: "description", content: "みんなで楽しむ全員一致ゲーム。お題に対してみんなと同じ答えを目指そう！" },
    { property: "og:title", content: "全員一致ゲーム - nasubi.dev" },
    { property: "og:description", content: "みんなで楽しむ全員一致ゲーム。お題に対してみんなと同じ答えを目指そう！" },
    { property: "og:url", content: "https://zennin-icchi.nasubi.dev" },
    { property: "og:image", content: "https://zennin-icchi.nasubi.dev/ogp/normal.png" },
    { name: "twitter:title", content: "全員一致ゲーム - nasubi.dev" },
    { name: "twitter:description", content: "みんなで楽しむ全員一致ゲーム。お題に対してみんなと同じ答えを目指そう！" },
    { name: "twitter:image", content: "https://zennin-icchi.nasubi.dev/ogp/twitter.png" },
  ];
}

export default function Home() {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | number>(1);
  const [isSpecialName, setIsSpecialName] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem("playerName") || "";
    const savedIcon = localStorage.getItem("playerIcon");
    setName(saved);

    // 名前が特殊かどうかをチェック
    const specialIcon = getSpecialIconFromName(saved);
    setIsSpecialName(!!specialIcon);

    if (savedIcon) {
      try {
        const parsedIcon = JSON.parse(savedIcon);
        setIcon(parsedIcon);
      } catch {
        // パースに失敗した場合は名前に応じたアイコンを設定
        const newIcon = getIconForName(saved);
        setIcon(newIcon);
      }
    } else {
      // 初回は名前に応じたアイコンを設定
      const newIcon = getIconForName(saved);
      setIcon(newIcon);
    }
  }, []);

  function handleNameChange(newName: string) {
    setName(newName);

    // 名前が特殊名前に該当するかチェック
    const specialIcon = getSpecialIconFromName(newName);
    if (specialIcon) {
      setIcon(specialIcon);
      setIsSpecialName(true);
      localStorage.setItem("playerIcon", JSON.stringify(specialIcon));
    } else {
      // 特殊名前でなくなった場合は、以前が特殊名前だったらランダムアイコンに変更
      if (isSpecialName) {
        const randomIcon = getRandomIcon();
        setIcon(randomIcon);
        localStorage.setItem("playerIcon", JSON.stringify(randomIcon));
      }
      setIsSpecialName(false);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem("playerName") || "";
    const savedIcon = localStorage.getItem("playerIcon");
    setName(saved);

    if (savedIcon) {
      try {
        const parsedIcon = JSON.parse(savedIcon);
        setIcon(parsedIcon);
      } catch {
        // パースに失敗した場合はランダムアイコンを設定
        const randomIcon = getRandomIcon();
        setIcon(randomIcon);
      }
    } else {
      // 初回はランダムアイコンを設定
      const randomIcon = getRandomIcon();
      setIcon(randomIcon);
    }
  }, []);

  function onRandomizeIcon() {
    // 特殊名前の場合はランダム変更を無効化
    if (isSpecialName) return;

    const newIcon = getRandomIconExcept(icon);
    setIcon(newIcon);
    localStorage.setItem("playerIcon", JSON.stringify(newIcon));
  }

  function onNext() {
    const n =
      name && name.trim()
        ? name.trim()
        : `guest${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem("playerName", n);
    localStorage.setItem("playerIcon", JSON.stringify(icon));
    nav("/room");
  }
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 w-full max-w-[800px] mx-auto px-4 py-6 flex flex-col justify-center">
        <div className="flex flex-col items-center gap-16">
          <div className="w-full space-y-6 px-4 max-w-[600px]">
            {/* QR表示ボタン */}
            <div className="flex justify-end">
              <button
                onClick={() => setShowQRModal(true)}
                className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-bold py-2 px-4 rounded-lg transition shadow-md"
              >
                QRコード
              </button>
            </div>

            <nav className="rounded-3xl border border-gray-200 p-6 space-y-4">
              <p className="leading-7 text-lg text-gray-700 text-center">
                プレイヤー情報の登録
              </p>

              {/* アイコン選択エリア */}
              <div className="flex flex-col items-center space-y-3">
                <div className="relative">
                  <img
                    src={getIconPath(icon)}
                    alt="Player Icon"
                    className="w-20 h-20 rounded-full border-2 border-gray-300"
                  />
                  {!isSpecialName && (
                    <button
                      onClick={onRandomizeIcon}
                      className="absolute -top-1 -right-1 w-6 h-6 bg-violet-500 hover:bg-violet-600 rounded-full text-white text-xs flex items-center justify-center font-bold"
                      title="アイコンをランダムに変更"
                    >
                      🎲
                    </button>
                  )}
                  {isSpecialName && <div></div>}
                </div>
                <p className="text-base text-gray-500">
                  右上のボタンでアイコンを変更できます
                </p>
              </div>

              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="名前を入力"
                  className="w-full border rounded p-3 text-base"
                />
                <AnimatedButton
                  onClick={onNext}
                  variant="primary"
                  className="w-full text-lg py-3"
                >
                  次へ
                </AnimatedButton>
              </div>
            </nav>
          </div>
        </div>
      </main>
      <Footer />

      {/* QR画像オーバーレイ */}
      {showQRModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
          onClick={() => setShowQRModal(false)}
        >
          <img
            src="/qr.png"
            alt="QR Code"
            className="cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
