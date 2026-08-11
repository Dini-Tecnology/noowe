import { NativeModules } from 'react-native';

type FirebaseAnalyticsFn = () => {
  logEvent: (name: string, params?: { [key: string]: any }) => Promise<void>;
  logScreenView: (params: { screen_name: string; screen_class?: string }) => Promise<void>;
  setUserId: (id: string | null) => Promise<void>;
  setUserProperties: (properties: { [key: string]: string }) => Promise<void>;
};

let firebaseAnalyticsModule: FirebaseAnalyticsFn | null | undefined;

function getFirebaseAnalytics(): FirebaseAnalyticsFn | null {
  if (firebaseAnalyticsModule !== undefined) {
    return firebaseAnalyticsModule;
  }
  if (!(NativeModules as Record<string, unknown>)?.RNFBAppModule) {
    firebaseAnalyticsModule = null;
    return null;
  }
  try {
    firebaseAnalyticsModule =
      require('@react-native-firebase/analytics').default as FirebaseAnalyticsFn;
    return firebaseAnalyticsModule;
  } catch {
    firebaseAnalyticsModule = null;
    return null;
  }
}

/**
 * Firebase Analytics Service
 * Tracks user events and screen views across the mobile app
 */
class AnalyticsService {
  /**
   * Log a custom event
   * @param eventName - Name of the event
   * @param params - Event parameters
   */
  async logEvent(eventName: string, params?: { [key: string]: any }) {
    const analytics = getFirebaseAnalytics();
    if (!analytics) return;
    try {
      await analytics().logEvent(eventName, params);
    } catch (error) {
      console.error('Analytics error:', error);
    }
  }

  /**
   * Log screen view
   * @param screenName - Name of the screen
   * @param screenClass - Class/component name of the screen
   */
  async logScreenView(screenName: string, screenClass?: string) {
    const analytics = getFirebaseAnalytics();
    if (!analytics) return;
    try {
      await analytics().logScreenView({
        screen_name: screenName,
        screen_class: screenClass || screenName,
      });
    } catch (error) {
      console.error('Analytics screen view error:', error);
    }
  }

  /**
   * Set user ID for analytics
   * @param userId - Unique user identifier
   */
  async setUserId(userId: string | null) {
    const analytics = getFirebaseAnalytics();
    if (!analytics) return;
    try {
      await analytics().setUserId(userId);
    } catch (error) {
      console.error('Analytics set user ID error:', error);
    }
  }

  /**
   * Set user properties
   * @param properties - User properties object
   */
  async setUserProperties(properties: { [key: string]: string }) {
    const analytics = getFirebaseAnalytics();
    if (!analytics) return;
    try {
      await analytics().setUserProperties(properties);
    } catch (error) {
      console.error('Analytics set user properties error:', error);
    }
  }

  /**
   * Log login event
   * @param method - Login method (email, google, apple, etc.)
   */
  async logLogin(method: string) {
    await this.logEvent('login', { method });
  }

  /**
   * Log signup event
   * @param method - Signup method
   */
  async logSignUp(method: string) {
    await this.logEvent('sign_up', { method });
  }

  /**
   * Log restaurant view
   * @param restaurantId - Restaurant ID
   * @param restaurantName - Restaurant name
   */
  async logRestaurantView(restaurantId: string, restaurantName: string) {
    await this.logEvent('view_restaurant', {
      restaurant_id: restaurantId,
      restaurant_name: restaurantName,
    });
  }

  /**
   * Log menu item view
   * @param menuItemId - Menu item ID
   * @param menuItemName - Menu item name
   * @param price - Item price
   */
  async logMenuItemView(menuItemId: string, menuItemName: string, price: number) {
    await this.logEvent('view_item', {
      item_id: menuItemId,
      item_name: menuItemName,
      price,
    });
  }

  /**
   * Log add to cart
   * @param menuItemId - Menu item ID
   * @param menuItemName - Menu item name
   * @param price - Item price
   * @param quantity - Quantity added
   */
  async logAddToCart(
    menuItemId: string,
    menuItemName: string,
    price: number,
    quantity: number,
  ) {
    await this.logEvent('add_to_cart', {
      item_id: menuItemId,
      item_name: menuItemName,
      price,
      quantity,
      value: price * quantity,
    });
  }

  /**
   * Log order placement
   * @param orderId - Order ID
   * @param value - Order total value
   * @param currency - Currency code
   */
  async logPurchase(orderId: string, value: number, currency: string = 'BRL') {
    await this.logEvent('purchase', {
      transaction_id: orderId,
      value,
      currency,
    });
  }

  /**
   * Log reservation creation
   * @param reservationId - Reservation ID
   * @param restaurantId - Restaurant ID
   * @param partySize - Number of guests
   */
  async logReservation(
    reservationId: string,
    restaurantId: string,
    partySize: number,
  ) {
    await this.logEvent('make_reservation', {
      reservation_id: reservationId,
      restaurant_id: restaurantId,
      party_size: partySize,
    });
  }

  /**
   * Log search
   * @param searchTerm - Search query
   * @param searchType - Type of search (restaurant, menu_item, etc.)
   */
  async logSearch(searchTerm: string, searchType: string = 'general') {
    await this.logEvent('search', {
      search_term: searchTerm,
      search_type: searchType,
    });
  }

  /**
   * Log review submission
   * @param restaurantId - Restaurant ID
   * @param rating - Rating value
   */
  async logReview(restaurantId: string, rating: number) {
    await this.logEvent('submit_review', {
      restaurant_id: restaurantId,
      rating,
    });
  }

  /**
   * Log payment method addition
   * @param paymentType - Type of payment method
   */
  async logAddPaymentMethod(paymentType: string) {
    await this.logEvent('add_payment_info', {
      payment_type: paymentType,
    });
  }

  /**
   * Log QR code scan
   * @param qrType - Type of QR code (table, menu, payment)
   * @param restaurantId - Restaurant ID
   */
  async logQRScan(qrType: string, restaurantId: string) {
    await this.logEvent('scan_qr_code', {
      qr_type: qrType,
      restaurant_id: restaurantId,
    });
  }

  /**
   * Log share action
   * @param contentType - Type of content shared
   * @param itemId - ID of shared item
   */
  async logShare(contentType: string, itemId: string) {
    await this.logEvent('share', {
      content_type: contentType,
      item_id: itemId,
    });
  }

  /**
   * Log error event
   * @param errorMessage - Error message
   * @param errorCode - Error code
   * @param fatal - Whether error is fatal
   */
  async logError(errorMessage: string, errorCode?: string, fatal: boolean = false) {
    await this.logEvent('app_error', {
      error_message: errorMessage,
      error_code: errorCode,
      fatal,
    });
  }
}

export default new AnalyticsService();
