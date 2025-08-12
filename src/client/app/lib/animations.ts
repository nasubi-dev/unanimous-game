import { gsap } from "gsap";

// 基本的なアニメーション設定
export const ANIMATION_CONFIG = {
  // 基本的な持続時間
  duration: {
    fast: 0.3,
    normal: 0.5,
    slow: 0.8,
    countdown: 1.0,
  },
  // イージング
  ease: {
    smooth: "power2.out",
    bounce: "back.out(1.7)",
    elastic: "elastic.out(1, 0.3)",
    sharp: "power4.out",
  },
} as const;

// カウントダウンアニメーション
export const animateCountdown = (element: HTMLElement, number: number) => {
  const tl = gsap.timeline();

  return tl
    .set(element, { scale: 0, opacity: 0 })
    .to(element, {
      scale: 1.5,
      opacity: 1,
      duration: ANIMATION_CONFIG.duration.fast,
      ease: ANIMATION_CONFIG.ease.bounce,
    })
    .to(element, {
      scale: 1,
      duration: ANIMATION_CONFIG.duration.fast,
      ease: ANIMATION_CONFIG.ease.smooth,
    });
};

// ラウンド結果発表アニメーション
export const animateRoundResult = (
  container: HTMLElement,
  isUnanimous: boolean
) => {
  const tl = gsap.timeline();

  // コンテナを準備
  tl.set(container, { opacity: 0, y: 50 });

  // フェードイン
  tl.to(container, {
    opacity: 1,
    y: 0,
    duration: ANIMATION_CONFIG.duration.normal,
    ease: ANIMATION_CONFIG.ease.smooth,
  });

  if (isUnanimous) {
    // 全員一致の場合の特別なエフェクト
    tl.to(
      container,
      {
        scale: 1.1,
        duration: ANIMATION_CONFIG.duration.fast,
        ease: ANIMATION_CONFIG.ease.bounce,
        yoyo: true,
        repeat: 1,
      },
      "+=0.2"
    );
  }

  return tl;
};

// 勝利エフェクトアニメーション
export const animateVictoryEffect = (container: HTMLElement) => {
  const tl = gsap.timeline();

  // 勝利コンテナの登場（下から出現）
  tl.fromTo(
    container,
    {
      opacity: 0,
      scale: 1,
      y: 100, // 下から出現
    },
    {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: ANIMATION_CONFIG.duration.slow,
      ease: ANIMATION_CONFIG.ease.bounce,
    }
  );

  return tl;
};

// 紙吹雪アニメーション（モーダル背面）
export const animateVictoryConfetti = (container: HTMLElement, durationSec = 3) => {
  const colors = ["#a78bfa", "#34d399", "#fbbf24", "#60a5fa", "#f472b6"]; // violet/green/amber/blue/pink
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;
  const count = Math.min(80, Math.max(40, Math.floor(width / 15))); // 画面幅で粒数調整

  // 生成
  const pieces: HTMLDivElement[] = [];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.style.position = "absolute";
    el.style.top = "-10px";
    el.style.left = Math.random() * width + "px";
    el.style.width = 6 + Math.random() * 6 + "px";
    el.style.height = 10 + Math.random() * 10 + "px";
    el.style.backgroundColor = colors[i % colors.length];
    el.style.opacity = "0.9";
    el.style.borderRadius = "2px";
    el.style.willChange = "transform, opacity";
    container.appendChild(el);
    pieces.push(el);
  }

  // 落下アニメーション
  const tl = gsap.timeline({ onComplete: () => {
    pieces.forEach(p => p.remove());
  }});

  pieces.forEach((p) => {
    const fallDuration = durationSec + Math.random() * 1.5;
    const endY = height + 50 + Math.random() * 100;
    const driftX = (Math.random() - 0.5) * 200;
    const rotate = (Math.random() - 0.5) * 720;
    tl.add(gsap.fromTo(
      p,
      { y: -20, x: parseFloat(p.style.left), rotation: 0, opacity: 1 },
      { y: endY, x: "+=" + driftX, rotation: rotate, opacity: 0.9, duration: fallDuration, ease: "sine.in" }
    ), 0);
  });

  return tl;
};

// 敗北シェイク（モーダル）
export const animateDefeatShake = (element: HTMLElement) => {
  const tl = gsap.timeline();
  tl.to(element, { x: -6, duration: 0.05 })
    .to(element, { x: 6, duration: 0.05 })
    .to(element, { x: -4, duration: 0.05 })
    .to(element, { x: 4, duration: 0.05 })
    .to(element, { x: 0, duration: 0.06 });
  return tl;
};

// 回答状況フィードバックアニメーション
export const animateAnswerFeedback = (
  element: HTMLElement,
  type: "submitted" | "waiting"
) => {
  const tl = gsap.timeline();

  if (type === "submitted") {
    // 提出済みの場合
    tl.to(element, {
      scale: 1.1,
      backgroundColor: "#10b981", // green-500
      duration: ANIMATION_CONFIG.duration.fast,
      ease: ANIMATION_CONFIG.ease.bounce,
    }).to(element, {
      scale: 1,
      duration: ANIMATION_CONFIG.duration.fast,
      ease: ANIMATION_CONFIG.ease.smooth,
    });
  } else {
    // 待機中の場合（パルスエフェクト）
    tl.to(element, {
      opacity: 0.5,
      duration: ANIMATION_CONFIG.duration.normal,
      ease: ANIMATION_CONFIG.ease.smooth,
      yoyo: true,
      repeat: -1,
    });
  }

  return tl;
};

// フェードイン・フェードアウトユーティリティ
export const fadeIn = (
  element: HTMLElement,
  duration = ANIMATION_CONFIG.duration.normal
) => {
  return gsap.fromTo(
    element,
    { opacity: 0, y: 20 },
    { opacity: 1, y: 0, duration, ease: ANIMATION_CONFIG.ease.smooth }
  );
};

export const fadeOut = (
  element: HTMLElement,
  duration = ANIMATION_CONFIG.duration.normal
) => {
  return gsap.to(element, {
    opacity: 0,
    y: -20,
    duration,
    ease: ANIMATION_CONFIG.ease.smooth,
  });
};

// スライドイン・スライドアウトユーティリティ
export const slideInFromRight = (
  element: HTMLElement,
  duration = ANIMATION_CONFIG.duration.normal
) => {
  return gsap.fromTo(
    element,
    { x: 100, opacity: 0 },
    { x: 0, opacity: 1, duration, ease: ANIMATION_CONFIG.ease.smooth }
  );
};

export const slideOutToLeft = (
  element: HTMLElement,
  duration = ANIMATION_CONFIG.duration.normal
) => {
  return gsap.to(element, {
    x: -100,
    opacity: 0,
    duration,
    ease: ANIMATION_CONFIG.ease.smooth,
  });
};

// スケールアニメーションユーティリティ
export const scaleIn = (
  element: HTMLElement,
  duration = ANIMATION_CONFIG.duration.normal
) => {
  return gsap.fromTo(
    element,
    { scale: 0, opacity: 0 },
    { scale: 1, opacity: 1, duration, ease: ANIMATION_CONFIG.ease.bounce }
  );
};

export const scaleOut = (
  element: HTMLElement,
  duration = ANIMATION_CONFIG.duration.normal
) => {
  return gsap.to(element, {
    scale: 0,
    opacity: 0,
    duration,
    ease: ANIMATION_CONFIG.ease.smooth,
  });
};

// リストアイテムのアニメーション（順次表示）
export const animateListItems = (elements: HTMLElement[], stagger = 0.1) => {
  return gsap.fromTo(
    elements,
    { opacity: 0, y: 30 },
    {
      opacity: 1,
      y: 0,
      duration: ANIMATION_CONFIG.duration.normal,
      ease: ANIMATION_CONFIG.ease.smooth,
      stagger: stagger,
    }
  );
};

// ボタンクリック時のアニメーション
export const animateButtonPress = (element: HTMLElement) => {
  const tl = gsap.timeline();

  return tl
    .to(element, {
      scale: 0.95,
      duration: ANIMATION_CONFIG.duration.fast / 2,
      ease: ANIMATION_CONFIG.ease.sharp,
    })
    .to(element, {
      scale: 1,
      duration: ANIMATION_CONFIG.duration.fast,
      ease: ANIMATION_CONFIG.ease.bounce,
    });
};

// カードタップ時の微弱なアニメーション
export const animateCardTap = (element: HTMLElement) => {
  const tl = gsap.timeline();

  return tl
    .to(element, {
      scale: 0.98,
      duration: ANIMATION_CONFIG.duration.fast / 3,
      ease: ANIMATION_CONFIG.ease.smooth,
    })
    .to(element, {
      scale: 1,
      duration: ANIMATION_CONFIG.duration.fast,
      ease: ANIMATION_CONFIG.ease.smooth,
    });
};

// ホバーエフェクト（マウスオーバー時）
export const animateHover = (element: HTMLElement, isEntering: boolean) => {
  return gsap.to(element, {
    scale: isEntering ? 1.05 : 1,
    y: isEntering ? -2 : 0,
    duration: ANIMATION_CONFIG.duration.fast,
    ease: ANIMATION_CONFIG.ease.smooth,
  });
};

// カードフリップアニメーション（一つずつ表示）
export const animateCardFlip = (element: HTMLElement, delay = 0) => {
  const tl = gsap.timeline({ delay });

  // 初期状態: Y軸で180度回転して非表示
  tl.set(element, {
    opacity: 0,
    rotationY: -180,
    transformPerspective: 1000,
    transformStyle: "preserve-3d",
  })

    // Y軸でフリップして表面を表示
    .to(element, {
      opacity: 1,
      rotationY: 0,
      duration: ANIMATION_CONFIG.duration.normal * 1.2, // 少し長めに
      ease: ANIMATION_CONFIG.ease.bounce,
    });

  return tl;
};

// 回答結果の順次表示アニメーション
export const animateRevealAnswers = (
  elements: HTMLElement[],
  startDelay = 1.0,
  stagger = 0.3
) => {
  const tl = gsap.timeline({ delay: startDelay });

  elements.forEach((element, index) => {
    tl.add(animateCardFlip(element, index * stagger), 0);
  });

  return tl;
};
