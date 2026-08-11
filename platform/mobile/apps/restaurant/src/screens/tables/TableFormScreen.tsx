import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ScreenContainer } from '@okinawa/shared/components/ScreenContainer';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  SegmentedButtons,
  ActivityIndicator,
} from 'react-native-paper';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { t } from '@okinawa/shared/i18n';
import { useRestaurant } from '@/shared/contexts/RestaurantContext';
import ApiService from '@/shared/services/api';
import { Card } from '@okinawa/shared/components';
import { tableFormSchema, validateForm } from '@okinawa/shared/validation/schemas';

type RouteParams = {
  TableForm: {
    tableId?: string;
  };
};

const sections = [
  { label: 'Interna', value: 'Área Interna' },
  { label: 'Externa', value: 'Área Externa' },
  { label: 'Terraço', value: 'Terraço' },
  { label: 'VIP', value: 'VIP' },
  { label: 'Bar', value: 'Bar' },
];

export default function TableFormScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'TableForm'>>();
  const colors = useColors();
  const { restaurantId } = useRestaurant();

  const tableId = route.params?.tableId;
  const isEditing = !!tableId;

  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [section, setSection] = useState('Área Interna');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fetchTable = useCallback(async () => {
    if (!tableId) return;

    try {
      const table = await ApiService.getTable(tableId);
      setTableNumber(table.table_number);
      setCapacity(String(table.seats));
      setSection(table.section || 'Área Interna');
      setNotes(table.notes || '');
    } catch (error) {
      console.error('Error fetching table:', error);
      Alert.alert('Erro', 'Não foi possível carregar os dados da mesa');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [tableId, navigation]);

  useEffect(() => {
    if (isEditing) {
      fetchTable();
    }
  }, [isEditing, fetchTable]);

  const validate = (): boolean => {
    const capacityNum = parseInt(capacity, 10);
    const tableNum = parseInt(tableNumber, 10);

    const result = validateForm(tableFormSchema, {
      tableNumber: isNaN(tableNum) ? 0 : tableNum,
      seats: isNaN(capacityNum) ? 0 : capacityNum,
      section: section || undefined,
    });

    if (!result.success) {
      setErrors(result.errors);
      return false;
    }

    // Also check if tableNumber string is provided (could be non-numeric label)
    if (!tableNumber.trim()) {
      setErrors({ tableNumber: 'Número da mesa é obrigatório' });
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSave = async () => {
    if (!validate() || !restaurantId) return;

    setSaving(true);

    try {
      const data = {
        restaurant_id: restaurantId,
        table_number: tableNumber.trim(),
        capacity: parseInt(capacity, 10),
        section,
        notes: notes.trim() || undefined,
      };

      if (isEditing && tableId) {
        await ApiService.updateTable(tableId, data);
        Alert.alert('Sucesso', 'Mesa atualizada com sucesso');
      } else {
        await ApiService.createTable(data);
        Alert.alert('Sucesso', 'Mesa criada com sucesso');
      }

      navigation.goBack();
    } catch (error: any) {
      console.error('Error saving table:', error);
      const message = error.response?.data?.message || 'Não foi possível salvar a mesa';
      Alert.alert('Erro', message);
    } finally {
      setSaving(false);
    }
  };

  const incrementCapacity = () => {
    const current = parseInt(capacity, 10) || 0;
    if (current < 50) {
      setCapacity(String(current + 1));
    }
  };

  const decrementCapacity = () => {
    const current = parseInt(capacity, 10) || 0;
    if (current > 1) {
      setCapacity(String(current - 1));
    }
  };

  const styles = useMemo(() => createStyles(colors), [colors]);

  if (loading) {
    return (
      <ScreenContainer hasKeyboard>
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer hasKeyboard>
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Table Number */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Identificação</Text>
          <TextInput
            label={t('formLabels.tableNameLabel')}
            value={tableNumber}
            onChangeText={setTableNumber}
            placeholder={t('placeholders.tableNameExample')}
            mode="outlined"
            error={!!errors.tableNumber}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.foreground}
            accessibilityLabel="Número ou nome da mesa"
          />
          {errors.tableNumber && (
            <Text style={styles.errorText}>{errors.tableNumber}</Text>
          )}
        </Card>

        {/* Capacity */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Capacidade</Text>
          <View style={styles.capacityContainer}>
            <Button
              mode="outlined"
              onPress={decrementCapacity}
              style={styles.capacityButton}
              disabled={parseInt(capacity, 10) <= 1}
              accessibilityRole="button"
              accessibilityLabel="Diminuir capacidade"
            >
              <Icon name="minus" size={24} color={colors.foreground} />
            </Button>
            <View style={styles.capacityDisplay}>
              <Icon name="seat" size={28} color={colors.primary} />
              <Text style={styles.capacityValue}>{capacity}</Text>
              <Text style={styles.capacityLabel}>lugares</Text>
            </View>
            <Button
              mode="outlined"
              onPress={incrementCapacity}
              style={styles.capacityButton}
              disabled={parseInt(capacity, 10) >= 50}
              accessibilityRole="button"
              accessibilityLabel="Aumentar capacidade"
            >
              <Icon name="plus" size={24} color={colors.foreground} />
            </Button>
          </View>
          {errors.capacity && (
            <Text style={styles.errorText}>{errors.capacity}</Text>
          )}
        </Card>

        {/* Section */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Área do Restaurante</Text>
          <SegmentedButtons
            value={section}
            onValueChange={setSection}
            buttons={sections.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
            style={styles.segmentedButtons}
          />
        </Card>

        {/* Notes */}
        <Card style={styles.section}>
          <Text style={styles.sectionTitle}>Observações</Text>
          <TextInput
            label={t('formLabels.notesOptional')}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('placeholders.tableNotesExample')}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
            outlineColor={colors.border}
            activeOutlineColor={colors.primary}
            textColor={colors.foreground}
            accessibilityLabel="Notas opcionais sobre a mesa"
          />
        </Card>

        {/* Save Button */}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          buttonColor={colors.primary}
          textColor={colors.primaryForeground}
          accessibilityRole="button"
          accessibilityLabel={isEditing ? 'Salvar Alterações' : 'Criar Mesa'}
        >
          {isEditing ? 'Salvar Alterações' : 'Criar Mesa'}
        </Button>
      </ScrollView>
    </View>
    </ScreenContainer>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: 12,
      color: colors.foregroundMuted,
    },
    scrollContent: {
      padding: 16,
      paddingBottom: 40,
    },
    section: {
      padding: 16,
      marginBottom: 16,
      borderRadius: 12,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.foregroundMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 12,
    },
    input: {
      backgroundColor: colors.background,
    },
    errorText: {
      color: colors.destructive,
      fontSize: 12,
      marginTop: 4,
    },
    capacityContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
    },
    capacityButton: {
      borderRadius: 12,
      borderColor: colors.border,
    },
    capacityDisplay: {
      alignItems: 'center',
      gap: 4,
    },
    capacityValue: {
      fontSize: 36,
      fontWeight: '700',
      color: colors.foreground,
    },
    capacityLabel: {
      fontSize: 14,
      color: colors.foregroundMuted,
    },
    segmentedButtons: {
      flexWrap: 'wrap',
    },
    saveButton: {
      marginTop: 8,
      borderRadius: 12,
    },
    saveButtonContent: {
      paddingVertical: 8,
    },
  });
