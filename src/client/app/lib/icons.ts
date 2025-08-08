// アイコン関連のヘルパー関数

// 利用可能な数値アイコン（1-17）
export const NUMERIC_ICONS = Array.from({ length: 17 }, (_, i) => i + 1);

// 利用可能な秘密アイコン
export const SECRET_ICONS = ["kandou", "nasubi", "taibu"];

// 特殊な名前とそのアイコンのマッピング
export const SPECIAL_NAME_ICONS: Record<string, string> = {
  感動: "kandou",
  かんどう: "kandou",
  カンドウ: "kandou",
  kandou: "kandou",
  茄子: "nasubi",
  なすび: "nasubi",
  ナスビ: "nasubi",
  nasubi: "nasubi",
  退部: "taibu",
  たいぶ: "taibu",
  タイブ: "taibu",
  taibu: "taibu",
};

// 名前から特殊アイコンを取得する
export function getSpecialIconFromName(name: string): string | null {
  const trimmedName = name.trim();
  return SPECIAL_NAME_ICONS[trimmedName] || null;
}

// アイコンのパスを取得する
export function getIconPath(icon: string | number): string {
  if (typeof icon === "number") {
    return `/${icon}-icon.png`;
  } else {
    return `/secret/${icon}.png`;
  }
}

// 名前に基づいてアイコンを生成する（特殊名前なら秘密アイコン、そうでなければランダム）
export function getIconForName(name: string): string | number {
  const specialIcon = getSpecialIconFromName(name);
  if (specialIcon) {
    return specialIcon;
  }
  // 特殊名前でない場合は数値アイコンをランダムに選択
  return NUMERIC_ICONS[Math.floor(Math.random() * NUMERIC_ICONS.length)];
}

// ランダムなアイコンを生成する
export function getRandomIcon(): string | number {
  return NUMERIC_ICONS[Math.floor(Math.random() * NUMERIC_ICONS.length)];
}

// 現在のアイコンと異なるランダムなアイコンを生成する
export function getRandomIconExcept(
  currentIcon: string | number
): string | number {
  let newIcon: string | number;
  do {
    newIcon = getRandomIcon();
  } while (newIcon === currentIcon);
  return newIcon;
}
