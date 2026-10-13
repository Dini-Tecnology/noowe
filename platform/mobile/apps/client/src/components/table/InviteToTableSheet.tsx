import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import QRCode from 'react-native-qrcode-svg';
import customerBackend, { type TableInvite, type TableUserInvite, type TableUserSearchResult } from '../../services/customer-backend';
import {
  describeTableInviteError,
  TABLE_INVITE_STATUS_LABELS,
  tableInviteKeys,
  useTableSessionUserInvites,
} from '../../hooks/useTableUserInvites';
import { normalizeUsernameInput } from '../../utils/username';

/** Typing pause before searching (UX only, not a business rule). */
const SEARCH_DEBOUNCE_MS = 350;

type Tab = 'username' | 'link';

export type InviteToTableSheetProps = {
  visible: boolean;
  onClose: () => void;
  tableSessionId: string;
  restaurantName?: string | null;
  /** capabilities.userInvite */
  userInviteEnabled: boolean;
  /** capabilities.guestLink */
  guestLinkEnabled: boolean;
  /** policies.userSearchMinChars — null disables the search. */
  searchMinChars: number | null;
};

const OPEN_STATUSES = new Set(['pending', 'awaiting_capacity']);

/** "123456" → "123 456": lido em voz alta, o código fica mais fácil de ditar. */
export function formatInviteCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function formatInviteExpiry(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'o fim da validade' : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export default function InviteToTableSheet({
  visible,
  onClose,
  tableSessionId,
  restaurantName,
  userInviteEnabled,
  guestLinkEnabled,
  searchMinChars,
}: InviteToTableSheetProps) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const searchEnabled = userInviteEnabled && searchMinChars != null;
  const [selectedTab, setTab] = useState<Tab>('username');
  const tab: Tab = searchEnabled ? selectedTab : 'link';
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // The next opening starts clean.
  const close = () => {
    setInput('');
    setQuery('');
    setFeedback(null);
    onClose();
  };

  const queryReady = searchEnabled && searchMinChars != null && query.length >= searchMinChars;
  const search = useQuery({
    queryKey: ['table-user-search', tableSessionId, query],
    queryFn: () => customerBackend.searchUsersForTable(tableSessionId, query),
    enabled: visible && queryReady,
    staleTime: 0,
  });

  const sentInvites = useTableSessionUserInvites(tableSessionId, visible && userInviteEnabled);
  // Open invites first, then the most recent answers.
  const visibleInvites = useMemo(
    () => [...(sentInvites.data ?? [])]
      .sort((a, b) => Number(OPEN_STATUSES.has(b.status)) - Number(OPEN_STATUSES.has(a.status)))
      .slice(0, 8),
    [sentInvites.data],
  );

  const refreshInviteState = () => {
    void queryClient.invalidateQueries({ queryKey: ['table-user-search', tableSessionId] });
    void queryClient.invalidateQueries({ queryKey: tableInviteKeys.session(tableSessionId) });
  };

  const send = useMutation({
    mutationFn: (username: string) => customerBackend.sendTableUserInvite(tableSessionId, username),
    onSuccess: (invite) => {
      setFeedback({ tone: 'success', text: `Convite enviado para @${invite.invitee.username}. A pessoa precisa aceitar para entrar.` });
      refreshInviteState();
    },
    onError: (error) => setFeedback({ tone: 'error', text: describeTableInviteError(error) }),
  });

  const cancel = useMutation({
    mutationFn: (inviteId: string) => customerBackend.cancelTableUserInvite(inviteId),
    onSuccess: refreshInviteState,
    onError: (error) => setFeedback({ tone: 'error', text: describeTableInviteError(error) }),
  });

  // Convite por link, QR no próprio celular ou código de 6 dígitos (ADR-019): um convite serve a todos.
  const [invite, setInvite] = useState<TableInvite | null>(null);
  // Um convite vale pela sessão e pelo prazo; ao reabrir a folha gera-se outro, nunca reaproveita um velho.
  useEffect(() => { if (!visible) setInvite(null); }, [visible]);
  const createInvite = useMutation({
    mutationFn: () => customerBackend.createTableInvite(tableSessionId),
    onSuccess: (created) => { setInvite(created); setFeedback(null); },
    onError: (error) => setFeedback({ tone: 'error', text: describeTableInviteError(error) }),
  });
  const shareInvite = () => {
    if (!invite) return;
    void Share.share({
      message: `Vem pra minha mesa no ${restaurantName ?? 'restaurante'}! ${invite.url}\nOu digite o código ${formatInviteCode(invite.code)} no app.`,
    });
  };

  const styles = useMemo(() => StyleSheet.create({
    keyboard: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.overlay },
    sheet: { maxHeight: '88%', paddingHorizontal: 20, paddingTop: 15, paddingBottom: 30, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    title: { color: colors.foreground, fontSize: 18, fontWeight: '800' },
    close: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    tabs: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 14 },
    tab: { flex: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary },
    tabActive: { backgroundColor: colors.primary },
    tabText: { color: colors.foregroundSecondary, fontSize: 13, fontWeight: '700' },
    tabTextActive: { color: colors.primaryForeground },
    searchRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderRadius: 13, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.input },
    at: { color: colors.foregroundSecondary, fontSize: 15, fontWeight: '700' },
    searchInput: { flex: 1, minHeight: 46, paddingLeft: 2, color: colors.foreground, fontSize: 15 },
    hint: { marginTop: 8, color: colors.foregroundMuted, fontSize: 12, lineHeight: 17 },
    feedback: { marginTop: 10, fontSize: 12, lineHeight: 17 },
    list: { marginTop: 8 },
    row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatar: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.backgroundTertiary },
    avatarImage: { width: '100%', height: '100%' },
    avatarText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
    rowInfo: { flex: 1, minWidth: 0 },
    rowName: { color: colors.foreground, fontSize: 14, fontWeight: '700' },
    rowSub: { marginTop: 2, color: colors.foregroundSecondary, fontSize: 12 },
    action: { minHeight: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    actionText: { color: colors.primaryForeground, fontSize: 12, fontWeight: '800' },
    actionMuted: { backgroundColor: colors.backgroundTertiary },
    actionMutedText: { color: colors.foregroundSecondary },
    sectionTitle: { marginTop: 20, marginBottom: 2, color: colors.foreground, fontSize: 14, fontWeight: '800' },
    linkCard: { padding: 16, borderRadius: 16, backgroundColor: colors.backgroundTertiary, gap: 12 },
    linkText: { color: colors.foregroundSecondary, fontSize: 13, lineHeight: 19 },
    linkButton: { minHeight: 48, borderRadius: 14, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
    linkButtonText: { color: colors.primaryForeground, fontSize: 14, fontWeight: '800' },
    qrFrame: { alignSelf: 'center', padding: 12, borderRadius: 16, backgroundColor: '#FFFFFF' },
    codeLabel: { textAlign: 'center', color: colors.foregroundSecondary, fontSize: 12, marginTop: 4 },
    code: { textAlign: 'center', color: colors.foreground, fontSize: 34, fontWeight: '800', letterSpacing: 4 },
    codeExpiry: { textAlign: 'center', color: colors.foregroundMuted, fontSize: 12 },
    empty: { paddingVertical: 18, color: colors.foregroundMuted, fontSize: 13, textAlign: 'center' },
  }), [colors]);

  const renderAvatar = (user: { displayName: string; avatarUrl: string | null }) => (
    <View style={styles.avatar}>
      {user.avatarUrl
        ? <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
        : <Text style={styles.avatarText}>{(user.displayName.replace('@', '')[0] ?? '?').toUpperCase()}</Text>}
    </View>
  );

  const renderResult = (result: TableUserSearchResult) => {
    const pending = send.isPending && send.variables === result.username;
    return (
      <View key={result.userId} style={styles.row} testID={`invite-result-${result.username}`}>
        {renderAvatar(result)}
        <View style={styles.rowInfo}>
          <Text numberOfLines={1} style={styles.rowName}>{result.displayName}</Text>
          <Text numberOfLines={1} style={styles.rowSub}>@{result.username}</Text>
        </View>
        {result.inviteState === 'invitable' ? (
          <TouchableOpacity
            style={styles.action}
            onPress={() => { setFeedback(null); send.mutate(result.username); }}
            disabled={send.isPending}
            accessibilityRole="button"
            accessibilityLabel={`Convidar @${result.username}`}
          >
            {pending ? <ActivityIndicator size="small" color={colors.primaryForeground} /> : <Text style={styles.actionText}>Convidar</Text>}
          </TouchableOpacity>
        ) : (
          <View style={[styles.action, styles.actionMuted]}>
            <Text style={[styles.actionText, styles.actionMutedText]}>
              {result.inviteState === 'already_at_table' ? 'Na mesa' : 'Convite enviado'}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const renderSentInvite = (invite: TableUserInvite) => (
    <View key={invite.id} style={styles.row} testID={`sent-invite-${invite.invitee.username}`}>
      {renderAvatar(invite.invitee)}
      <View style={styles.rowInfo}>
        <Text numberOfLines={1} style={styles.rowName}>@{invite.invitee.username}</Text>
        <Text numberOfLines={1} style={styles.rowSub}>
          {TABLE_INVITE_STATUS_LABELS[invite.status]}{invite.sentByMe ? '' : ` · por @${invite.inviter.username}`}
        </Text>
      </View>
      {invite.canCancel ? (
        <TouchableOpacity
          style={[styles.action, styles.actionMuted]}
          onPress={() => cancel.mutate(invite.id)}
          disabled={cancel.isPending}
          accessibilityRole="button"
          accessibilityLabel={`Cancelar convite para @${invite.invitee.username}`}
        >
          <Text style={[styles.actionText, styles.actionMutedText]}>Cancelar</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const searchHint = !searchEnabled
    ? null
    : input.length > 0 && input.length < (searchMinChars ?? 0)
      ? `Digite ao menos ${searchMinChars} caracteres do @.`
      : 'Busque pelo @ da pessoa. Ela recebe o convite e precisa aceitar para entrar na sua mesa.';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
        <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Fechar" />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Convidar para a mesa</Text>
            <TouchableOpacity style={styles.close} onPress={close} accessibilityRole="button" accessibilityLabel="Fechar">
              <Ionicons name="close" size={22} color={colors.foregroundSecondary} />
            </TouchableOpacity>
          </View>

          {searchEnabled && guestLinkEnabled ? (
            <View style={styles.tabs}>
              {([['username', 'Por @usuário'], ['link', 'Por link']] as const).map(([value, label]) => (
                <TouchableOpacity
                  key={value}
                  style={[styles.tab, tab === value && styles.tabActive]}
                  onPress={() => { setTab(value); setFeedback(null); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === value }}
                >
                  <Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : <View style={{ height: 12 }} />}

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {tab === 'username' && searchEnabled ? (
              <>
                <View style={styles.searchRow}>
                  <Text style={styles.at}>@</Text>
                  <TextInput
                    value={input}
                    onChangeText={(value) => { setInput(normalizeUsernameInput(value)); setFeedback(null); }}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    maxLength={30}
                    placeholder="usuario"
                    placeholderTextColor={colors.foregroundMuted}
                    style={styles.searchInput}
                    accessibilityLabel="Buscar pessoa pelo @"
                    testID="invite-search-input"
                  />
                  {search.isFetching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </View>
                {searchHint ? <Text style={styles.hint}>{searchHint}</Text> : null}
                {feedback ? (
                  <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: feedback.tone === 'success' ? colors.success : colors.error }]} testID="invite-feedback">
                    {feedback.text}
                  </Text>
                ) : null}

                {queryReady ? (
                  <View style={styles.list}>
                    {search.error ? <Text style={styles.empty}>{describeTableInviteError(search.error)}</Text> : null}
                    {search.data && search.data.length === 0 ? <Text style={styles.empty}>Ninguém encontrado com @{query}.</Text> : null}
                    {(search.data ?? []).map(renderResult)}
                  </View>
                ) : null}

                {visibleInvites.length > 0 ? (
                  <>
                    <Text style={styles.sectionTitle}>Convites desta mesa</Text>
                    {visibleInvites.map(renderSentInvite)}
                  </>
                ) : null}
              </>
            ) : (
              <View style={styles.linkCard}>
                <Text style={styles.linkText}>
                  Quem abrir o link, ler o QR ou digitar o código entra direto na sua mesa. Para quem já tem conta, prefira convidar pelo @: a pessoa confirma antes de entrar.
                </Text>
                {invite ? (
                  <>
                    <View style={styles.qrFrame} testID="invite-qr">
                      <QRCode value={invite.url} size={168} backgroundColor="#FFFFFF" color="#111111" />
                    </View>
                    <Text style={styles.codeLabel}>Código do convite</Text>
                    <Text style={styles.code} accessibilityLabel={`Código ${invite.code.split('').join(' ')}`} testID="invite-code">
                      {formatInviteCode(invite.code)}
                    </Text>
                    <Text style={styles.codeExpiry}>Vale até {formatInviteExpiry(invite.expiresAt)} ou até a conta da mesa ser fechada.</Text>
                  </>
                ) : null}
                <TouchableOpacity
                  style={styles.linkButton}
                  onPress={() => (invite ? shareInvite() : createInvite.mutate())}
                  disabled={createInvite.isPending}
                  accessibilityRole="button"
                  testID="invite-share"
                >
                  {createInvite.isPending
                    ? <ActivityIndicator color={colors.primaryForeground} />
                    : (
                      <>
                        <Ionicons name={invite ? 'share-outline' : 'qr-code-outline'} size={18} color={colors.primaryForeground} />
                        <Text style={styles.linkButtonText}>{invite ? 'Compartilhar link e código' : 'Gerar convite'}</Text>
                      </>
                    )}
                </TouchableOpacity>
                {feedback?.tone === 'error' ? <Text style={[styles.feedback, { color: colors.error }]}>{feedback.text}</Text> : null}
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
