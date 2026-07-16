/**
 * Zod Validation Schema Tests
 * 
 * These tests validate the Zod schemas used across the application.
 * If schema rules change, tests WILL detect it.
 * 
 * @module shared/validation/__tests__/schemas.test
 */

import { describe, it, expect } from 'vitest';
import {
  loginSchema,
  registerSchema,
  createReservationSchema,
  addOrderItemSchema,
  splitPaymentSchema,
  reviewSchema,
  menuItemSchema,
  validateForm,
  LoginFormData,
  RegisterFormData,
} from '../schemas';
import { validationMsg } from '../messages';

// ============================================================
// AUTH SCHEMA TESTS
// ============================================================

describe('Zod Schemas: Authentication', () => {
  describe('loginSchema', () => {
    it('should validate correct login data', () => {
      const validData = {
        email: 'test@example.com',
        password: 'password123',
      };
      
      const result = loginSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidData = {
        email: 'invalid-email',
        password: 'password123',
      };
      
      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('email');
      }
    });

    it('should reject empty password', () => {
      const invalidData = {
        email: 'test@example.com',
        password: '',
      };
      
      const result = loginSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('registerSchema', () => {
    it('should validate correct registration data', () => {
      const validData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      };
      
      const result = registerSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject mismatched passwords', () => {
      const invalidData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'Password123',
        confirmPassword: 'DifferentPassword123',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe(validationMsg.passwordsDontMatch);
      }
    });

    it('should reject password without uppercase', () => {
      const invalidData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'password123',
        confirmPassword: 'password123',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject password without number', () => {
      const invalidData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'PasswordABC',
        confirmPassword: 'PasswordABC',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject short password', () => {
      const invalidData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'Pass1',
        confirmPassword: 'Pass1',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject name with invalid characters', () => {
      const invalidData = {
        fullName: 'John123',
        email: 'john@example.com',
        password: 'Password123',
        confirmPassword: 'Password123',
      };
      
      const result = registerSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// RESERVATION SCHEMA TESTS
// ============================================================

describe('Zod Schemas: Reservations', () => {
  describe('createReservationSchema', () => {
    it('should validate correct reservation data', () => {
      const validData = {
        restaurantId: 'rest-123',
        date: '2024-01-20',
        time: '19:00',
        partySize: 4,
        specialRequests: 'Window seat please',
        tablePreference: 'indoor' as const,
      };
      
      const result = createReservationSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject party size less than 1', () => {
      const invalidData = {
        restaurantId: 'rest-123',
        date: '2024-01-20',
        time: '19:00',
        partySize: 0,
      };
      
      const result = createReservationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject party size greater than 20', () => {
      const invalidData = {
        restaurantId: 'rest-123',
        date: '2024-01-20',
        time: '19:00',
        partySize: 25,
      };
      
      const result = createReservationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid table preference', () => {
      const invalidData = {
        restaurantId: 'rest-123',
        date: '2024-01-20',
        time: '19:00',
        partySize: 4,
        tablePreference: 'rooftop', // Invalid
      };
      
      const result = createReservationSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// ORDER SCHEMA TESTS
// ============================================================

describe('Zod Schemas: Orders', () => {
  describe('addOrderItemSchema', () => {
    it('should validate correct order item', () => {
      const validData = {
        menuItemId: 'item-123',
        quantity: 2,
        notes: 'No onions please',
      };
      
      const result = addOrderItemSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject quantity less than 1', () => {
      const invalidData = {
        menuItemId: 'item-123',
        quantity: 0,
      };
      
      const result = addOrderItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject quantity greater than 99', () => {
      const invalidData = {
        menuItemId: 'item-123',
        quantity: 100,
      };
      
      const result = addOrderItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// PAYMENT SCHEMA TESTS
// ============================================================

describe('Zod Schemas: Payments', () => {
  describe('splitPaymentSchema', () => {
    it('should validate correct split payment', () => {
      const validData = {
        mode: 'equal' as const,
        participants: ['user-1', 'user-2'],
      };
      
      const result = splitPaymentSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject split with less than 2 participants', () => {
      const invalidData = {
        mode: 'equal' as const,
        participants: ['user-1'],
      };
      
      const result = splitPaymentSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept custom mode', () => {
      const validData = {
        mode: 'custom' as const,
        participants: ['user-1', 'user-2', 'user-3'],
        amounts: { 'user-1': 50, 'user-2': 75, 'user-3': 75 },
      };
      
      const result = splitPaymentSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================
// REVIEW SCHEMA TESTS
// ============================================================

describe('Zod Schemas: Reviews', () => {
  describe('reviewSchema', () => {
    it('should validate correct review', () => {
      const validData = {
        rating: 5,
        comment: 'Amazing food and service! Would definitely recommend.',
      };
      
      const result = reviewSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject rating less than 1', () => {
      const invalidData = {
        rating: 0,
        comment: 'This is my review',
      };
      
      const result = reviewSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject rating greater than 5', () => {
      const invalidData = {
        rating: 6,
        comment: 'This is my review',
      };
      
      const result = reviewSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject comment less than 10 characters', () => {
      const invalidData = {
        rating: 5,
        comment: 'Good',
      };
      
      const result = reviewSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// MENU ITEM SCHEMA TESTS
// ============================================================

describe('Zod Schemas: Menu Items', () => {
  describe('menuItemSchema', () => {
    it('should validate correct menu item', () => {
      const validData = {
        name: 'Ramen Tonkotsu',
        description: 'Traditional Japanese pork bone broth ramen',
        price: 48.90,
        category: 'Pratos Principais',
        isAvailable: true,
        preparationTime: 15,
      };
      
      const result = menuItemSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject negative price', () => {
      const invalidData = {
        name: 'Ramen',
        price: -10,
        category: 'Pratos',
      };
      
      const result = menuItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject price above max', () => {
      const invalidData = {
        name: 'Ramen',
        price: 100000,
        category: 'Pratos',
      };
      
      const result = menuItemSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================
// VALIDATE FORM UTILITY TESTS
// ============================================================

describe('validateForm Utility', () => {
  it('should return success with parsed data on valid input', () => {
    const result = validateForm(loginSchema, {
      email: 'test@example.com',
      password: 'password123',
    });
    
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe('test@example.com');
    }
  });

  it('should return errors object on invalid input', () => {
    const result = validateForm(loginSchema, {
      email: 'invalid',
      password: '',
    });
    
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors).toHaveProperty('email');
      expect(result.errors).toHaveProperty('password');
    }
  });
});

console.log('✅ Zod validation schema tests defined');
