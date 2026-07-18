import type { ReactNode } from 'react';
import { cn } from '../utils';

interface ChatContentContainerProps {
  children: ReactNode;
  className?: string;
}

export function ChatContentContainer({ children, className }: ChatContentContainerProps) {
  return (
    <div
      className={cn(
        'w-full mx-auto px-4 sm:px-6 lg:w-[90%] lg:px-0 2xl:w-3/4',
        className,
      )}
    >
      {children}
    </div>
  );
}
