import React, { useMemo, useState } from 'react';
import { Alert, Image, Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import { SelectChip, SelectionSection, HintBanner, ObservationsField } from '../../components/restaurant/SelectionControls';
import { useVisitSession } from '../../contexts/VisitSessionContext';
import { useServiceTypeFor } from '../../hooks/useServiceTypeFeatures';
import customerBackend from '../../services/customer-backend';
import {
  MIN_LEAD_MINUTES,
  buildTimeSlots,
  parseDayHours,
  toDateKey,
  type DayHours,
} from './reservation-slots';

const GUESTS = ['1', '2', '3', '4', '5', '6+'] as const;

/** Ordem ISO — Postgres armazena os dias em inglês, começando pela segunda. */
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
type Weekday = typeof WEEKDAYS[number];

const WEEKDAY_SHORT_PT: Record<Weekday, string> = {
  sunday: 'Dom', monday: 'Seg', tuesday: 'Ter', wednesday: 'Qua',
  thursday: 'Qui', friday: 'Sex', saturday: 'Sáb',
};

/** Janela de chips fixos exibida na primeira linha, antes do "Outra data". */
const QUICK_DATE_WINDOW_DAYS = 14;
/** Limite superior do date picker: 60 dias cobre reservas para férias, feriados etc. */
const MAX_LEAD_DAYS = 60;

function hoursOfDate(openingHours: Record<string, unknown>, date: Date): DayHours | null {
  const weekday = WEEKDAYS[date.getDay()];
  return parseDayHours(openingHours[weekday]);
}

function isOpenOn(openingHours: Record<string, unknown>, date: Date): boolean {
  const hours = hoursOfDate(openingHours, date);
  return !!hours && !hours.closed;
}

function timeToIsoOnDate(time: string, date: Date): string {
  const [hours, minutes] = time.split(':').map(Number);
  const composed = new Date(date);
  composed.setHours(hours, minutes, 0, 0);
  return composed.toISOString();
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1, 0, 0, 0, 0);
}

function todayStart(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function dayLabel(date: Date): string {
  const today = todayStart();
  const diffDays = Math.round((date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  const weekday = WEEKDAY_SHORT_PT[WEEKDAYS[date.getDay()]];
  return `${weekday} ${date.getDate()}/${date.getMonth() + 1}`;
}

/**
 * Próximos dias em que o restaurante abre, começando por hoje quando ainda dá
 * tempo de reservar. `QUICK_DATE_WINDOW_DAYS` cobre uma quinzena — o suficiente
 * para chips clicáveis; datas mais distantes ficam no "Outra data".
 */
function upcomingOpenDates(openingHours: Record<string, unknown>, limit = 7): Date[] {
  const result: Date[] = [];
  const today = todayStart();
  for (let offset = 0; offset < QUICK_DATE_WINDOW_DAYS && result.length < limit; offset++) {
    const candidate = new Date(today);
    candidate.setDate(today.getDate() + offset);
    const hours = hoursOfDate(openingHours, candidate);
    if (!hours || hours.closed) continue;
    // Se é hoje e todos os slots já passaram, pula para o próximo dia aberto.
    if (offset === 0 && buildTimeSlots(hours, candidate).length === 0) continue;
    result.push(candidate);
  }
  return result;
}

export default function CreateReservationScreen({ route, navigation }: any) {
  const colors = useColors();
  const queryClient = useQueryClient();
  const visit = useVisitSession();
  const restaurantId = route.params?.restaurantId ?? visit.session?.restaurantId;
  const restaurantQuery = useQuery({
    queryKey: ['restaurant', restaurantId],
    queryFn: () => customerBackend.getRestaurant(restaurantId!),
    enabled: !!restaurantId,
    staleTime: 5 * 60 * 1000,
  });
  const restaurantName = route.params?.restaurantName ?? restaurantQuery.data?.name ?? 'Restaurante selecionado';
  const restaurantAddress = route.params?.restaurantAddress ?? restaurantQuery.data?.address ?? '';
  const restaurantPhoto =
    route.params?.restaurantPhoto ?? restaurantQuery.data?.bannerUrl ?? restaurantQuery.data?.logoUrl ?? null;
  const openingHours = useMemo(
    () => (restaurantQuery.data?.openingHours ?? {}) as Record<string, unknown>,
    [restaurantQuery.data?.openingHours],
  );
  const { status: serviceTypeStatus, features } = useServiceTypeFor(restaurantId);
  const reservationsUnavailable = !!restaurantId && serviceTypeStatus !== 'loading' && !features.reservations;

  const openDates = useMemo(() => upcomingOpenDates(openingHours), [openingHours]);
  const initialDateKey = openDates[0] ? toDateKey(openDates[0]) : toDateKey(new Date());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(initialDateKey);
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const [guests, setGuests] = useState('2');
  const [notes, setNotes] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const selectedDate = useMemo(() => parseDateKey(selectedDateKey), [selectedDateKey]);
  const selectedDayHours = useMemo(() => hoursOfDate(openingHours, selectedDate), [openingHours, selectedDate]);
  const partySize = guests === '6+' ? 6 : Number(guests);

  // Relógio ticando de minuto em minuto. Sem isso, `buildTimeSlots` congela o
  // `now` na primeira montagem e um slot que já passou do limite de 30 min
  // continua clicável — o usuário vê o erro "escolha um horário com pelo menos
  // 30 minutos de antecedência" que a RPC devolve no submit.
  const [nowTick, setNowTick] = useState(0);
  React.useEffect(() => {
    const timer = setInterval(() => setNowTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(timer);
  }, []);

  const candidateTimes = useMemo(() => {
    if (!selectedDayHours || selectedDayHours.closed) return [];
    return buildTimeSlots(selectedDayHours, selectedDate, new Date());
    // `nowTick` é intencional na lista — força recálculo periódico.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayHours, selectedDate, nowTick]);

  const candidateSlotIsoList = useMemo(
    () => candidateTimes.map((time) => timeToIsoOnDate(time, selectedDate)),
    [candidateTimes, selectedDate],
  );

  // Cruza os slots derivados de opening_hours com a disponibilidade real (mesas
  // já reservadas na janela ±90 min). O bug de "No availability for this time"
  // acontecia porque o app mostrava um horário que o RPC de criação recusaria —
  // essa query aplica a mesma regra do backend antes do usuário tentar reservar.
  const availabilityQuery = useQuery({
    queryKey: ['reservation-availability', restaurantId, candidateSlotIsoList],
    queryFn: () => customerBackend.listReservationAvailability(restaurantId!, candidateSlotIsoList),
    enabled: !!restaurantId && candidateSlotIsoList.length > 0,
    staleTime: 30 * 1000,
  });

  // Postgres serializa timestamptz como "...+00:00" e o JS como "...Z"; string
  // não bate. Chaveia por epoch em ms para comparar sem depender de formato.
  const remainingByEpoch = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of availabilityQuery.data ?? []) {
      const epoch = Date.parse(row.slot);
      if (!Number.isNaN(epoch)) map.set(epoch, row.remaining);
    }
    return map;
  }, [availabilityQuery.data]);

  // A resposta da RPC precisa cobrir os slots atuais antes de exibirmos algo —
  // ao trocar de data, o React Query mantém `data` da requisição anterior por
  // um instante; renderizar os slots nesse frame ilude o usuário (aparecem e
  // somem). Só liberamos a lista quando todo candidato tem linha na resposta.
  const availabilityMatchesCurrent = useMemo(() => {
    if (candidateSlotIsoList.length === 0) return true;
    if (!availabilityQuery.data) return false;
    return candidateSlotIsoList.every((iso) => remainingByEpoch.has(Date.parse(iso)));
  }, [candidateSlotIsoList, availabilityQuery.data, remainingByEpoch]);

  const availableTimes = useMemo(() => {
    if (!availabilityMatchesCurrent) return [];
    return candidateTimes.filter((time) => {
      const epoch = Date.parse(timeToIsoOnDate(time, selectedDate));
      const remaining = remainingByEpoch.get(epoch);
      if (remaining === undefined) return false;
      return remaining >= partySize;
    });
  }, [availabilityMatchesCurrent, candidateTimes, selectedDate, partySize, remainingByEpoch]);

  // Uma vez conhecidas as horas, o horário selecionado precisa continuar válido —
  // trocar de data pode invalidar a hora anterior. Cai silenciosamente para o
  // primeiro slot disponível em vez de deixar o usuário submeter um slot morto.
  const selectedTime = pickedTime && availableTimes.includes(pickedTime)
    ? pickedTime
    : availableTimes[0] ?? null;

  const isDateExplicitlyPresent = useMemo(
    () => openDates.some((d) => toDateKey(d) === selectedDateKey),
    [openDates, selectedDateKey],
  );

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedTime) throw new Error('Escolha um horário disponível.');
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const reservationDate = new Date(selectedDate);
      reservationDate.setHours(hours, minutes, 0, 0);
      // O slot mais cedo ainda pode ficar abaixo da folga se o usuário demorou:
      // recalcula na hora de enviar em vez de confiar no filtro do render.
      const minReservationTime = new Date(Date.now() + MIN_LEAD_MINUTES * 60 * 1000);
      if (reservationDate < minReservationTime) {
        throw new Error('Escolha um horário com pelo menos 30 minutos de antecedência.');
      }
      return customerBackend.createReservation({
        restaurantId,
        reservationTime: reservationDate.toISOString(),
        partySize: guests === '6+' ? 6 : Number(guests),
        specialRequests: notes || undefined,
      });
    },
    onSuccess: async (reservation) => {
      void queryClient.invalidateQueries({ queryKey: ['reservations'] });
      void queryClient.invalidateQueries({ queryKey: ['reservation-availability', restaurantId] });
      let inviteUrl: string | undefined;
      try {
        inviteUrl = await customerBackend.createReservationInvite(reservation.id);
      } catch {
        // The confirmation remains valid even if link generation is retried later.
      }
      navigation.replace('ReservationConfirmation', {
        reservation: { ...reservation, restaurantName },
        inviteUrl,
      });
    },
    onError: (error: Error) => Alert.alert('Não foi possível reservar', error.message),
  });

  const handleDatePicked = (picked: Date) => {
    setSelectedDateKey(toDateKey(picked));
    setDatePickerOpen(false);
  };

  const maxSelectableDate = useMemo(() => {
    const max = todayStart();
    max.setDate(max.getDate() + MAX_LEAD_DAYS);
    return max;
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        scroll: { flex: 1, backgroundColor: colors.background },
        content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
        header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
        back: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.backgroundTertiary, alignItems: 'center', justifyContent: 'center' },
        title: { flex: 1, marginRight: 32, textAlign: 'center', fontSize: 17, fontWeight: '800', color: colors.foreground },
        restaurantCard: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 17, backgroundColor: colors.card, marginBottom: 18 },
        restaurantIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#FFF0EA', alignItems: 'center', justifyContent: 'center' },
        restaurantPhoto: { width: 42, height: 42, borderRadius: 13, backgroundColor: colors.backgroundTertiary },
        restaurantName: { color: colors.foreground, fontSize: 14, fontWeight: '800', marginBottom: 3 },
        restaurantAddress: { color: colors.foregroundSecondary, fontSize: 11 },
        chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
        timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
        timeChip: { width: '22%' },
        emptyTimes: {
          padding: 12, borderRadius: 12, backgroundColor: colors.backgroundTertiary,
          color: colors.foregroundSecondary, fontSize: 13,
        },
        cta: { marginTop: 8, paddingVertical: 16, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center' },
        ctaDisabled: { opacity: 0.6 },
        ctaText: { color: colors.primaryForeground, fontSize: 16, fontWeight: '700' },
      }),
    [colors],
  );

  const noOpenDates = openDates.length === 0 && !restaurantQuery.isLoading;

  return (
    <ScreenContainer edges={['top', 'bottom']} hasKeyboard>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityRole="button"><Ionicons name="arrow-back" size={18} color={colors.foregroundSecondary} /></TouchableOpacity>
          <Text style={styles.title}>Reservar Mesa</Text>
        </View>

        <View style={styles.restaurantCard}>
          {restaurantPhoto ? (
            <Image source={{ uri: restaurantPhoto }} style={styles.restaurantPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.restaurantIcon}><Ionicons name="restaurant-outline" size={21} color={colors.primary} /></View>
          )}
          <View style={{ flex: 1 }}><Text style={styles.restaurantName}>{restaurantName}</Text>{restaurantAddress ? <Text style={styles.restaurantAddress}>{restaurantAddress}</Text> : null}</View>
        </View>

        {!restaurantId && <HintBanner message="Selecione um restaurante antes de reservar." />}
        {reservationsUnavailable && <HintBanner message="Este restaurante não aceita reservas pelo app." />}
        {noOpenDates && (
          <HintBanner message="Este restaurante não tem horários disponíveis para reserva nas próximas semanas." />
        )}

        <SelectionSection title="Data">
          <View style={styles.chipRow}>
            {openDates.map((date) => {
              const key = toDateKey(date);
              return (
                <SelectChip
                  key={key}
                  label={dayLabel(date)}
                  selected={selectedDateKey === key}
                  onPress={() => setSelectedDateKey(key)}
                />
              );
            })}
            {/* Chip que abre o calendário — dias que o restaurante estiver
                fechado são bloqueados no `handleDatePicked`. */}
            <SelectChip
              label={isDateExplicitlyPresent ? 'Outra data' : dayLabel(selectedDate)}
              selected={!isDateExplicitlyPresent}
              onPress={() => setDatePickerOpen(true)}
            />
          </View>
        </SelectionSection>

        <OpeningHoursCalendarModal
          visible={datePickerOpen}
          selectedDate={selectedDate}
          minDate={todayStart()}
          maxDate={maxSelectableDate}
          openingHours={openingHours}
          onClose={() => setDatePickerOpen(false)}
          onSelect={handleDatePicked}
        />


        <SelectionSection title="Horário">
          {availableTimes.length === 0 ? (
            <Text style={styles.emptyTimes}>
              {selectedDayHours?.closed
                ? 'Restaurante fechado nesta data.'
                : candidateTimes.length === 0
                  ? 'Nenhum horário disponível para reserva nesta data.'
                  : !availabilityMatchesCurrent
                    ? 'Verificando disponibilidade...'
                    : `Sem mesas livres para ${partySize} ${partySize === 1 ? 'pessoa' : 'pessoas'} nesta data. Tente outro dia ou reduza o grupo.`}
            </Text>
          ) : (
            <View style={styles.timeGrid}>
              {availableTimes.map((time) => (
                <View key={time} style={styles.timeChip}>
                  <SelectChip label={time} selected={selectedTime === time} onPress={() => setPickedTime(time)} />
                </View>
              ))}
            </View>
          )}
        </SelectionSection>

        <SelectionSection title="Convidados">
          <View style={styles.chipRow}>
            {GUESTS.map((g) => (
              <SelectChip key={g} label={g} variant="circle" selected={guests === g} onPress={() => setGuests(g)} />
            ))}
          </View>
        </SelectionSection>

        <ObservationsField value={notes} onChangeText={setNotes} compact />

        <TouchableOpacity
          style={[
            styles.cta,
            (!restaurantId || reservationsUnavailable || mutation.isPending || !selectedTime) && styles.ctaDisabled,
          ]}
          onPress={() => mutation.mutate()}
          disabled={!restaurantId || reservationsUnavailable || mutation.isPending || !selectedTime}
          accessibilityRole="button"
        >
          <Text style={styles.ctaText}>{mutation.isPending ? 'Confirmando...' : 'Confirmar Reserva'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </ScreenContainer>
  );
}

const MONTH_NAMES_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

const WEEKDAY_LABELS_PT: string[] = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface CalendarModalProps {
  visible: boolean;
  selectedDate: Date;
  minDate: Date;
  maxDate: Date;
  openingHours: Record<string, unknown>;
  onClose: () => void;
  onSelect: (date: Date) => void;
}

/**
 * Calendário próprio para não depender do estilo do DateTimePicker nativo, que
 * ignora a paleta do app e não permite desabilitar dias específicos. Os dias
 * fechados do restaurante e as datas fora da janela `[minDate, maxDate]` são
 * renderizados como célula "disabled": sem cor de primário, com opacidade
 * reduzida e sem responder ao toque (o TouchableOpacity recebe `disabled`).
 */
function OpeningHoursCalendarModal({
  visible, selectedDate, minDate, maxDate, openingHours, onClose, onSelect,
}: CalendarModalProps) {
  const colors = useColors();
  const [monthCursor, setMonthCursor] = useState<Date>(() => {
    const cursor = new Date(selectedDate);
    cursor.setDate(1);
    cursor.setHours(0, 0, 0, 0);
    return cursor;
  });

  // Quando o modal reabre, começa no mês da data selecionada. Sem esse reset o
  // usuário pode ver o mês onde parou da última abertura, o que confunde.
  // Ajuste durante o render (padrão do React para "resetar estado quando a prop
  // muda") em vez de effect, que renderizaria o mês antigo por um frame.
  const resetKey = visible ? selectedDate.getTime() : null;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    if (visible) {
      const cursor = new Date(selectedDate);
      cursor.setDate(1);
      cursor.setHours(0, 0, 0, 0);
      setMonthCursor(cursor);
    }
  }

  const monthLabel = useMemo(() => {
    const name = MONTH_NAMES_PT[monthCursor.getMonth()];
    // Only the month is capitalized — `textTransform: 'capitalize'` would also
    // turn the preposition into "De".
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${monthCursor.getFullYear()}`;
  }, [monthCursor]);

  const cells = useMemo(() => {
    // Grade de 6 linhas × 7 colunas, ancorada em domingo — as linhas antes do
    // dia 1 e depois do último dia recebem `null` para virarem espaços vazios.
    const firstDay = new Date(monthCursor);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate();
    const cellsCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
    const result: (Date | null)[] = [];
    for (let index = 0; index < cellsCount; index++) {
      const dayNumber = index - startOffset + 1;
      if (dayNumber < 1 || dayNumber > daysInMonth) {
        result.push(null);
      } else {
        result.push(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNumber));
      }
    }
    return result;
  }, [monthCursor]);

  const canGoPrev = useMemo(() => {
    const prevMonthEnd = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 0);
    return prevMonthEnd >= minDate;
  }, [monthCursor, minDate]);

  const canGoNext = useMemo(() => {
    const nextMonthStart = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1);
    return nextMonthStart <= maxDate;
  }, [monthCursor, maxDate]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
        sheet: {
          backgroundColor: colors.background,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 24,
        },
        handle: {
          alignSelf: 'center', width: 44, height: 4, borderRadius: 2,
          backgroundColor: colors.border, marginBottom: 14,
        },
        header: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        },
        headerTitle: { fontSize: 18, fontWeight: '800', color: colors.foreground },
        closeBtn: {
          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        monthRow: {
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingVertical: 12,
        },
        monthLabel: { fontSize: 15, fontWeight: '700', color: colors.foreground },
        navBtn: {
          width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
          backgroundColor: colors.backgroundTertiary,
        },
        navBtnDisabled: { opacity: 0.4 },
        weekRow: { flexDirection: 'row', paddingBottom: 6 },
        weekCell: {
          flex: 1, alignItems: 'center', paddingVertical: 6,
        },
        weekCellText: {
          fontSize: 11, fontWeight: '700', color: colors.foregroundMuted, letterSpacing: 0.5,
        },
        grid: { flexDirection: 'row', flexWrap: 'wrap' },
        dayCell: {
          width: `${100 / 7}%`,
          aspectRatio: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 2,
        },
        dayInner: {
          width: '82%', maxWidth: 44, aspectRatio: 1, borderRadius: 999,
          alignItems: 'center', justifyContent: 'center',
        },
        dayInnerAvailable: { backgroundColor: 'transparent' },
        dayInnerSelected: { backgroundColor: colors.primary },
        dayInnerToday: { borderWidth: 1.5, borderColor: colors.primary },
        dayInnerDisabled: { backgroundColor: 'transparent' },
        dayText: { fontSize: 15, fontWeight: '600', color: colors.foreground },
        dayTextDisabled: { color: colors.foregroundMuted, opacity: 0.55, fontWeight: '500' },
        dayTextSelected: { color: colors.primaryForeground, fontWeight: '800' },
        legend: {
          flexDirection: 'row', flexWrap: 'wrap', gap: 12,
          marginTop: 12, paddingTop: 12,
          borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
        },
        legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
        legendDot: { width: 10, height: 10, borderRadius: 5 },
        legendText: { fontSize: 12, color: colors.foregroundSecondary },
      }),
    [colors],
  );

  const selectedKey = toDateKey(selectedDate);
  const today = todayStart();
  const todayKey = toDateKey(today);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Fechar calendário">
        <Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Escolher data</Text>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Fechar calendário"
              hitSlop={8}
            >
              <Ionicons name="close" size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={styles.monthRow}>
            <TouchableOpacity
              style={[styles.navBtn, !canGoPrev && styles.navBtnDisabled]}
              onPress={() => {
                if (!canGoPrev) return;
                const prev = new Date(monthCursor);
                prev.setMonth(prev.getMonth() - 1);
                setMonthCursor(prev);
              }}
              disabled={!canGoPrev}
              accessibilityRole="button"
              accessibilityLabel="Mês anterior"
            >
              <Ionicons name="chevron-back" size={18} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
            <TouchableOpacity
              style={[styles.navBtn, !canGoNext && styles.navBtnDisabled]}
              onPress={() => {
                if (!canGoNext) return;
                const next = new Date(monthCursor);
                next.setMonth(next.getMonth() + 1);
                setMonthCursor(next);
              }}
              disabled={!canGoNext}
              accessibilityRole="button"
              accessibilityLabel="Próximo mês"
            >
              <Ionicons name="chevron-forward" size={18} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LABELS_PT.map((label) => (
              <View key={label} style={styles.weekCell}>
                <Text style={styles.weekCellText}>{label.toUpperCase()}</Text>
              </View>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((date, index) => {
              if (!date) return <View key={`empty-${index}`} style={styles.dayCell} />;
              const key = toDateKey(date);
              const isPast = date < minDate;
              const isBeyond = date > maxDate;
              const closed = !isOpenOn(openingHours, date);
              const disabled = isPast || isBeyond || closed;
              const isSelected = !disabled && key === selectedKey;
              const isToday = key === todayKey;
              return (
                <View key={key} style={styles.dayCell}>
                  <TouchableOpacity
                    style={[
                      styles.dayInner,
                      !disabled && !isSelected && styles.dayInnerAvailable,
                      isSelected && styles.dayInnerSelected,
                      !isSelected && isToday && !disabled && styles.dayInnerToday,
                      disabled && styles.dayInnerDisabled,
                    ]}
                    disabled={disabled}
                    onPress={() => onSelect(date)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled }}
                    accessibilityLabel={
                      disabled
                        ? `${date.getDate()} de ${MONTH_NAMES_PT[date.getMonth()]}, indisponível`
                        : `${date.getDate()} de ${MONTH_NAMES_PT[date.getMonth()]}`
                    }
                  >
                    <Text
                      style={[
                        styles.dayText,
                        disabled && styles.dayTextDisabled,
                        isSelected && styles.dayTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>Selecionado</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent' }]} />
              <Text style={styles.legendText}>Hoje</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.backgroundTertiary }]} />
              <Text style={styles.legendText}>Fechado / indisponível</Text>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
