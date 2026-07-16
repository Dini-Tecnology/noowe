/**
 * Zod Validation Schemas for Project Okinawa
 * 
 * Centralized validation schemas for form inputs across
 * both Client and Restaurant mobile applications.
 * 
 * @module validation/schemas
 */

import { z } from 'zod';
import { validationMsg, localizeValidationMessage } from './messages';

// ============================================
// COMMON FIELD VALIDATORS
// ============================================

/**
 * Email validation with proper format checking
 */
export const emailSchema = z
  .string()
  .trim()
  .min(1, { message: validationMsg.emailRequired })
  .email({ message: validationMsg.invalidEmailAddress })
  .max(255, { message: validationMsg.emailMaxLength });

/**
 * Password validation with security requirements
 */
export const passwordSchema = z
  .string()
  .min(8, { message: validationMsg.passwordMinLength })
  .max(100, { message: validationMsg.passwordMaxLength })
  .regex(/[A-Z]/, { message: validationMsg.passwordUppercase })
  .regex(/[a-z]/, { message: validationMsg.passwordLowercase })
  .regex(/[0-9]/, { message: validationMsg.passwordNumber });

/**
 * Simple password for login (no complexity requirements)
 */
export const loginPasswordSchema = z
  .string()
  .min(1, { message: validationMsg.passwordRequired })
  .max(100, { message: validationMsg.passwordMaxLength });

/**
 * Full name validation
 */
export const fullNameSchema = z
  .string()
  .trim()
  .min(2, { message: validationMsg.nameMinLength })
  .max(100, { message: validationMsg.nameMaxLength })
  .regex(/^[a-zA-ZÀ-ÿ\s'-]+$/, { message: validationMsg.nameInvalidChars });

/**
 * Phone number validation (Brazilian format)
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(10, { message: validationMsg.phoneTooShort })
  .max(15, { message: validationMsg.phoneTooLong })
  .regex(/^[\d\s()+-]+$/, { message: validationMsg.phoneInvalidFormat });

/**
 * Optional phone number
 */
export const optionalPhoneSchema = z.union([
  z.literal(''),
  phoneSchema,
]);

// ============================================
// AUTHENTICATION SCHEMAS
// ============================================

/**
 * Phone number with country code for OTP authentication
 */
export const phoneAuthSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .min(10, { message: validationMsg.phoneRequired })
    .regex(/^\+?[\d\s()-]+$/, { message: validationMsg.phoneInvalidFormat }),
  countryCode: z
    .string()
    .regex(/^\+\d{1,4}$/, { message: validationMsg.countryCodeInvalid })
    .default('+55'),
});

export type PhoneAuthFormData = z.infer<typeof phoneAuthSchema>;

/**
 * OTP code validation (6 digits)
 */
export const otpSchema = z.object({
  code: z
    .string()
    .length(6, { message: validationMsg.otpLength })
    .regex(/^\d{6}$/, { message: validationMsg.otpNumbersOnly }),
});

export type OTPFormData = z.infer<typeof otpSchema>;

/**
 * Social login validation
 */
export const socialAuthSchema = z.object({
  provider: z.enum(['apple', 'google'], { message: validationMsg.invalidProvider }),
  idToken: z.string().min(1, { message: validationMsg.idTokenRequired }),
  deviceInfo: z.object({
    deviceId: z.string().min(1),
    platform: z.enum(['ios', 'android', 'web']),
    model: z.string().optional(),
    osVersion: z.string().optional(),
  }),
});

export type SocialAuthFormData = z.infer<typeof socialAuthSchema>;

/**
 * Biometric enrollment
 */
export const biometricEnrollmentSchema = z.object({
  enrollmentToken: z.string().min(1, { message: validationMsg.enrollmentTokenRequired }),
  biometricType: z.enum(['face_id', 'touch_id', 'fingerprint'], { 
    message: validationMsg.invalidBiometricType 
  }),
  publicKey: z.string().min(1, { message: validationMsg.publicKeyRequired }),
});

export type BiometricEnrollmentFormData = z.infer<typeof biometricEnrollmentSchema>;

/**
 * Login form validation
 */
export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Registration form validation (passwordless-first with optional email/password)
 */
export const registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema.optional(),
  password: passwordSchema.optional(),
  confirmPassword: z.string().optional(),
  birthDate: z.string().optional(),
}).refine((data) => {
  // Either email or phone is required
  return data.email || data.phone;
}, {
  message: validationMsg.emailOrPhoneRequired,
  path: ['email'],
}).refine((data) => {
  if (!data.password) return true;
  return Boolean(data.confirmPassword);
}, {
  message: validationMsg.passwordConfirmationRequired,
  path: ['confirmPassword'],
}).refine((data) => {
  if (!data.password || !data.confirmPassword) return true;
  return data.password === data.confirmPassword;
}, {
  message: validationMsg.passwordsDontMatch,
  path: ['confirmPassword'],
});

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Simplified phone registration (passwordless)
 */
export const phoneRegisterSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema.optional(),
  birthDate: z.string().optional(),
});

export type PhoneRegisterFormData = z.infer<typeof phoneRegisterSchema>;

/**
 * Password reset request
 */
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

/**
 * Password reset with new password
 */
export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: validationMsg.passwordsDontMatch,
  path: ['confirmPassword'],
});

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

// ============================================
// RESERVATION SCHEMAS
// ============================================

/**
 * Create reservation form
 */
export const createReservationSchema = z.object({
  restaurantId: z.string().min(1, { message: validationMsg.restaurantRequired }),
  date: z.string().min(1, { message: validationMsg.dateRequired }),
  time: z.string().min(1, { message: validationMsg.timeRequired }),
  partySize: z
    .number()
    .int()
    .min(1, { message: validationMsg.partySizeMin })
    .max(20, { message: validationMsg.partySizeMax }),
  specialRequests: z
    .string()
    .max(500, { message: validationMsg.specialRequestsMaxLength })
    .optional(),
  tablePreference: z.enum(['indoor', 'outdoor', 'bar', 'any']).optional(),
});

export type CreateReservationFormData = z.infer<typeof createReservationSchema>;

/**
 * Guest invitation form
 */
export const guestInvitationSchema = z.object({
  method: z.enum(['app', 'sms', 'email', 'link']),
  recipient: z.string().min(1, { message: validationMsg.recipientRequired }),
  message: z
    .string()
    .max(300, { message: validationMsg.messageMaxLength })
    .optional(),
});

export type GuestInvitationFormData = z.infer<typeof guestInvitationSchema>;

// ============================================
// ORDER SCHEMAS
// ============================================

/**
 * Add item to order
 */
export const addOrderItemSchema = z.object({
  menuItemId: z.string().min(1, { message: validationMsg.menuItemRequired }),
  quantity: z
    .number()
    .int()
    .min(1, { message: validationMsg.quantityMin })
    .max(99, { message: validationMsg.quantityMax }),
  notes: z
    .string()
    .max(200, { message: validationMsg.notesMaxLength200 })
    .optional(),
  modifiers: z.array(z.string()).optional(),
});

export type AddOrderItemFormData = z.infer<typeof addOrderItemSchema>;

/**
 * Order notes/special instructions
 */
export const orderNotesSchema = z.object({
  notes: z
    .string()
    .max(500, { message: validationMsg.notesMaxLength500 }),
});

export type OrderNotesFormData = z.infer<typeof orderNotesSchema>;

// ============================================
// PAYMENT SCHEMAS
// ============================================

/**
 * Tip amount validation
 */
export const tipSchema = z.object({
  amount: z
    .number()
    .min(0, { message: validationMsg.tipNegative })
    .max(10000, { message: validationMsg.tipMax }),
  percentage: z
    .number()
    .min(0, { message: validationMsg.percentageNegative })
    .max(100, { message: validationMsg.percentageMax })
    .optional(),
});

export type TipFormData = z.infer<typeof tipSchema>;

/**
 * Split payment configuration
 */
export const splitPaymentSchema = z.object({
  mode: z.enum(['equal', 'custom', 'by_item']),
  participants: z
    .array(z.string())
    .min(2, { message: validationMsg.splitMinParticipants }),
  amounts: z.record(z.string(), z.number()).optional(),
});

export type SplitPaymentFormData = z.infer<typeof splitPaymentSchema>;

// ============================================
// PROFILE SCHEMAS
// ============================================

/**
 * Update profile form
 */
export const updateProfileSchema = z.object({
  fullName: fullNameSchema,
  phone: optionalPhoneSchema.optional(),
  birthDate: z.string().optional(),
  dietaryPreferences: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
});

export type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

// ============================================
// REVIEW SCHEMAS
// ============================================

/**
 * Restaurant/order review
 */
export const reviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, { message: validationMsg.ratingMin })
    .max(5, { message: validationMsg.ratingMax }),
  comment: z
    .string()
    .min(10, { message: validationMsg.reviewMinLength })
    .max(1000, { message: validationMsg.reviewMaxLength }),
  tags: z.array(z.string()).optional(),
});

export type ReviewFormData = z.infer<typeof reviewSchema>;

// ============================================
// RESTAURANT APP SCHEMAS
// ============================================

/**
 * Table notes update
 */
export const tableNotesSchema = z.object({
  notes: z
    .string()
    .max(500, { message: validationMsg.notesMaxLength500 }),
});

export type TableNotesFormData = z.infer<typeof tableNotesSchema>;

/**
 * Staff member creation/update
 */
export const staffMemberSchema = z.object({
  name: fullNameSchema,
  email: emailSchema,
  role: z.enum(['owner', 'manager', 'maitre', 'chef', 'cook', 'barman', 'waiter']),
  phone: optionalPhoneSchema.optional(),
});

export type StaffMemberFormData = z.infer<typeof staffMemberSchema>;

/**
 * Menu item creation/update
 */
export const menuItemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, { message: validationMsg.nameMinLength })
    .max(100, { message: validationMsg.nameMaxLength }),
  description: z
    .string()
    .max(500, { message: validationMsg.descriptionMaxLength })
    .optional(),
  price: z
    .number()
    .positive({ message: validationMsg.pricePositive })
    .max(99999.99, { message: validationMsg.priceMax }),
  category: z.string().min(1, { message: validationMsg.categoryRequired }),
  isAvailable: z.boolean().default(true),
  preparationTime: z
    .number()
    .int()
    .min(1, { message: validationMsg.preparationTimeMin })
    .max(180, { message: validationMsg.preparationTimeMax })
    .optional(),
  allergens: z.array(z.string()).optional(),
  calories: z
    .number()
    .int()
    .min(0)
    .max(10000)
    .optional(),
});

export type MenuItemFormData = z.infer<typeof menuItemSchema>;

/**
 * Financial report export
 */
export const financialReportSchema = z.object({
  startDate: z.string().min(1, { message: validationMsg.startDateRequired }),
  endDate: z.string().min(1, { message: validationMsg.endDateRequired }),
  format: z.enum(['pdf', 'xlsx', 'csv']),
  includeDetails: z.boolean().default(true),
}).refine((data) => new Date(data.startDate) <= new Date(data.endDate), {
  message: validationMsg.startDateBeforeEnd,
  path: ['endDate'],
});

export type FinancialReportFormData = z.infer<typeof financialReportSchema>;

// ============================================
// FISCAL SCHEMAS
// ============================================

export const cnpjSchema = z
  .string()
  .trim()
  .regex(/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/, { message: validationMsg.cnpjInvalid });

export const fiscalConfigSchema = z.object({
  cnpj: cnpjSchema,
  ie: z.string().max(15).optional(),
  razaoSocial: z.string().min(2).max(200),
  nomeFantasia: z.string().max(200).optional(),
  stateCode: z.string().length(2),
  regimeTributario: z.enum(['simples_nacional', 'lucro_presumido', 'lucro_real']),
});
export type FiscalConfigFormData = z.infer<typeof fiscalConfigSchema>;

// ============================================
// PAYMENT CARD SCHEMAS
// ============================================

export const cardNumberSchema = z
  .string()
  .trim()
  .min(13, { message: validationMsg.cardNumberTooShort })
  .max(19, { message: validationMsg.cardNumberTooLong })
  .regex(/^[\d\s]+$/, { message: validationMsg.cardNumberDigitsOnly });

export const cardSchema = z.object({
  number: cardNumberSchema,
  holderName: z.string().min(2).max(100),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, { message: validationMsg.invalidMonth }),
  expiryYear: z.string().regex(/^\d{2,4}$/, { message: validationMsg.invalidYear }),
  cvv: z.string().regex(/^\d{3,4}$/, { message: validationMsg.invalidCvv }),
});
export type CardFormData = z.infer<typeof cardSchema>;

// ============================================
// ADDRESS SCHEMAS
// ============================================

export const addressSchema = z.object({
  label: z.string().min(1).max(50).optional(),
  street: z.string().min(3).max(200),
  number: z.string().min(1).max(20),
  complement: z.string().max(100).optional(),
  neighborhood: z.string().min(2).max(100),
  city: z.string().min(2).max(100),
  state: z.string().length(2),
  postalCode: z.string().regex(/^\d{5}-?\d{3}$/, { message: validationMsg.cepInvalid }),
});
export type AddressFormData = z.infer<typeof addressSchema>;

// ============================================
// BILL/ACCOUNTS PAYABLE SCHEMAS
// ============================================

export const billSchema = z.object({
  description: z.string().min(2).max(200),
  supplier: z.string().min(1).max(200),
  amount: z.number().positive({ message: validationMsg.amountPositive }),
  dueDate: z.string().min(1, { message: validationMsg.dueDateRequired }),
  category: z.string().min(1).optional(),
  isRecurring: z.boolean().default(false),
});
export type BillFormData = z.infer<typeof billSchema>;

// ============================================
// TABLE FORM SCHEMAS
// ============================================

export const tableFormSchema = z.object({
  tableNumber: z.number().int().min(1).max(999),
  seats: z.number().int().min(1).max(50),
  section: z.string().min(1).max(50).optional(),
  shape: z.enum(['round', 'square', 'rectangle']).optional(),
});
export type TableFormData = z.infer<typeof tableFormSchema>;

// ============================================
// RECIPE SCHEMAS
// ============================================

export const recipeIngredientSchema = z.object({
  ingredientId: z.string().min(1),
  quantity: z.number().positive({ message: validationMsg.quantityPositive }),
  unit: z.string().min(1),
});

export const recipeSchema = z.object({
  name: z.string().min(2).max(200),
  menuItemId: z.string().optional(),
  ingredients: z.array(recipeIngredientSchema).min(1, { message: validationMsg.atLeastOneIngredient }),
});
export type RecipeFormData = z.infer<typeof recipeSchema>;

// ============================================
// STOCK ITEM SCHEMAS
// ============================================

export const stockItemSchema = z.object({
  name: z.string().min(2).max(200),
  currentQuantity: z.number().min(0),
  unit: z.string().min(1).max(20),
  minQuantity: z.number().min(0).optional(),
  maxQuantity: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
});
export type StockItemFormData = z.infer<typeof stockItemSchema>;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Validate form data against a schema and return errors
 */
export function validateForm<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: Record<string, string> } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.');
    if (!errors[path]) {
      errors[path] = localizeValidationMessage(issue.message);
    }
  }

  return { success: false, errors };
}

/**
 * Get first error message from Zod validation result
 */
export function getFirstError(result: z.SafeParseError<unknown>): string {
  return localizeValidationMessage(result.error.issues[0]?.message || validationMsg.validationFailed);
}

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  // Authentication
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  
  // Reservation
  createReservationSchema,
  guestInvitationSchema,
  
  // Order
  addOrderItemSchema,
  orderNotesSchema,
  
  // Payment
  tipSchema,
  splitPaymentSchema,
  
  // Profile
  updateProfileSchema,
  
  // Review
  reviewSchema,
  
  // Restaurant
  tableNotesSchema,
  staffMemberSchema,
  menuItemSchema,
  financialReportSchema,

  // Fiscal
  cnpjSchema,
  fiscalConfigSchema,

  // Card
  cardNumberSchema,
  cardSchema,

  // Address
  addressSchema,

  // Bill
  billSchema,

  // Table Form
  tableFormSchema,

  // Recipe
  recipeIngredientSchema,
  recipeSchema,

  // Stock
  stockItemSchema,

  // Utilities
  validateForm,
  getFirstError,
};
