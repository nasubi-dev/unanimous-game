import type { User } from "../../../shared/types";

interface UsersListProps {
  users: User[];
  selfId: string | null;
}

export function UsersList({ users, selfId }: UsersListProps) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-bold mb-3">参加者</h2>
      <div className="space-y-2">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex items-center gap-3 p-3 rounded ${
              user.id === selfId 
                ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800" 
                : "bg-gray-50 dark:bg-gray-800"
            }`}
          >
            <div className="text-2xl">{user.icon}</div>
            <div className="flex-1">
              <div className="font-medium">
                {user.name}
                {user.id === selfId && (
                  <span className="text-blue-600 dark:text-blue-400 text-sm ml-2">
                    (あなた)
                  </span>
                )}
              </div>
            </div>
            {user.isGM && (
              <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs px-2 py-1 rounded">
                GM
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
