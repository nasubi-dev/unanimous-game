import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 py-4 px-4 mt-auto">
      <div className="max-w-4xl mx-auto text-center space-y-2">
        <div className="text-sm text-gray-600">
          <p>© 2025 nasubi.dev - All rights reserved</p>
        </div>
        
        <div className="text-xs text-gray-500 space-y-2">
          <p>
            アイコンは{' '}
            <a 
              href="https://iconbu.com/info" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              フリーペンシル様
            </a>
            {' '}より使用させていただいております
          </p>
        </div>
        
        <div className="text-xs text-gray-400">
          <p>全員一致ゲーム - みんなで楽しむオンラインパーティーゲーム</p>
        </div>
      </div>
    </footer>
  );
};
