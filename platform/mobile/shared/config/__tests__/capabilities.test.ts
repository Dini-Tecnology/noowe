import { clientFeaturesFromCapabilities, parseRestaurantCapabilityContract } from '../capabilities';

const serverContract = {
  serviceModel: 'quick_service',
  capabilities: {
    reservations: false, virtualQueue: false, queueIsPrimaryEntry: false,
    tableSession: false, guestLink: false, splitBill: false, splitModes: [],
    serviceFee: false, staffCalls: false, familyMode: false, parties: false,
    comboBuilder: true, prepaidRequired: true, pickupCode: true, loyaltyMode: 'stamps',
    consumptionUnit: 'individual_cart', orderTracking: 'pickup_steps',
  },
  policies: {
    serviceFeeBps: null, tipPresetsBps: [], queueCallToleranceMin: null,
    reservationNoShowMin: null, guestLinkTtlMin: null, requireGuestAccount: false,
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
