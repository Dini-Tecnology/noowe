import {
  getDefaultCustomerExperience,
  getServiceTypeFeatures,
  isSupportedServiceType,
  MVP_SERVICE_TYPES,
} from '../service-types';

describe('service type contract', () => {
  it('accepts exactly the service types supported by both apps', () => {
    expect(MVP_SERVICE_TYPES).toEqual(['fine_dining', 'casual_dining', 'quick_service']);
    expect(isSupportedServiceType('fine_dining')).toBe(true);
    expect(isSupportedServiceType('fast_casual')).toBe(false);
    expect(isSupportedServiceType('')).toBe(false);
  });

  it('keeps table operations out of quick service', () => {
    const features = getServiceTypeFeatures('quick_service');
    expect(features.tableManagement).toBe(false);
    expect(features.callWaiter).toBe(false);
    expect(features.reservations).toBe(false);
    expect(features.ordering).toBe(true);
    expect(features.orderTracking).toBe(true);
  });

  it('enables the table journey for fine and casual dining', () => {
    for (const type of ['fine_dining', 'casual_dining'] as const) {
      const features = getServiceTypeFeatures(type);
      expect(features.reservations).toBe(true);
      expect(features.tableManagement).toBe(true);
      expect(features.callWaiter).toBe(true);
    }
  });

  it('applies restaurant feature and customer journey overrides', () => {
    const features = getServiceTypeFeatures('fine_dining', {
      featureOverrides: { aiPairing: false, splitPayment: true },
      customerExperience: {
        onlineReservations: false,
        tableService: false,
        journeyPayment: false,
      },
    });

    expect(features.reservations).toBe(false);
    expect(features.guestInvitations).toBe(false);
    expect(features.tableManagement).toBe(false);
    expect(features.callWaiter).toBe(false);
    expect(features.aiPairing).toBe(false);
    expect(features.payments).toBe(false);
    expect(features.splitPayment).toBe(false);
  });

  it('provides onboarding defaults that match the selected service type', () => {
    const quick = getDefaultCustomerExperience('quick_service');
    expect(quick.onlineReservations).toBe(false);
    expect(quick.tableService).toBe(false);
    expect(quick.counterService).toBe(true);

    const casual = getDefaultCustomerExperience('casual_dining');
    expect(casual.onlineReservations).toBe(true);
    expect(casual.tableService).toBe(true);
    expect(casual.counterService).toBe(false);
  });
});
