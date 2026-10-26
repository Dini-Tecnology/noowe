import { CommonActions } from '@react-navigation/native';

/** A comanda (ADR-021) é a rota `Cart`: lá ela vira a comanda por pessoa ou a conta da mesa. */
export const COMANDA_ROUTE = 'Cart';

/**
 * Telas "filhas" da comanda: abertas a partir dela e com o "voltar" levando de volta a ela.
 * Fora desta lista (Home, carteira, perfil, página do restaurante...) o app mostra a barra
 * "Voltar à comanda" enquanto houver mesa ativa.
 */
export const EXPERIENCE_ROUTES: readonly string[] = [
  COMANDA_ROUTE,
  'Menu',
  'ComboBuilder',
  'OrderDetail',
  'CallWaiter',
  'FecharConta',
  'SplitBill',
  'TipPayment',
  'SharePayment',
  'Harmonizacao',
  'ModoFamilia',
  'KidsActivities',
  'PaymentSuccess',
  'TableWelcome',
  'QrScanner',
];

export const isExperienceRoute = (routeName: string | undefined) =>
  !!routeName && EXPERIENCE_ROUTES.includes(routeName);

type NavigationLike = {
  dispatch: (action: any) => void;
  getParent?: () => NavigationLike | undefined;
  getState?: () => { routeNames?: string[]; routes: { name: string; key?: string }[] };
};

/**
 * A pilha raiz é a que conhece a rota da comanda. Chamado de dentro das abas, um `reset` iria para
 * o navegador de abas; sobe-se até a pilha dona de `Cart`.
 */
function rootStack(navigation: NavigationLike): NavigationLike {
  let current: NavigationLike | undefined = navigation;
  while (current) {
    if (current.getState?.().routeNames?.includes(COMANDA_ROUTE)) return current;
    current = current.getParent?.();
  }
  return navigation;
}

function resetTo(navigation: NavigationLike, ...above: { name: string; params?: object }[]) {
  const stack = rootStack(navigation);
  // Mantém a rota Main existente (com o estado das abas); só as telas por cima mudam.
  const main = stack.getState?.().routes.find((route) => route.name === 'Main') ?? { name: 'Main' };
  stack.dispatch(CommonActions.reset({ index: above.length, routes: [main, ...above] }));
}

/** Leva à comanda; a pilha vira [Main, Cart]: o "voltar" da comanda é a Home, nunca o restaurante. */
export function goToComanda(navigation: NavigationLike) {
  resetTo(navigation, { name: COMANDA_ROUTE });
}

/** Abre uma tela filha da comanda: a pilha vira [Main, Cart, filha] e o "voltar" cai na comanda. */
export function openInComanda(navigation: NavigationLike, child: string, params?: object) {
  resetTo(navigation, { name: COMANDA_ROUTE }, { name: child, params });
}

/** Porta de entrada concluída (QR, convite, aprovação, fila): boas-vindas e, em seguida, a comanda. */
export function enterComanda(navigation: NavigationLike) {
  resetTo(navigation, { name: 'TableWelcome' });
}
