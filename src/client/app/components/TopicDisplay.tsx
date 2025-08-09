interface TopicDisplayProps {
  topic: string;
  className?: string;
}

export function TopicDisplay({ topic, className = "" }: TopicDisplayProps) {
  return (
    <div className={`text-center ${className}`}>
      <div className="bg-blue-50 p-4 rounded max-w-md mx-auto">
        <div className="text-base text-blue-600 mb-2">お題</div>
        <div className="text-xl font-medium">{topic}</div>
      </div>
    </div>
  );
}
