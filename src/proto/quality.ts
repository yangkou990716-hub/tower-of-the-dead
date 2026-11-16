// 視覺原型的三級畫質（對應 docs/architecture-review.md「畫質分級」）。
export type Tier = 'high' | 'balanced' | 'perf';
export interface TierCfg {
  name: string;
  pr: number;        // 解析度倍率上限（不超過裝置本身）
  shadow: number;    // 主光陰影貼圖大小；0 = 關（改用貼地假影）
  soft: boolean;     // 柔邊陰影
  lights: number;    // 無陰影點光源數
  bloom: number;     // 0 關；否則為 Bloom 取樣倍率（0.5 = 半解析度，0.25 = 低取樣）
  ao: boolean;       // SSAO（GTAO，半解析度）
  particles: number; // 粒子比例
  cap: number;       // 幀率上限
}
export const TIERS: Record<Tier, TierCfg> = {
  high: { name: '高', pr: 2, shadow: 1024, soft: true, lights: 12, bloom: 0.5, ao: true, particles: 1, cap: 60 },
  balanced: { name: '平衡', pr: 1.5, shadow: 512, soft: false, lights: 8, bloom: 0.25, ao: false, particles: 0.6, cap: 60 },
  perf: { name: '效能', pr: 1, shadow: 0, soft: false, lights: 4, bloom: 0, ao: false, particles: 0.3, cap: 30 },
};
export const TIER_ORDER: Tier[] = ['high', 'balanced', 'perf'];
export const lowerTier = (t: Tier): Tier | null => TIER_ORDER[TIER_ORDER.indexOf(t) + 1] ?? null;
