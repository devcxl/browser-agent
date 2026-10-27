/**
 * 共享动效预设 —— 全插件统一「克制专业」基调：
 * spring 阻尼适中（stiffness 300 / damping 30），位移小（4-16px），
 * 时长 150-250ms。统一从这里取，避免各组件手调参数风格漂移。
 *
 * 根节点由 App 的 <MotionConfig reducedMotion="user"> 包裹，
 * 系统开启「减弱动效」时自动退化为瞬切。
 */
import type { Transition, Variants } from 'motion/react';

/** 通用 spring：位移类动画的默认过渡 */
export const springSoft: Transition = { type: 'spring', stiffness: 300, damping: 30 };

/** 遮罩/透明度类：用时长而非 spring（纯透明度用 spring 会拖尾） */
export const fadeFast: Transition = { duration: 0.15, ease: 'easeOut' };

/** 弹层卡片：遮罩淡入 + 卡片缩放浮起 */
export const overlayCard: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springSoft },
  exit: { opacity: 0, scale: 0.96, y: 8, transition: { duration: 0.15, ease: 'easeIn' } },
};

/** 遮罩淡入淡出 */
export const overlayBackdrop: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: fadeFast },
  exit: { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

/** 抽屉：左侧滑入滑出 */
export const drawerSlide: Variants = {
  hidden: { x: '-100%' },
  visible: { x: 0, transition: springSoft },
  exit: { x: '-100%', transition: springSoft },
};

/** 列表项/消息气泡入场：轻微上浮 + 淡入 */
export const riseIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: 'easeOut' } },
};

/** 高度展开收起（横幅/提示条） */
export const heightCollapse: Variants = {
  hidden: { height: 0, opacity: 0, overflow: 'hidden' },
  visible: { height: 'auto', opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit: { height: 0, opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

/** 首页建议卡片容器：子项 stagger 渐入 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
};
