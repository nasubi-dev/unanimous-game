import React from 'react';
import { useButtonPress } from '../lib/useAnimations';

interface AnimatedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
}

export function AnimatedButton({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  className = '',
  ...props
}: AnimatedButtonProps) {
  const { ref, handlePress } = useButtonPress<HTMLButtonElement>();

  const baseClasses = 'font-medium rounded transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
    success: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    warning: 'bg-orange-600 hover:bg-orange-700 text-white focus:ring-orange-500',
  };

  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-3 text-base',
    lg: 'px-6 py-4 text-lg',
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    handlePress();
    if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      ref={ref}
      onClick={handleClick}
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
