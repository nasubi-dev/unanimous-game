// 全員一致ゲームで使用するお題の定数
export const APP_TOPICS = [
  "好きな食べ物",
  "好きな色",
  "好きな季節",
  "夜食で食べたいもの",
  "お祭りで食べたいもの",
  "コンビニで必ず買うもの",
  "家にあると便利なもの",
  "一番使うSNS",
  "携帯の機能で一番使うもの",
  "ゲームで好きなジャンル",
  "テレビで見る番組",
  "好きなオリンピック競技",
  "好きなアニメのジャンル",
  "ディズニーで好きなキャラクター",
  "ジブリで好きな作品",
  "お味噌汁の定番の具材といえば？",
  "無人島に持っていくなら何？",
  "かわいいと思う動物",
] as const;

/**
 * ランダムなお題を取得する関数
 */
export function getRandomTopic(): string {
  const randomIndex = Math.floor(Math.random() * APP_TOPICS.length);
  return APP_TOPICS[randomIndex];
}
