import { extractCouponLink, classifyQrPayload } from '../hooks/qr-payload';

const RESTAURANT = 'c1000000-0000-4000-8000-000000000002';

describe('link e QR de cupom (P3)', () => {
  it('lê restaurante e código', () => {
    expect(extractCouponLink(`https://noowebr.com/c/${RESTAURANT}/DEZ`)).toEqual({ restaurantId: RESTAURANT, code: 'DEZ' });
    expect(extractCouponLink(`https://noowebr.com/c/${RESTAURANT}/TER%C3%87A10`)).toEqual({ restaurantId: RESTAURANT, code: 'TERÇA10' });
  });

  it('recusa o que não é da NOOWE, e não vira QR de mesa', () => {
    expect(extractCouponLink(`https://outro.com/c/${RESTAURANT}/DEZ`)).toBeNull();
    expect(extractCouponLink('https://noowebr.com/c/abc/DEZ')).toBeNull();
    expect(extractCouponLink(`https://noowebr.com/c/${RESTAURANT}/%E0%A4%A`)).toBeNull();
    expect(classifyQrPayload(`https://noowebr.com/c/${RESTAURANT}/DEZ`)).toBeNull();
  });
});
