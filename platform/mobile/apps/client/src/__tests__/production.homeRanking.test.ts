import { distanceKm } from '../screens/production/shared';
import {
  NO_RATING_LABEL,
  formatRating,
  formatRatingWithCount,
  hasRating,
  pickFeatured,
} from '../screens/production/home-restaurant-ui';

const SE_PAULO = { latitude: -23.5613, longitude: -46.6565 };

function candidate(
  id: string,
  rating: number,
  totalReviews: number,
  lat: number | null = null,
  lng: number | null = null,
) {
  return { id, rating, totalReviews, lat, lng };
}

describe('avaliação ausente não é nota zero', () => {
  it('escreve "Sem avaliação" quando ninguém avaliou', () => {
    expect(formatRating(0, 0)).toBe(NO_RATING_LABEL);
    expect(formatRatingWithCount(0, 0)).toBe(NO_RATING_LABEL);
    expect(hasRating(0, 0)).toBe(false);
  });

  it('trata nota zero com zero avaliações como ausência, não como nota', () => {
    expect(formatRating(0, 5)).toBe(NO_RATING_LABEL);
    expect(formatRating(4.55, 0)).toBe(NO_RATING_LABEL);
  });

  it('mostra a nota quando ela existe', () => {
    expect(formatRating(4.6, 120)).toBe('4.6');
    expect(formatRatingWithCount(4.6, 120)).toBe('4.6 (120)');
    expect(hasRating(4.6, 120)).toBe(true);
  });
});

describe('destaque da home: mais próximo com a melhor avaliação', () => {
  it('prefere o mais próximo quando as avaliações empatam', () => {
    const perto = candidate('perto', 4.5, 10, -23.5620, -46.6570);
    const longe = candidate('longe', 4.5, 10, -23.6500, -46.7500);

    expect(pickFeatured([longe, perto], SE_PAULO, distanceKm)?.id).toBe('perto');
  });

  it('prefere o melhor avaliado quando a distância empata', () => {
    const bom = candidate('bom', 4.9, 40, -23.5620, -46.6570);
    const fraco = candidate('fraco', 3.1, 40, -23.5620, -46.6570);

    expect(pickFeatured([fraco, bom], SE_PAULO, distanceKm)?.id).toBe('bom');
  });

  it('não deixa um vizinho sem avaliação ganhar de um bem avaliado igualmente perto', () => {
    const semNota = candidate('sem-nota', 0, 0, -23.5615, -46.6566);
    const avaliado = candidate('avaliado', 4.8, 90, -23.5615, -46.6566);

    expect(pickFeatured([semNota, avaliado], SE_PAULO, distanceKm)?.id).toBe('avaliado');
  });

  it('combina os dois critérios: nota alta vence distância pequena', () => {
    // 300m de diferença não compensa 1.8 ponto de nota.
    const pertoRuim = candidate('perto-ruim', 3.0, 20, -23.5615, -46.6566);
    const logoAliOtimo = candidate('logo-ali-otimo', 4.8, 20, -23.5640, -46.6590);

    expect(pickFeatured([pertoRuim, logoAliOtimo], SE_PAULO, distanceKm)?.id).toBe('logo-ali-otimo');
  });

  it('decide só pela avaliação quando não há localização do usuário', () => {
    const a = candidate('a', 4.2, 10, -23.5620, -46.6570);
    const b = candidate('b', 4.9, 10, -23.9000, -46.9000);

    expect(pickFeatured([a, b], null, distanceKm)?.id).toBe('b');
  });

  it('não quebra com restaurante sem coordenada', () => {
    const semCoord = candidate('sem-coord', 5, 100);
    const comCoord = candidate('com-coord', 4.0, 100, -23.5615, -46.6566);

    expect(pickFeatured([semCoord, comCoord], SE_PAULO, distanceKm)?.id).toBeDefined();
  });

  it('é estável: a mesma lista devolve sempre o mesmo destaque', () => {
    const lista = [
      candidate('a', 4.5, 10, -23.5620, -46.6570),
      candidate('b', 4.5, 10, -23.5621, -46.6571),
      candidate('c', 4.5, 10, -23.5622, -46.6572),
    ];
    const primeiro = pickFeatured(lista, SE_PAULO, distanceKm)?.id;
    for (let i = 0; i < 5; i += 1) {
      expect(pickFeatured(lista, SE_PAULO, distanceKm)?.id).toBe(primeiro);
    }
  });

  it('devolve undefined para lista vazia', () => {
    expect(pickFeatured([], SE_PAULO, distanceKm)).toBeUndefined();
  });
});
