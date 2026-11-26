import { addSavedCard, removeSavedCard, setDefaultSavedCard } from '@okinawa/shared/services/supabase-api';
import { billShares, type SavedCard } from './bill-shares';

/** Dados digitados em "Adicionar cartão". Vão direto ao servidor, que tokeniza no provedor; o app não guarda nada. */
export type NewCardInput = {
  restaurantId: string;
  card: { holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string };
  holder: { cpf: string; postalCode: string; addressNumber: string; phone: string };
};

/** Fachada fina sobre o núcleo compartilhado, para as telas (e os testes) não dependerem do cliente Supabase. */
export const savedCards = {
  /** Checkout: sempre com o restaurante (token por subconta). Perfil: sem argumento. */
  list: (restaurantId?: string): Promise<SavedCard[]> => billShares.listSavedCards(restaurantId),

  async add(input: NewCardInput): Promise<SavedCard> {
    const card = await addSavedCard(input.restaurantId, input.card, input.holder);
    return { id: card.id, brand: card.brand, lastFour: card.last4, isDefault: card.isDefault };
  },

  remove: (cardId: string): Promise<void> => removeSavedCard(cardId),
  setDefault: (cardId: string): Promise<void> => setDefaultSavedCard(cardId),
};
