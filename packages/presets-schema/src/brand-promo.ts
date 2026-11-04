import type { BrandPreset } from "./types";
import { PLACEHOLDER } from "./types";

export interface PromoText {
  path: string;
  text: string;
}

/** 브랜드 전면 홍보 문구(표면 brand_promo)에 해당하는 필드. 자리표시자는 검사 대상이 아니다. */
export function brandPromoTexts(brand: BrandPreset): PromoText[] {
  return [
    { path: "brand.name", text: brand.name },
    { path: "brand.concept", text: brand.concept },
    { path: "brand.core_sentence", text: brand.core_sentence },
  ].filter((t) => t.text !== PLACEHOLDER);
}
