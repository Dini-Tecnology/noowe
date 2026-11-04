import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Switch, TextInput, View } from 'react-native';
import { Text } from 'react-native-paper';
import QRCode from 'react-native-qrcode-svg';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter, type CouponRow } from '@okinawa/shared/services/supabase-api';
import { userErrorMessage } from '@okinawa/shared/utils/user-error-message';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2Shell } from './shared/V2Shell';
import { COUPON_STATUS_LABEL, COUPON_TEMPLATES, couponLink, couponSentence, draftToPayload, duplicateDraft, emptyDraft, menuChoices, rowToDraft, type CouponDraft, type MenuChoice } from './shared/coupons';

const formatCents = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const SERVICES = [['fine_dining', 'Fine'], ['casual_dining', 'Casual'], ['quick_service', 'Quick']] as const;
const AUDIENCES = [['all', 'Todos'], ['new', 'Novos'], ['vip', 'VIP'], ['birthday', 'Aniversariantes'], ['inactive', 'Sem visita']] as const;
const KINDS = [['percent', '% de desconto'], ['fixed', 'R$ de desconto'], ['free_item', 'Item grátis']] as const;
const SCOPES = [['bill', 'Conta inteira'], ['categories', 'Categorias'], ['items', 'Itens']] as const;
const QR_SIZE = 220;

/** Cupons do restaurante: criar em 3 passos, com a regra em uma frase e modelos prontos. Quem valida é o servidor. */
export default function PromotionsScreen() {
  const colors = useColors();
  const { restaurantId, serverRoles } = useRestaurantRole();
  const canManage = serverRoles.includes('owner') || serverRoles.includes('manager');
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [draft, setDraft] = useState<CouponDraft | null>(null);
  const [step, setStep] = useState(1);
  const [locked, setLocked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [menu, setMenu] = useState<MenuChoice[]>([]);
  const [qrFor, setQrFor] = useState<CouponRow | null>(null);
  const formScroll = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    if (!restaurantId) return;
    try {
      setCoupons(await supabaseApiAdapter.listCoupons(restaurantId));
    } catch {
      setCoupons([]);
    }
  }, [restaurantId]);

  useEffect(() => { void load(); }, [load]);

  // O cardápio dá nome ao item grátis e ao escopo, na edição e na frase da lista.
  useEffect(() => {
    if (!restaurantId || !canManage) return;
    supabaseApiAdapter.getMenu(restaurantId, true).then((data) => setMenu(menuChoices(data))).catch(() => setMenu([]));
  }, [restaurantId, canManage]);

  const names = useMemo(() => {
    const map: Record<string, string> = {};
    menu.forEach((category) => {
      map[category.id] = category.name;
      category.items.forEach((item) => { map[item.id] = item.name; });
    });
    return map;
  }, [menu]);
  const allItems = useMemo(() => menu.flatMap((category) => category.items), [menu]);

  // Cada passo começa do topo: o formulário anterior pode estar rolado.
  useEffect(() => { formScroll.current?.scrollTo({ y: 0, animated: false }); }, [step]);

  const sentence = useMemo(() => (draft ? couponSentence(draft, names) : ''), [draft, names]);
  const patch = (value: Partial<CouponDraft>) => setDraft((current) => (current ? { ...current, ...value } : current));
  const toggleIn = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);

  const start = (template?: Partial<CouponDraft>) => {
    setDraft({ ...emptyDraft(), ...template });
    setStep(1);
    setLocked(false);
  };

  const edit = (row: CouponRow) => {
    setDraft(rowToDraft(row));
    setLocked(row.locked);
    setStep(row.locked ? 3 : 1);
  };

  const save = async () => {
    if (!restaurantId || !draft) return;
    setSaving(true);
    try {
      await supabaseApiAdapter.saveCoupon(restaurantId, draftToPayload(draft));
      setDraft(null);
      await load();
    } catch (err) {
      Alert.alert('Não foi possível salvar', userErrorMessage(err, 'Tente novamente.'));
    } finally {
      setSaving(false);
    }
  };

  const duplicate = (row: CouponRow) => {
    setDraft(duplicateDraft(row));
    setStep(1);
    setLocked(false);
  };

  const end = (row: CouponRow) => {
    Alert.alert('Encerrar cupom', `${row.title} deixa de valer agora, e não volta. Para usar de novo, duplique.`, [
      { text: 'Voltar', style: 'cancel' },
      {
        text: 'Encerrar',
        style: 'destructive',
        onPress: () => void supabaseApiAdapter.endCoupon(row.id).then(load).catch((err) => Alert.alert('Não foi possível encerrar', userErrorMessage(err, 'Tente novamente.'))),
      },
    ]);
  };

  const share = (row: CouponRow) => {
    if (!restaurantId) return;
    void Share.share({ message: `${row.title}: use o cupom ${row.code} no app NOOWE. ${couponLink(restaurantId, row.code)}` });
  };

  const send = async (row: CouponRow) => {
    try {
      const result = await supabaseApiAdapter.sendCoupon(row.id);
      Alert.alert('Cupom enviado', `${result.recipients} cliente(s) que aceitaram receber ofertas.`);
    } catch (err) {
      Alert.alert('Não foi possível enviar', userErrorMessage(err, 'Tente novamente.'));
    }
  };

  const toggleActive = async (row: CouponRow) => {
    try {
      await supabaseApiAdapter.setCouponActive(row.id, row.status === 'paused');
      await load();
    } catch (err) {
      Alert.alert('Não foi possível alterar', userErrorMessage(err, 'Tente novamente.'));
    }
  };

  const chip = (selected: boolean) => [styles.chip, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}18` : colors.card }];
  const chipText = (selected: boolean) => ({ fontSize: 13, fontWeight: '700' as const, color: selected ? colors.primary : colors.foreground });
  const label = [styles.label, { color: colors.foregroundSecondary }];
  const input = [styles.input, { borderColor: colors.border, color: colors.foreground }];
  const panel = [styles.panel, { backgroundColor: colors.card, borderColor: colors.border }];

  if (draft) {
    return (
      <V2Shell title={locked ? 'Editar cupom' : `Novo cupom · passo ${step} de 3`} subtitle={sentence} showBack onBack={() => setDraft(null)}>
        <ScrollView ref={formScroll}>
          {locked ? <Text style={{ fontSize: 12, marginBottom: 12, color: colors.foregroundSecondary }}>Este cupom já foi usado: só validade e limite podem mudar.</Text> : null}

          {step === 1 && (
            <View style={panel}>
              <Text style={[styles.title, { color: colors.foreground }]}>O que o cliente ganha</Text>
              <Text style={label}>Nome do cupom</Text>
              <TextInput value={draft.title} onChangeText={(title) => patch({ title })} accessibilityLabel="Nome do cupom" style={input} />
              <View style={styles.row}>
                {KINDS.map(([kind, text]) => (
                  <Pressable key={kind} accessibilityRole="button" accessibilityState={{ selected: draft.discountKind === kind }} onPress={() => patch({ discountKind: kind })} style={chip(draft.discountKind === kind)}>
                    <Text style={chipText(draft.discountKind === kind)}>{text}</Text>
                  </Pressable>
                ))}
              </View>
              {draft.discountKind === 'percent' ? <TextInput value={draft.percent} onChangeText={(percent) => patch({ percent })} keyboardType="decimal-pad" accessibilityLabel="Percentual" style={input} /> : null}
              {draft.discountKind === 'fixed' ? <TextInput value={draft.reais} onChangeText={(reais) => patch({ reais })} keyboardType="decimal-pad" accessibilityLabel="Valor do desconto" style={input} /> : null}
              {draft.discountKind === 'free_item' ? (
                <>
                  <Text style={label}>Qual item é grátis</Text>
                  <View style={styles.row}>
                    {allItems.map((item) => (
                      <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: draft.freeItemId === item.id }} onPress={() => patch({ freeItemId: item.id })} style={chip(draft.freeItemId === item.id)}>
                        <Text style={chipText(draft.freeItemId === item.id)}>{item.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          )}

          {step === 2 && (
            <View style={panel}>
              <Text style={[styles.title, { color: colors.foreground }]}>Onde e quando vale</Text>
              <Text style={label}>Serviços (vazio é todos)</Text>
              <View style={styles.row}>
                {SERVICES.map(([service, text]) => (
                  <Pressable key={service} accessibilityRole="checkbox" accessibilityState={{ checked: draft.services.includes(service) }} onPress={() => patch({ services: toggleIn(draft.services, service) })} style={chip(draft.services.includes(service))}>
                    <Text style={chipText(draft.services.includes(service))}>{text}</Text>
                  </Pressable>
                ))}
              </View>
              {draft.discountKind !== 'free_item' ? (
                <>
                  <Text style={label}>Vale para</Text>
                  <View style={styles.row}>
                    {SCOPES.map(([scope, text]) => (
                      <Pressable key={scope} accessibilityRole="button" accessibilityState={{ selected: draft.scope === scope }} onPress={() => patch({ scope, scopeIds: [] })} style={chip(draft.scope === scope)}>
                        <Text style={chipText(draft.scope === scope)}>{text}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {draft.scope !== 'bill' ? (
                    <View style={styles.row}>
                      {(draft.scope === 'categories' ? menu : allItems).map((choice) => (
                        <Pressable key={choice.id} accessibilityRole="checkbox" accessibilityState={{ checked: draft.scopeIds.includes(choice.id) }} onPress={() => patch({ scopeIds: toggleIn(draft.scopeIds, choice.id) })} style={chip(draft.scopeIds.includes(choice.id))}>
                          <Text style={chipText(draft.scopeIds.includes(choice.id))}>{choice.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              ) : null}
              <Text style={label}>Dias (vazio é todos)</Text>
              <View style={styles.row}>
                {DAY_LABELS.map((text, day) => (
                  <Pressable key={text} accessibilityRole="checkbox" accessibilityState={{ checked: draft.dow.includes(day) }} onPress={() => patch({ dow: toggleIn(draft.dow, day) })} style={chip(draft.dow.includes(day))}>
                    <Text style={chipText(draft.dow.includes(day))}>{text}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={label}>Horário (opcional)</Text>
              <View style={styles.row}>
                <TextInput value={draft.hoursFrom} onChangeText={(hoursFrom) => patch({ hoursFrom })} placeholder="15:00" placeholderTextColor={colors.foregroundSecondary} accessibilityLabel="Das" style={[input, styles.half]} />
                <TextInput value={draft.hoursUntil} onChangeText={(hoursUntil) => patch({ hoursUntil })} placeholder="18:00" placeholderTextColor={colors.foregroundSecondary} accessibilityLabel="Até" style={[input, styles.half]} />
              </View>
              <Text style={label}>Pedido mínimo (R$, opcional)</Text>
              <TextInput value={draft.minOrderReais} onChangeText={(minOrderReais) => patch({ minOrderReais })} keyboardType="decimal-pad" accessibilityLabel="Pedido mínimo" style={input} />
              <Text style={label}>Início (DD/MM/AAAA)</Text>
              <TextInput value={draft.from} onChangeText={(from) => patch({ from })} keyboardType="numbers-and-punctuation" accessibilityLabel="Início" style={input} />
            </View>
          )}

          {step === 3 && (
            <View style={panel}>
              {!locked ? (
                <>
                  <Text style={[styles.title, { color: colors.foreground }]}>Para quem e quantas vezes</Text>
                  <View style={styles.row}>
                    {AUDIENCES.map(([audience, text]) => (
                      <Pressable key={audience} accessibilityRole="button" accessibilityState={{ selected: draft.audience === audience }} onPress={() => patch({ audience })} style={chip(draft.audience === audience)}>
                        <Text style={chipText(draft.audience === audience)}>{text}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {draft.audience === 'inactive' ? <TextInput value={draft.inactiveDays} onChangeText={(inactiveDays) => patch({ inactiveDays })} keyboardType="number-pad" placeholder="Dias sem visita" placeholderTextColor={colors.foregroundSecondary} accessibilityLabel="Dias sem visita" style={input} /> : null}
                  <Text style={label}>Código (vazio gera um)</Text>
                  <TextInput value={draft.code} onChangeText={(code) => patch({ code })} autoCapitalize="characters" accessibilityLabel="Código do cupom" style={input} />
                  <Text style={label}>Usos por cliente</Text>
                  <TextInput value={draft.maxUsesPerUser} onChangeText={(maxUsesPerUser) => patch({ maxUsesPerUser })} keyboardType="number-pad" accessibilityLabel="Usos por cliente" style={input} />
                  <View style={styles.switchRow}><Text style={{ flex: 1, color: colors.foreground }}>Entra sozinho quando a regra bate</Text><Switch value={draft.isAuto} onValueChange={(isAuto) => patch({ isAuto })} accessibilityLabel="Cupom automático" /></View>
                  <View style={styles.switchRow}><Text style={{ flex: 1, color: colors.foreground }}>Aparece na página do restaurante</Text><Switch value={draft.isVisible} onValueChange={(isVisible) => patch({ isVisible })} accessibilityLabel="Cupom visível" /></View>
                </>
              ) : null}
              <Text style={label}>Limite total de usos (opcional)</Text>
              <TextInput value={draft.maxUses} onChangeText={(maxUses) => patch({ maxUses })} keyboardType="number-pad" accessibilityLabel="Limite de usos" style={input} />
              <Text style={label}>Vale até (DD/MM/AAAA)</Text>
              <TextInput value={draft.until} onChangeText={(until) => patch({ until })} keyboardType="numbers-and-punctuation" accessibilityLabel="Vale até" style={input} />
            </View>
          )}

          <View style={styles.row}>
            {step > 1 && !locked ? (
              <Pressable accessibilityRole="button" onPress={() => setStep(step - 1)} style={[styles.action, { borderColor: colors.border, borderWidth: 1 }]}>
                <Text style={{ fontWeight: '800', color: colors.foreground }}>Voltar</Text>
              </Pressable>
            ) : null}
            {step < 3 ? (
              <Pressable accessibilityRole="button" onPress={() => setStep(step + 1)} style={[styles.action, { backgroundColor: colors.primary }]}>
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Continuar</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.action, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>{saving ? 'Salvando…' : 'Salvar cupom'}</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </V2Shell>
    );
  }

  return (
    <V2Shell title="Promoções" subtitle="Cupons do restaurante" showBack>
      <ScrollView>
        {canManage ? (
          <View style={panel}>
            <Text style={[styles.title, { color: colors.foreground }]}>Comece com um toque</Text>
            <View style={styles.row}>
              {COUPON_TEMPLATES.map((template) => (
                <Pressable key={template.label} accessibilityRole="button" onPress={() => start(template.draft)} style={chip(false)}>
                  <Text style={chipText(false)}>{template.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityRole="button" onPress={() => start()} style={[styles.action, { backgroundColor: colors.primary }]}>
              <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Novo cupom</Text>
            </Pressable>
          </View>
        ) : null}

        {coupons.length === 0 ? <Text style={{ textAlign: 'center', color: colors.foregroundSecondary, marginTop: 24 }}>{canManage ? 'Nenhum cupom ainda.' : 'Nenhum cupom ativo.'}</Text> : null}
        {coupons.map((row) => {
          const link = [styles.linkText, { color: colors.primary }];
          return (
            <View key={row.id} style={panel}>
              <Text style={[styles.title, { color: colors.foreground }]}>{row.title} · {row.code}</Text>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.primary }}>{COUPON_STATUS_LABEL[row.status]}</Text>
              <Text style={{ color: colors.foregroundSecondary }}>{couponSentence(rowToDraft(row), names)}</Text>
              {canManage ? (
                <>
                  <Text style={{ color: colors.foregroundSecondary }}>{row.uses ?? 0} uso(s) · {formatCents(row.discountGivenCents ?? 0)} em desconto</Text>
                  <Text style={{ color: colors.foregroundSecondary }}>Faturamento {formatCents(row.revenueCents ?? 0)} · ticket médio {formatCents(row.avgTicketCents ?? 0)} · {row.newCustomers ?? 0} cliente(s) novo(s)</Text>
                  <View style={styles.row}>
                    {row.status !== 'ended' ? <Pressable accessibilityRole="button" onPress={() => edit(row)}><Text style={link}>Editar</Text></Pressable> : null}
                    <Pressable accessibilityRole="button" onPress={() => duplicate(row)}><Text style={link}>Duplicar</Text></Pressable>
                    {row.status !== 'ended' ? (
                      <>
                        <Pressable accessibilityRole="button" onPress={() => setQrFor(row)}><Text style={link}>Link e QR</Text></Pressable>
                        <Pressable accessibilityRole="button" onPress={() => void send(row)}><Text style={link}>Enviar ao grupo</Text></Pressable>
                        <Pressable accessibilityRole="button" onPress={() => void toggleActive(row)}><Text style={link}>{row.status === 'paused' ? 'Ativar' : 'Pausar'}</Text></Pressable>
                        <Pressable accessibilityRole="button" onPress={() => end(row)}><Text style={link}>Encerrar</Text></Pressable>
                      </>
                    ) : null}
                  </View>
                </>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
      <Modal visible={qrFor != null} transparent animationType="fade" onRequestClose={() => setQrFor(null)}>
        <View style={styles.qrBackdrop}>
          {qrFor && restaurantId ? (
            <View style={[styles.qrCard, { backgroundColor: colors.card }]}>
              <Text style={[styles.title, { color: colors.foreground }]}>{qrFor.title} · {qrFor.code}</Text>
              <QRCode value={couponLink(restaurantId, qrFor.code)} size={QR_SIZE} />
              <Text selectable style={{ fontSize: 12, textAlign: 'center', color: colors.foregroundSecondary }}>{couponLink(restaurantId, qrFor.code)}</Text>
              <Pressable accessibilityRole="button" onPress={() => share(qrFor)} style={[styles.action, { backgroundColor: colors.primary, alignSelf: 'stretch' }]}>
                <Text style={[styles.actionText, { color: colors.primaryForeground }]}>Compartilhar</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setQrFor(null)}><Text style={[styles.linkText, { color: colors.primary }]}>Fechar</Text></Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, gap: 8 },
  title: { fontSize: 15, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  half: { flex: 1, minWidth: 100 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  action: { flexGrow: 1, marginTop: 4, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionText: { fontWeight: '800' },
  linkText: { fontWeight: '700' },
  qrBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' },
  qrCard: { width: '100%', maxWidth: 360, borderRadius: 20, padding: 20, alignItems: 'center', gap: 12 },
});
