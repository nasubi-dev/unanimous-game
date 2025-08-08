import { useState } from "react";
import type { Room, RoomSettings as RoomSettingsType } from "../../../shared/types";
import { updateSettings, gmTokenStore } from "../lib/api";

interface RoomSettingsProps {
  state: Room;
  setState: React.Dispatch<React.SetStateAction<Room | null>>;
  setToast: (message: string | null) => void;
}

export function RoomSettings({ state, setState, setToast }: RoomSettingsProps) {
  const [saving, setSaving] = useState(false);

  const handleSaveSettings = async () => {
    const gmToken = gmTokenStore.load(state.id);
    if (!gmToken) {
      setToast("GM権限がありません");
      return;
    }

    setSaving(true);
    try {
      await updateSettings(state.id, {
        settings: state.settings,
        gmToken,
      });
      setToast("設定が保存されました");
    } catch (e) {
      if (e instanceof Error) {
        setToast(`設定の保存に失敗しました: ${e.message}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const isGM = gmTokenStore.load(state.id);

  return (
    <div className="mb-6">
      <h2 className="text-xl font-bold mb-3">ゲームルール</h2>
      <div className="bg-white dark:bg-gray-800 p-4 rounded border space-y-4">
        <div>
          <label className="block text-base mb-1">お題の出題者</label>
          <div className="space-y-2">
            <label className="inline-flex items-center gap-2 text-base">
              <input
                type="radio"
                name="topicMode"
                checked={state.settings?.topicMode === "gm"}
                onChange={() => setState((s) => s ? ({ ...s, settings: { ...s.settings, topicMode: "gm" } }) : null)}
                disabled={!isGM}
              />
              <span>GMが決める</span>
            </label>
            <label className="inline-flex items-center gap-2 text-base">
              <input
                type="radio"
                name="topicMode"
                checked={state.settings?.topicMode === "all"}
                onChange={() => setState((s) => s ? ({ ...s, settings: { ...s.settings, topicMode: "all" } }) : null)}
                disabled={!isGM}
              />
              <span>全員一周する</span>
            </label>
          </div>
        </div>

        <div>
          <label className="block text-base mb-1">勝利条件</label>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={state.settings?.winCondition?.type}
                onChange={(e) => {
                  const t = e.target.value as "count" | "consecutive" | "none";
                  setState((s) => s ? ({
                    ...s,
                    settings: {
                      ...s.settings,
                      winCondition: t === "none" ? { type: "none" } : { type: t, value: s.settings?.winCondition && s.settings.winCondition.type !== "none" ? s.settings.winCondition.value : 1 },
                    },
                  }) : null);
                }}
                className="border rounded p-3 text-base"
                disabled={!isGM}
              >
                <option value="count">n回一致クリア</option>
                <option value="consecutive">n回連続一致</option>
                <option value="none">勝利条件なし</option>
              </select>
              {state.settings?.winCondition?.type !== "none" && (
                <input
                  type="number"
                  min={1}
                  value={state.settings.winCondition.value}
                  onChange={(e) =>
                    setState((s) => s ? ({
                      ...s,
                      settings: {
                        ...s.settings,
                        winCondition: {
                          type: s.settings?.winCondition?.type as "count" | "consecutive",
                          value: parseInt(e.target.value) || 1,
                        },
                      },
                    }) : null)
                  }
                  className="border rounded p-3 w-20 text-base"
                  disabled={!isGM}
                />
              )}
            </div>
          </div>
        </div>

        {isGM && (
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className={`rounded px-4 py-3 text-lg text-white ${
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            設定を保存
          </button>
        )}
      </div>
    </div>
  );
}
