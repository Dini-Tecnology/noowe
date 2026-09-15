import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import {
  getBrazilianCities,
  getBrazilianStates,
  lookupBrazilianPostalCode,
  type BrazilCityOption,
  type BrazilStateOption,
} from '@okinawa/shared/services/brazil-location';
import { formatBrazilianPostalCode } from '@okinawa/shared/utils/phone-validation';
import { AuthTextField } from '../auth/AuthTextField';
import { AUTH_BRAND, authFieldStyles } from '../auth/authScreenTheme';

export interface BrazilianAddressValue {
  postalCode: string;
  city: string;
  state: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
}

interface Props {
  value: BrazilianAddressValue;
  onChange: (value: BrazilianAddressValue) => void;
  disabled?: boolean;
}

type PickerMode = 'city' | 'state' | null;

export function BrazilianAddressFields({ value, onChange, disabled = false }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [postalCodeLoading, setPostalCodeLoading] = useState(false);
  const [postalCodeError, setPostalCodeError] = useState('');
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [query, setQuery] = useState('');
  const [states, setStates] = useState<BrazilStateOption[]>([]);
  const [cities, setCities] = useState<BrazilCityOption[]>([]);
  const [openCityAfterState, setOpenCityAfterState] = useState(false);

  const update = (patch: Partial<BrazilianAddressValue>) => onChange({ ...value, ...patch });

  const searchPostalCode = async () => {
    const digits = value.postalCode.replace(/\D/g, '');
    if (digits.length !== 8) {
      setPostalCodeError('Informe um CEP válido com 8 números.');
      return;
    }
    setPostalCodeLoading(true);
    setPostalCodeError('');
    try {
      const address = await lookupBrazilianPostalCode(digits);
      update({
        postalCode: formatBrazilianPostalCode(address.postalCode),
        city: address.city,
        state: address.state,
        street: address.street,
        complement: value.complement || address.complement,
        neighborhood: address.neighborhood,
      });
    } catch (error) {
      setPostalCodeError(error instanceof Error ? error.message : 'Não foi possível consultar o CEP.');
    } finally {
      setPostalCodeLoading(false);
    }
  };

  const openPicker = async (mode: Exclude<PickerMode, null>) => {
    const resolvedMode = mode === 'city' && !value.state ? 'state' : mode;
    setOpenCityAfterState(mode === 'city' && !value.state);
    setPickerMode(resolvedMode);
    setPickerLoading(true);
    setPickerError('');
    setQuery('');
    try {
      if (resolvedMode === 'state') setStates(await getBrazilianStates());
      else setCities(await getBrazilianCities(value.state || undefined));
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : 'Não foi possível carregar as opções.');
    } finally {
      setPickerLoading(false);
    }
  };

  const closePicker = () => {
    setPickerMode(null);
    setOpenCityAfterState(false);
    setQuery('');
  };

  const selectOption = async (item: BrazilCityOption | BrazilStateOption) => {
    if ('stateCode' in item) {
      update({ city: item.name, state: item.stateCode });
      closePicker();
      return;
    }

    update({ state: item.code, city: value.state === item.code ? value.city : '' });
    if (!openCityAfterState) {
      closePicker();
      return;
    }

    setOpenCityAfterState(false);
    setPickerMode('city');
    setPickerLoading(true);
    setPickerError('');
    setQuery('');
    try {
      setCities(await getBrazilianCities(item.code));
    } catch (error) {
      setPickerError(error instanceof Error ? error.message : 'Não foi possível carregar as cidades.');
    } finally {
      setPickerLoading(false);
    }
  };

  const stateItems = states.filter((item) => `${item.name} ${item.code}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const cityItems = cities.filter((item) => `${item.name} ${item.stateCode}`.toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR')));
  const pickerItems: (BrazilCityOption | BrazilStateOption)[] = pickerMode === 'city' ? cityItems : stateItems;

  return (
    <>
      <View>
        <AuthTextField
          label="CEP"
          value={value.postalCode}
          onChangeText={(text) => {
            setPostalCodeError('');
            update({ postalCode: formatBrazilianPostalCode(text) });
          }}
          placeholder="00000-000"
          icon="map-marker-radius-outline"
          error={postalCodeError || undefined}
          inputProps={{ keyboardType: 'numeric', maxLength: 9, editable: !disabled }}
          rightAction={
            <TouchableOpacity
              onPress={() => void searchPostalCode()}
              disabled={disabled || postalCodeLoading || value.postalCode.replace(/\D/g, '').length !== 8}
              style={[
                styles.postalSearchButton,
                { backgroundColor: colors.secondary },
                (disabled || postalCodeLoading || value.postalCode.replace(/\D/g, '').length !== 8) && styles.buttonDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Pesquisar CEP"
            >
              {postalCodeLoading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.postalSearchText}>Pesquisar</Text>}
            </TouchableOpacity>
          }
        />
      </View>

      <PickerField label="Cidade" value={value.city} placeholder="Selecione a cidade" icon="city-variant-outline" onPress={() => void openPicker('city')} disabled={disabled} />
      <PickerField label="Estado" value={value.state} placeholder="Selecione o estado" icon="map-outline" onPress={() => void openPicker('state')} disabled={disabled} />
      <AuthTextField label="Rua" value={value.street} onChangeText={(street) => update({ street })} placeholder="Rua ou avenida" icon="road-variant" inputProps={{ autoCapitalize: 'words', editable: !disabled }} />
      <AuthTextField label="Número" value={value.number} onChangeText={(number) => update({ number: number.replace(/[^0-9A-Za-z-]/g, '').slice(0, 12) })} placeholder="123" icon="numeric" inputProps={{ keyboardType: 'numbers-and-punctuation', editable: !disabled }} />
      <AuthTextField label="Complemento (opcional)" value={value.complement} onChangeText={(complement) => update({ complement })} placeholder="Apto., bloco, sala..." icon="home-plus-outline" inputProps={{ autoCapitalize: 'sentences', editable: !disabled }} />

      <Modal visible={pickerMode !== null} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={closePicker}>
        <View
          style={[
            styles.modal,
            {
              backgroundColor: colors.background,
              paddingTop: insets.top,
              paddingBottom: insets.bottom,
              paddingLeft: insets.left,
              paddingRight: insets.right,
            },
          ]}
        >
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}> 
            <View>
              <Text style={[styles.modalEyebrow, { color: colors.secondary }]}>ENDEREÇO</Text>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>{openCityAfterState ? 'Selecione o estado primeiro' : `Selecionar ${pickerMode === 'city' ? 'cidade' : 'estado'}`}</Text>
            </View>
            <TouchableOpacity style={[styles.closeButton, { backgroundColor: colors.backgroundSecondary }]} onPress={closePicker} accessibilityRole="button" accessibilityLabel="Fechar lista" hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
              <MaterialCommunityIcons name="close" size={21} color={colors.foreground} />
            </TouchableOpacity>
          </View>
          <View style={[styles.search, { borderColor: colors.border, backgroundColor: colors.card }]}> 
            <MaterialCommunityIcons name="magnify" size={20} color={colors.foregroundSecondary} />
            <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por nome" placeholderTextColor={colors.foregroundSecondary} style={[styles.searchInput, { color: colors.foreground }]} />
          </View>
          {pickerLoading ? <ActivityIndicator color={colors.secondary} style={styles.centerState} /> : pickerError ? <Text style={[styles.centerState, { color: colors.error }]}>{pickerError}</Text> : (
            <FlatList<BrazilCityOption | BrazilStateOption>
              data={pickerItems}
              keyExtractor={(item) => String(item.id)}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={24}
              windowSize={7}
              removeClippedSubviews
              getItemLayout={(_, index) => ({ length: 54, offset: 54 * index, index })}
              renderItem={({ item }) => {
                const isCity = 'stateCode' in item;
                const selected = isCity ? value.city === item.name && value.state === item.stateCode : value.state === item.code;
                return (
                  <Pressable
                    style={[styles.option, { borderBottomColor: colors.border }, selected && { backgroundColor: `${colors.secondary}12` }]}
                    onPress={() => void selectOption(item)}
                  >
                    <Text style={[styles.optionLabel, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[styles.optionCode, { color: colors.foregroundSecondary }]}>{isCity ? item.stateCode : item.code}</Text>
                    {selected ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.secondary} /> : null}
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

function PickerField({ label, value, placeholder, icon, onPress, disabled }: { label: string; value: string; placeholder: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void; disabled: boolean }) {
  const colors = useColors();
  return (
    <View style={authFieldStyles.fieldGroup}>
      <Text style={authFieldStyles.label}>{label}</Text>
      <TouchableOpacity disabled={disabled} onPress={onPress} style={[authFieldStyles.inputWrapper, { backgroundColor: colors.background, opacity: disabled ? 0.6 : 1 }]} accessibilityRole="button">
        <MaterialCommunityIcons name={icon} size={18} color={AUTH_BRAND.placeholder} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: value ? colors.foreground : AUTH_BRAND.placeholder }}>{value || placeholder}</Text>
        <MaterialCommunityIcons name="chevron-down" size={20} color={AUTH_BRAND.placeholder} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  postalSearchButton: { minWidth: 82, minHeight: 34, borderRadius: 10, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  postalSearchText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  buttonDisabled: { opacity: 0.45 },
  modal: { flex: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalEyebrow: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginTop: 3 },
  closeButton: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 14, margin: 16, paddingHorizontal: 14, minHeight: 48 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  centerState: { marginTop: 40, textAlign: 'center', paddingHorizontal: 24 },
  option: { minHeight: 54, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, borderBottomWidth: StyleSheet.hairlineWidth, gap: 10 },
  optionLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  optionCode: { fontSize: 12, fontWeight: '800' },
});
