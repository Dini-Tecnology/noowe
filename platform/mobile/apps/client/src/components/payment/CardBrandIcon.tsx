import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { CARD_BRAND_SVG, type CardBrandKey } from './cardBrandSvgs';

const ASPECT = 500 / 780;

/** "Visa •••• 4242" -> "visa". Falls back to the generic card artwork. */
export function cardBrandFromLabel(label: string | null | undefined): CardBrandKey {
  const first = (label ?? '').trim().split(/\s+/)[0]?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') ?? '';
  const aliases: Record<string, CardBrandKey> = {
    visa: 'visa',
    mastercard: 'mastercard',
    master: 'mastercard',
    amex: 'amex',
    americanexpress: 'amex',
    elo: 'elo',
    hipercard: 'hipercard',
    hiper: 'hipercard',
    diners: 'diners',
  };
  return aliases[first] ?? 'generic';
}

export function CardBrandIcon({ brand, width = 40 }: { brand: string | null | undefined; width?: number }) {
  const key = (brand && brand in CARD_BRAND_SVG ? brand : cardBrandFromLabel(brand)) as CardBrandKey;
  const height = Math.round(width * ASPECT);
  return (
    <View style={[styles.frame, { width, height, borderRadius: Math.max(3, Math.round(width * 0.1)) }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <SvgXml xml={CARD_BRAND_SVG[key]} width={width} height={height} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.12)' },
});
