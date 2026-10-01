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
    staffCallTypes: [], comboBuilder: true, prepaidRequired: true, pickupCode: true,
    pickupSlots: true, qualityCheck: true, loyaltyMode: 'stamps',
    consumptionUnit: 'individual_cart', orderTracking: 'pickup_steps',
  },
  policies: {
    serviceFeeBps: null, tipPresetsBps: [], queueCallToleranceMin: null,
    reservationNoShowMin: null, guestLinkTtlMin: null, userInviteTtlMin: null, userSearchMinChars: null, capacityRequestTtlMin: null, requireGuestAccount: false,
    enforceTableCapacity: false, capacityOverrideRoles: [], splitFixedRemainder: null,
    tipAllocation: null, comboDiscountBps: 2000, pickupCapacityPerSlot: 12,
    pickupExpiryMin: 30, stampsPerReward: 10,
  },
};

describe('restaurant capability contract', () => {
  it('accepts a complete contract from the server', () => {
    expect(parseRestaurantCapabilityContract(serverContract)).toEqual(serverContract);
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
