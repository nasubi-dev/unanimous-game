import type { User } from "../../../shared/types";
import { getIconPath } from "../lib/icons";

interface UsersListProps {
  users: User[];
  selfId: string | null;
}

export function UsersList({ users, selfId }: UsersListProps) {
  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold mb-4">参加者</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex flex-col items-center rounded-lg border-2 ${
              user.id === selfId
                ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-600"
                : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600"
            }`}
          >
            {/* アイコン */}
            <img
              src={getIconPath(user.icon)}
              alt={`${user.name}のアイコン`}
              className="w-16 h-16 rounded-full mb-2"
            />

            {/* 名前 */}
            <div className="font-medium text-base text-center mb-2 min-h-[1.5rem]">
              {user.name}
            </div>

            {/* バッジエリア */}
            <div className="flex flex-col gap-1 items-center">
              {user.isGM && (
                <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-sm px-2 py-1 rounded">
                  GM
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
