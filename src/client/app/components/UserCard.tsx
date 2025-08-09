import type { User } from "../../../shared/types";
import { getIconPath } from "../lib/icons";

interface UserCardProps {
  user: User;
  hasAnswered?: boolean;
  answer?: string;
}

export function UserCard({ user, hasAnswered, answer }: UserCardProps) {
  // 回答がある場合は回答結果表示モード、そうでなければ回答状況表示モード
  const isResultMode = answer !== undefined;
  
  return (
    <div
      className={`relative p-6 pb-8 rounded-lg border-2 min-h-[120px] ${
        isResultMode
          ? "bg-blue-50 border-blue-200"
          : hasAnswered
          ? "bg-green-50 border-green-200"
          : "bg-gray-50 border-gray-200"
      }`}
    >
      {/* アイコン - カードの上端にかぶるように配置 */}
      <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
        <img
          src={`${getIconPath(user.icon)}`}
          alt={
            typeof user.icon === "string" ? user.icon : `Icon ${user.icon}`
          }
          className="w-12 h-12 rounded-full border-2 border-white bg-white"
        />
      </div>
      
      {/* コンテンツ */}
      <div className="text-center pt-6">
        <div
          className={`text-xl mb-2 ${
            isResultMode
              ? "text-gray-500"
              : hasAnswered 
              ? "text-green-600" 
              : "text-gray-500"
          }`}
        >
          {isResultMode 
            ? (answer || "未回答")
            : hasAnswered 
            ? "✓ 回答済み" 
            : "回答待ち..."}
        </div>
        <div className="font-medium text-sm">{user.name}</div>
      </div>
    </div>
  );
}
