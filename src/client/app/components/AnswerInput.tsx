import { useState } from "react";
import { AnimatedButton } from "./AnimatedButton";

interface AnswerInputProps {
  onSubmit: (answer: string) => Promise<void>;
  disabled?: boolean;
}

export function AnswerInput({ onSubmit, disabled = false }: AnswerInputProps) {
  const [answerInput, setAnswerInput] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!answerInput.trim() || submitting) return;

    setSubmitting(true);
    try {
      await onSubmit(answerInput.trim());
      setAnswerInput("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-base font-medium text-center">あなたの回答</div>
      <input
        type="text"
        value={answerInput}
        onChange={(e) => setAnswerInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && answerInput.trim() && !submitting && !disabled) {
            handleSubmit();
          }
        }}
        className="w-full border rounded px-3 py-3 text-base text-center"
        placeholder="回答を入力..."
        disabled={disabled || submitting}
        autoFocus
      />
      <AnimatedButton
        onClick={handleSubmit}
        disabled={!answerInput.trim() || submitting || disabled}
        variant="success"
        className="w-full disabled:bg-gray-400 disabled:hover:bg-gray-400"
      >
        {submitting ? "送信中..." : "送信"}
      </AnimatedButton>
    </div>
  );
}
