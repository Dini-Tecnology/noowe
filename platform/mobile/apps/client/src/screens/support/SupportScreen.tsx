import React, { useState } from 'react';
import { View, ScrollView, StyleSheet, Linking, Alert } from 'react-native';
import {
  Text,
  List,
  Searchbar,
  Card,
  Button,
  TextInput,
  Chip,
} from 'react-native-paper';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: string;
}

const faqData: FAQItem[] = [
  { id: '1', question: 'Como faço um pedido?', answer: 'Você pode fazer um pedido de duas formas: 1) Navegue até o restaurante desejado, escolha os itens do cardápio e adicione ao carrinho. 2) Escaneie o QR code da mesa no restaurante para fazer o pedido diretamente.', category: 'Pedidos' },
  { id: '2', question: 'Como faço uma reserva?', answer: 'Acesse a tela de Reservas, escolha o restaurante, selecione data, horário e número de pessoas. Você receberá uma confirmação por notificação quando o restaurante aprovar.', category: 'Reservas' },
  { id: '3', question: 'Como pago minha conta?', answer: 'Você pode pagar através do app usando cartão de crédito/débito ou Pix. Acesse a seção de Pagamentos ou escaneie o QR code de pagamento fornecido pelo restaurante.', category: 'Pagamentos' },
  { id: '4', question: 'Como deixo gorjeta?', answer: 'Na tela de pagamento, você pode adicionar uma gorjeta escolhendo uma porcentagem pré-definida (10%, 15%, 20%) ou inserindo um valor personalizado.', category: 'Gorjetas' },
  { id: '5', question: 'Como adiciono um restaurante aos favoritos?', answer: 'Na página de detalhes do restaurante, toque no ícone de coração no canto superior direito. Você pode acessar seus favoritos na aba Favoritos.', category: 'Favoritos' },
  { id: '6', question: 'Posso cancelar uma reserva?', answer: 'Sim, você pode cancelar uma reserva até 2 horas antes do horário marcado. Acesse Minhas Reservas, selecione a reserva e toque em Cancelar.', category: 'Reservas' },
  { id: '7', question: 'Como avalio um restaurante?', answer: 'Após sua visita ou pedido, você receberá uma notificação pedindo sua avaliação. Você também pode avaliar manualmente acessando o restaurante e clicando em "Avaliar".', category: 'Avaliações' },
  { id: '8', question: 'Meus dados estão seguros?', answer: 'Sim! Utilizamos criptografia de ponta para proteger seus dados. Informações de pagamento são processadas por gateways seguros e nunca armazenamos dados completos de cartão.', category: 'Segurança' },
  { id: '9', question: 'Como funciona o programa de fidelidade?', answer: 'Você acumula pontos a cada compra realizada. Os pontos podem ser trocados por descontos em restaurantes participantes. Acesse a aba Loyalty para ver seu saldo.', category: 'Loyalty' },
  { id: '10', question: 'Como altero meu endereço de entrega?', answer: 'Acesse seu Perfil > Endereços e adicione, edite ou remova endereços salvos. Durante o pedido, você também pode selecionar qual endereço usar.', category: 'Conta' },
];

const categories = ['Todos', 'Pedidos', 'Reservas', 'Pagamentos', 'Gorjetas', 'Favoritos', 'Avaliações', 'Segurança', 'Loyalty', 'Conta'];

export default function SupportScreen() {
  const navigation = useNavigation();
  const colors = useColors();
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactMessage, setContactMessage] = useState('');

  const filteredFAQs = faqData.filter((faq) => {
    const matchesSearch =
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === 'Todos' || faq.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleContactSubmit = () => {
    if (!contactMessage.trim()) {
      Alert.alert('Atenção', 'Por favor, descreva sua dúvida ou problema');
      return;
    }

    Alert.alert(
      'Mensagem Enviada',
      'Recebemos sua mensagem! Nossa equipe responderá em até 24 horas.',
      [{ text: 'OK', onPress: () => { setContactMessage(''); setShowContactForm(false); } }]
    );
  };

  const handleCall = () => Linking.openURL('tel:+551140028922');
  const handleEmail = () => Linking.openURL('mailto:suporte@noowebr.com?subject=Suporte Noowe');
  const handleWhatsApp = () => Linking.openURL('https://wa.me/5511940028922?text=Olá, preciso de ajuda com o app Noowe');

  const styles = createStyles(colors);

  if (showContactForm) {
    return (
      <ScreenContainer>
      <ScrollView style={styles.container}>
        <View style={styles.contactFormContainer}>
          <Text variant="headlineMedium" style={styles.contactTitle}>Fale Conosco</Text>
          <Text variant="bodyMedium" style={styles.contactSubtitle}>Descreva sua dúvida ou problema e entraremos em contato</Text>

          <TextInput
            mode="outlined"
            label={t('formLabels.yourMessage')}
            value={contactMessage}
            onChangeText={setContactMessage}
            multiline
            numberOfLines={8}
            style={styles.messageInput}
            placeholder={t('placeholders.describeIssue')}
            accessibilityLabel="Your support message"
          />

          <Button mode="contained" onPress={handleContactSubmit} style={styles.submitButton} contentStyle={styles.submitButtonContent}>
            Enviar Mensagem
          </Button>

          <Button mode="text" onPress={() => setShowContactForm(false)} style={styles.backButton}>
            Voltar para FAQ
          </Button>
        </View>
      </ScrollView>
    
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <ScrollView style={styles.container}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder={t('placeholders.searchFaq')}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesContainer} contentContainerStyle={styles.categoriesContent}>
        {categories.map((category) => (
          <Chip
            key={category}
            selected={selectedCategory === category}
            onPress={() => setSelectedCategory(category)}
            style={styles.categoryChip}
            showSelectedCheck={false}
          >
            {category}
          </Chip>
        ))}
      </ScrollView>

      <Card style={styles.quickContactCard}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.quickContactTitle}>Precisa de ajuda rápida?</Text>
          <View style={styles.quickContactButtons}>
            <Button mode="outlined" icon="phone" onPress={handleCall} style={styles.quickContactButton}>Ligar</Button>
            <Button mode="outlined" icon="email" onPress={handleEmail} style={styles.quickContactButton}>Email</Button>
            <Button mode="outlined" icon="whatsapp" onPress={handleWhatsApp} style={styles.quickContactButton}>WhatsApp</Button>
          </View>
        </Card.Content>
      </Card>

      <View style={styles.faqContainer}>
        <Text variant="titleLarge" style={styles.faqTitle}>Perguntas Frequentes</Text>

        {filteredFAQs.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="help-circle-outline" size={60} color={colors.foregroundMuted} />
            <Text variant="bodyLarge" style={styles.emptyText}>Nenhuma pergunta encontrada</Text>
            <Text variant="bodySmall" style={styles.emptySubtext}>Tente buscar por outro termo ou categoria</Text>
          </View>
        ) : (
          <List.Section>
            {filteredFAQs.map((faq) => (
              <List.Accordion
                key={faq.id}
                title={faq.question}
                titleNumberOfLines={2}
                titleStyle={{ color: colors.foreground }}
                left={(props) => <List.Icon {...props} icon="help-circle" color={colors.foregroundMuted} />}
                expanded={expandedId === faq.id}
                onPress={() => setExpandedId(expandedId === faq.id ? null : faq.id)}
                style={[styles.accordion, { backgroundColor: colors.card }]}
              >
                <View style={[styles.answerContainer, { backgroundColor: colors.muted }]}>
                  <Text variant="bodyMedium" style={styles.answerText}>{faq.answer}</Text>
                  <View style={[styles.categoryTag, { backgroundColor: colors.infoBackground }]}>
                    <Text variant="labelSmall" style={[styles.categoryTagText, { color: colors.info }]}>{faq.category}</Text>
                  </View>
                </View>
              </List.Accordion>
            ))}
          </List.Section>
        )}
      </View>

      <Card style={styles.stillNeedHelpCard}>
        <Card.Content>
          <View style={styles.stillNeedHelpContent}>
            <Icon name="lifebuoy" size={48} color={colors.error} />
            <Text variant="titleMedium" style={styles.stillNeedHelpTitle}>Ainda precisa de ajuda?</Text>
            <Text variant="bodyMedium" style={styles.stillNeedHelpText}>Nossa equipe está pronta para ajudar você</Text>
            <Button mode="contained" onPress={() => setShowContactForm(true)} style={[styles.contactButton, { backgroundColor: colors.primary }]}>
              Entrar em Contato
            </Button>
          </View>
        </Card.Content>
      </Card>
    </ScrollView>
  
    </ScreenContainer>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  searchContainer: { padding: 16 },
  searchBar: { elevation: 2, backgroundColor: colors.card },
  categoriesContainer: { marginBottom: 15 },
  categoriesContent: { paddingHorizontal: 15, paddingBottom: 5 },
  categoryChip: { marginRight: 8 },
  quickContactCard: { margin: 16, marginBottom: 20, backgroundColor: colors.card },
  quickContactTitle: { marginBottom: 15, fontWeight: 'bold', color: colors.foreground },
  quickContactButtons: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  quickContactButton: { flex: 1 },
  faqContainer: { padding: 16 },
  faqTitle: { fontWeight: 'bold', marginBottom: 15, color: colors.foreground },
  accordion: { marginBottom: 8, borderRadius: 8 },
  answerContainer: { padding: 16 },
  answerText: { color: colors.foregroundMuted, lineHeight: 22, marginBottom: 10 },
  categoryTag: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  categoryTagText: {},
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { marginTop: 15, color: colors.foregroundMuted },
  emptySubtext: { marginTop: 5, color: colors.foregroundMuted },
  stillNeedHelpCard: { margin: 16, marginTop: 20, marginBottom: 30, backgroundColor: colors.card },
  stillNeedHelpContent: { alignItems: 'center', paddingVertical: 20 },
  stillNeedHelpTitle: { marginTop: 15, marginBottom: 10, fontWeight: 'bold', color: colors.foreground },
  stillNeedHelpText: { color: colors.foregroundMuted, marginBottom: 20, textAlign: 'center' },
  contactButton: {},
  contactFormContainer: { padding: 20 },
  contactTitle: { fontWeight: 'bold', marginBottom: 10, color: colors.foreground },
  contactSubtitle: { color: colors.foregroundMuted, marginBottom: 25 },
  messageInput: { marginBottom: 20, backgroundColor: colors.card },
  submitButton: { marginBottom: 10 },
  submitButtonContent: { paddingVertical: 8 },
  backButton: { marginTop: 10 },
});
