import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { gsap } from 'gsap';
import {
  fadeIn,
  fadeOut,
  scaleIn,
  scaleOut,
  slideInFromRight,
  slideOutToLeft,
  animateCountdown,
  animateRoundResult,
  animateVictoryEffect,
  animateAnswerFeedback,
  animateListItems,
  animateButtonPress,
  animateCardTap,
  animateHover,
  animateRevealAnswers,
} from './animations';

// 要素参照用のカスタムフック
export const useAnimationRef = <T extends HTMLElement = HTMLDivElement>(): MutableRefObject<T | null> => {
  return useRef<T | null>(null);
};

// マウント時のフェードインアニメーション
export const useFadeInOnMount = <T extends HTMLElement>(dependency?: any) => {
  const ref = useAnimationRef<T>();
  
  useEffect(() => {
    if (ref.current) {
      fadeIn(ref.current);
    }
  }, [dependency]);
  
  return ref;
};

// マウント時のスケールインアニメーション
export const useScaleInOnMount = <T extends HTMLElement>(dependency?: any) => {
  const ref = useAnimationRef<T>();
  
  useEffect(() => {
    if (ref.current) {
      scaleIn(ref.current);
    }
  }, [dependency]);
  
  return ref;
};

// カウントダウンアニメーション用フック
export const useCountdownAnimation = () => {
  const ref = useAnimationRef<HTMLDivElement>();
  
  const startCountdown = (number: number) => {
    if (ref.current) {
      return animateCountdown(ref.current, number);
    }
  };
  
  return { ref, startCountdown };
};

// ラウンド結果アニメーション用フック
export const useRoundResultAnimation = () => {
  const ref = useAnimationRef<HTMLDivElement>();
  
  const showResult = (isUnanimous: boolean) => {
    if (ref.current) {
      return animateRoundResult(ref.current, isUnanimous);
    }
  };
  
  return { ref, showResult };
};

// 勝利エフェクトアニメーション用フック
export const useVictoryAnimation = () => {
  const ref = useAnimationRef<HTMLDivElement>();
  
  const playVictoryEffect = () => {
    if (ref.current) {
      return animateVictoryEffect(ref.current);
    }
  };
  
  return { ref, playVictoryEffect };
};

// リストアイテムアニメーション用フック
export const useListAnimation = <T extends HTMLElement>() => {
  const containerRef = useAnimationRef<T>();
  
  const animateItems = (selector: string = '.animate-item', stagger = 0.1) => {
    if (containerRef.current) {
      const items = containerRef.current.querySelectorAll(selector) as NodeListOf<HTMLElement>;
      return animateListItems(Array.from(items), stagger);
    }
  };
  
  return { containerRef, animateItems };
};

// 回答状況フィードバックアニメーション用フック
export const useAnswerFeedbackAnimation = () => {
  const ref = useAnimationRef<HTMLDivElement>();
  
  const showFeedback = (type: 'submitted' | 'waiting') => {
    if (ref.current) {
      return animateAnswerFeedback(ref.current, type);
    }
  };
  
  return { ref, showFeedback };
};

// 汎用トランジションフック（ページ遷移など）
export const useTransition = <T extends HTMLElement>() => {
  const ref = useAnimationRef<T>();
  
  const fadeInTransition = () => {
    if (ref.current) {
      return fadeIn(ref.current);
    }
  };
  
  const fadeOutTransition = () => {
    if (ref.current) {
      return fadeOut(ref.current);
    }
  };
  
  const slideInTransition = () => {
    if (ref.current) {
      return slideInFromRight(ref.current);
    }
  };
  
  const slideOutTransition = () => {
    if (ref.current) {
      return slideOutToLeft(ref.current);
    }
  };
  
  return {
    ref,
    fadeInTransition,
    fadeOutTransition,
    slideInTransition,
    slideOutTransition,
  };
};

// 条件付きアニメーション用フック
export const useConditionalAnimation = <T extends HTMLElement>(
  condition: boolean,
  trueAnimation: (element: T) => gsap.core.Timeline,
  falseAnimation?: (element: T) => gsap.core.Timeline
) => {
  const ref = useAnimationRef<T>();
  
  useEffect(() => {
    if (ref.current) {
      if (condition) {
        trueAnimation(ref.current);
      } else if (falseAnimation) {
        falseAnimation(ref.current);
      }
    }
  }, [condition, trueAnimation, falseAnimation]);
  
  return ref;
};

// 回答カード順次公開アニメーション用フック
export const useAnswerReveal = <T extends HTMLElement>() => {
  const containerRef = useAnimationRef<T>();
  
  const revealAnswers = (selector: string = '.answer-card', startDelay = 1.0, stagger = 0.3) => {
    if (containerRef.current) {
      const cards = containerRef.current.querySelectorAll(selector) as NodeListOf<HTMLElement>;
      return animateRevealAnswers(Array.from(cards), startDelay, stagger);
    }
  };
  
  return { containerRef, revealAnswers };
};

// ボタンプレスアニメーション用フック
export const useButtonPress = <T extends HTMLElement>() => {
  const ref = useAnimationRef<T>();
  
  const handlePress = () => {
    if (ref.current) {
      return animateButtonPress(ref.current);
    }
  };
  
  return { ref, handlePress };
};

// カードタップアニメーション用フック
export const useCardTap = <T extends HTMLElement>() => {
  const ref = useAnimationRef<T>();
  
  const handleTap = () => {
    if (ref.current) {
      return animateCardTap(ref.current);
    }
  };
  
  return { ref, handleTap };
};

// ホバーエフェクト用フック
export const useHoverEffect = <T extends HTMLElement>() => {
  const ref = useAnimationRef<T>();
  
  const handleMouseEnter = () => {
    if (ref.current) {
      return animateHover(ref.current, true);
    }
  };
  
  const handleMouseLeave = () => {
    if (ref.current) {
      return animateHover(ref.current, false);
    }
  };
  
  return { ref, handleMouseEnter, handleMouseLeave };
};
