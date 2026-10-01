import { renderHook } from '@testing-library/react-hooks';
import { useAnalytics } from '../useAnalytics';
import analytics from '@react-native-firebase/analytics';

jest.mock('@react-native-firebase/analytics');

describe('useAnalytics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should provide logEvent function', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.logEvent).toBeDefined();
    expect(typeof result.current.logEvent).toBe('function');
  });

  it('should log custom events', async () => {
    const { result } = renderHook(() => useAnalytics());
    const mockLogEvent = jest.fn();
    (analytics as unknown as jest.Mock).mockReturnValue({
      logEvent: mockLogEvent,
    });

    await result.current.logEvent('test_event', { param1: 'value1' });

    expect(mockLogEvent).toHaveBeenCalledWith('test_event', { param1: 'value1' });
  });

  it('should provide logLogin function', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.logLogin).toBeDefined();
    expect(typeof result.current.logLogin).toBe('function');
  });

  it('should log login events', async () => {
    const { result } = renderHook(() => useAnalytics());
    const mockLogLogin = jest.fn();
    (analytics as unknown as jest.Mock).mockReturnValue({
      logLogin: mockLogLogin,
    });

    await result.current.logLogin('email');

    expect(mockLogLogin).toHaveBeenCalledWith({ method: 'email' });
  });

  it('should provide logSignUp function', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.logSignUp).toBeDefined();
    expect(typeof result.current.logSignUp).toBe('function');
  });

  it('should log sign up events', async () => {
    const { result } = renderHook(() => useAnalytics());
    const mockLogSignUp = jest.fn();
    (analytics as unknown as jest.Mock).mockReturnValue({
      logSignUp: mockLogSignUp,
    });

    await result.current.logSignUp('email');

    expect(mockLogSignUp).toHaveBeenCalledWith({ method: 'email' });
  });

  it('should provide logPurchase function', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.logPurchase).toBeDefined();
    expect(typeof result.current.logPurchase).toBe('function');
  });

  it('should log purchase events', async () => {
    const { result } = renderHook(() => useAnalytics());
    const mockLogPurchase = jest.fn();
    (analytics as unknown as jest.Mock).mockReturnValue({
      logPurchase: mockLogPurchase,
    });

    await result.current.logPurchase('order-123', 99.99, 'BRL');

    expect(mockLogPurchase).toHaveBeenCalledWith({
      transaction_id: 'order-123',
      value: 99.99,
      currency: 'BRL',
    });
  });

  it('should provide logAddToCart function', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.logAddToCart).toBeDefined();
    expect(typeof result.current.logAddToCart).toBe('function');
  });

  it('should log add to cart events', async () => {
    const { result } = renderHook(() => useAnalytics());
    const mockLogAddToCart = jest.fn();
    (analytics as unknown as jest.Mock).mockReturnValue({
      logAddToCart: mockLogAddToCart,
    });

    await result.current.logAddToCart('item-123', 'Test Item', 19.99, 2);

    expect(mockLogAddToCart).toHaveBeenCalledWith({
      item_id: 'item-123',
      item_name: 'Test Item',
      price: 19.99,
      quantity: 2,
    });
  });

  it('should provide logSearch function', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.logSearch).toBeDefined();
    expect(typeof result.current.logSearch).toBe('function');
  });

  it('should log search events', async () => {
    const { result} = renderHook(() => useAnalytics());
    const mockLogSearch = jest.fn();
    (analytics as unknown as jest.Mock).mockReturnValue({
      logSearch: mockLogSearch,
    });

    await result.current.logSearch('pizza', 'menu_item');

    expect(mockLogSearch).toHaveBeenCalledWith({
      search_term: 'pizza',
      search_type: 'menu_item',
    });
  });

  it('should provide logError function', () => {
    const { result } = renderHook(() => useAnalytics());

    expect(result.current.logError).toBeDefined();
    expect(typeof result.current.logError).toBe('function');
  });

  it('should log error events', async () => {
    const { result } = renderHook(() => useAnalytics());
    const mockLogEvent = jest.fn();
    (analytics as unknown as jest.Mock).mockReturnValue({
      logEvent: mockLogEvent,
    });

    await result.current.logError('Test error', 'TEST_ERROR', false);

    expect(mockLogEvent).toHaveBeenCalledWith('error', {
      description: 'Test error',
      error_code: 'TEST_ERROR',
      fatal: false,
    });
  });
});
