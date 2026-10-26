import { CommonActions } from '@react-navigation/native';
import { enterComanda, goToComanda, isExperienceRoute, openInComanda } from '../navigation/comanda';

const mainRoute = { name: 'Main', key: 'Main-1', state: { index: 2 } };

function stackNav(extraRoutes: { name: string }[] = []) {
  const dispatch = jest.fn();
  const nav: any = {
    dispatch,
    getParent: () => undefined,
    getState: () => ({ routeNames: ['Main', 'Cart', 'Menu', 'Restaurant'], routes: [mainRoute, ...extraRoutes] }),
  };
  return { nav, dispatch };
}

describe('navegação da comanda (ADR-021)', () => {
  it('goToComanda deixa a pilha em [Main, Cart], sem a página do restaurante', () => {
    const { nav, dispatch } = stackNav([{ name: 'Restaurant' }, { name: 'Menu' }]);
    goToComanda(nav);
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({ index: 1, routes: [mainRoute, { name: 'Cart' }] }),
    );
  });

  it('openInComanda deixa a pilha em [Main, Cart, filha] para o voltar cair na comanda', () => {
    const { nav, dispatch } = stackNav();
    openInComanda(nav, 'Menu', { restaurantId: 'r1' });
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({ index: 2, routes: [mainRoute, { name: 'Cart' }, { name: 'Menu', params: { restaurantId: 'r1' } }] }),
    );
  });

  it('enterComanda passa pelas boas-vindas', () => {
    const { nav, dispatch } = stackNav();
    enterComanda(nav);
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.reset({ index: 1, routes: [mainRoute, { name: 'TableWelcome' }] }),
    );
  });

  it('chamado de dentro das abas, sobe até a pilha que conhece a comanda', () => {
    const { nav: stack, dispatch } = stackNav();
    const tabs: any = {
      dispatch: jest.fn(),
      getState: () => ({ routeNames: ['Home', 'Wallet', 'Orders', 'Profile'], routes: [] }),
      getParent: () => stack,
    };
    goToComanda(tabs);
    expect(tabs.dispatch).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('as telas da experiência não mostram a barra; Home e restaurante mostram', () => {
    for (const name of ['Cart', 'Menu', 'OrderDetail', 'CallWaiter', 'FecharConta', 'SplitBill', 'TableWelcome']) {
      expect(isExperienceRoute(name)).toBe(true);
    }
    for (const name of ['Main', 'Restaurant', 'Notifications', 'Waitlist']) {
      expect(isExperienceRoute(name)).toBe(false);
    }
  });
});
