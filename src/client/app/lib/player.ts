import { getIconForName } from "./icons";

export function getOrCreatePlayerName(): string {
  let name = localStorage.getItem("playerName") || "";
  if (!name) {
    name = `guest${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem("playerName", name);
  }
  return name;
}

export function getOrCreatePlayerIcon(): string | number {
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
