import { clientFeaturesFromCapabilities, parseRestaurantCapabilityContract } from '../capabilities';

const serverContract = {
  contractVersion: 2,
  enabledServiceModels: ['quick_service'],
  serviceModel: 'quick_service',
  capabilities: {
    contractVersion: 2,
    reservations: false, reservationRequired: false, virtualQueue: false, queueIsPrimaryEntry: false,
    orderWhileWaiting: false, tableSession: false, tableCheckIn: false, tableQr: false, counterQr: true,
    guestLink: false, userInvite: false, splitBill: false, splitModes: [],
    serviceFee: false, staffCalls: false, familyMode: false, parties: false,
    staffCallTypes: [], comboBuilder: true, prepaidRequired: true, orderAhead: true, pickupCode: true,
    pickupSlots: true, qualityCheck: true, loyaltyMode: 'stamps',
    consumptionUnit: 'individual_cart', orderTracking: 'pickup_steps',
  },
  policies: {
    serviceFeeBps: null, tipPresetsBps: [], queueCallToleranceMin: null,
    reservationNoShowMin: null, guestLinkTtlMin: null, userInviteTtlMin: null, userSearchMinChars: null, capacityRequestTtlMin: null, requireGuestAccount: false,
    enforceTableCapacity: false, capacityOverrideRoles: [], splitFixedRemainder: null,
    tipAllocation: null, comboDiscountBps: 2000, pickupCapacityPerSlot: 12,
    pickupExpiryMin: 30, stampsPerReward: 10,
    noPickupPolicy: 'none', acceptMode: 'auto', acceptTimeoutMin: 5, ordersPaused: false,
    defaultPrepMin: 10, closeOrdersBeforeMin: 15, pixExpiryMin: 15, distanceWarningKm: 2,
    pickupLocation: 'Balcão 3',
  },
};

describe('restaurant capability contract', () => {
  it('accepts a complete contract from the server', () => {
    expect(parseRestaurantCapabilityContract(serverContract)).toEqual(serverContract);
  });

  it('tolera um servidor anterior à jornada Quick (ADR-013) sem os campos novos', () => {
    const { orderAhead: _a, ...oldCapabilities } = serverContract.capabilities;
    const {
      noPickupPolicy: _n, acceptMode: _m, acceptTimeoutMin: _t, ordersPaused: _p, defaultPrepMin: _d,
      closeOrdersBeforeMin: _c, pixExpiryMin: _x, distanceWarningKm: _k, pickupLocation: _l, ...oldPolicies
    } = serverContract.policies;
    const parsed = parseRestaurantCapabilityContract({ ...serverContract, capabilities: oldCapabilities, policies: oldPolicies });
    expect(parsed?.capabilities.orderAhead).toBe(false);
    expect(parsed?.policies).toMatchObject({
      noPickupPolicy: null, acceptMode: null, ordersPaused: false, pickupLocation: null, pixExpiryMin: null,
    });
  });

  it('rejeita política de não retirada desconhecida em vez de aceitá-la', () => {
    const parsed = parseRestaurantCapabilityContract({
      ...serverContract, policies: { ...serverContract.policies, noPickupPolicy: 'donate', acceptMode: 'sometimes' },
    });
    expect(parsed?.policies.noPickupPolicy).toBeNull();
    expect(parsed?.policies.acceptMode).toBeNull();
  });

  it('fails closed for malformed capabilities', () => {
    expect(parseRestaurantCapabilityContract({ ...serverContract, capabilities: { ...serverContract.capabilities, pickupCode: 'true' } })).toBeNull();
    expect(parseRestaurantCapabilityContract({ ...serverContract, serviceModel: 'fast_casual' })).toBeNull();
    expect(parseRestaurantCapabilityContract({ ...serverContract, capabilities: { ...serverContract.capabilities, consumptionUnit: 'buffet' } })).toBeNull();
    expect(parseRestaurantCapabilityContract({ ...serverContract, capabilities: { ...serverContract.capabilities, orderTracking: undefined } })).toBeNull();
  });

  it('fails closed when the server predates the @username invite (ADR-011)', () => {
    const { userInvite: _omitted, ...withoutUserInvite } = serverContract.capabilities;
    expect(parseRestaurantCapabilityContract({ ...serverContract, capabilities: withoutUserInvite })).toBeNull();
    expect(parseRestaurantCapabilityContract({ ...serverContract, policies: { ...serverContract.policies, userSearchMinChars: '3' } })).toBeNull();
  });

  it('maps client modules from server capabilities, not model literals', () => {
    const contract = parseRestaurantCapabilityContract(serverContract);
    if (!contract) throw new Error('fixture inválida');
    expect(clientFeaturesFromCapabilities(contract)).toMatchObject({
      tableManagement: false,
      callWaiter: false,
      splitPayment: false,
      guestInvitations: false,
      menuPersonalization: true,
    });
  });
});
