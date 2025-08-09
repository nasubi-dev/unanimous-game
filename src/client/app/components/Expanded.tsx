import type { ReactNode } from "react";
import type { Room } from "../../../shared/types";
import { Header } from "./Header";

interface ExpandedProps {
  children: ReactNode;
  room?: Room;
}

export function Expanded({ children, room }: ExpandedProps) {
  return (
    <>
      <Header room={room} />
      <main className="w-full max-w-[800px] mx-auto px-4 py-6">
        {children}
      </main>
    </>
  );
}
