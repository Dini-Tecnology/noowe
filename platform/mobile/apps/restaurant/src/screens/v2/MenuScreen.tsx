import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import {
  Ban,
  Camera,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderPlus,
  Pencil,
  Plus,
  Tag,
  Trash2,
  UtensilsCrossed,
} from 'lucide-react-native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { V2ConfirmDialog } from './shared/V2ConfirmDialog';
import { V2FormSheet } from './shared/V2FormSheet';
import { V2Shell } from './shared/V2Shell';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  category_name?: string;
  category_id?: string;
  is_available: boolean;
  image_url?: string;
}

interface MenuCategory {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  items: MenuItem[];
}

type EditorState =
  | { kind: 'category'; category?: MenuCategory }
  | { kind: 'item'; categoryId: string; item?: MenuItem };

type DeleteState =
  | { kind: 'category'; mode: 'deactivate' | 'delete'; category: MenuCategory }
  | { kind: 'item'; item: MenuItem };

function fmt(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPriceInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(digits) / 100);
}

function priceToInput(value: number): string {
  return formatPriceInput(String(Math.round(value * 100)));
}

function priceFromInput(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) / 100 : 0;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return fallback;
}

function normalizeMenu(raw: unknown): MenuCategory[] {
  if (!Array.isArray(raw)) return [];

  if (raw.some((entry) => Array.isArray(entry?.items))) {
    return raw.map((category: any) => ({
      id: category.id,
      name: category.name || 'Sem categoria',
      description: category.description || '',
      is_active: category.is_active !== false,
      items: (Array.isArray(category.items) ? category.items : []).map((item: any) => ({
        ...item,
        price: toNumber(item.price),
        category_id: category.id,
        category_name: category.name,
        is_available: item.is_available !== false,
      })),
    }));
  }

  const grouped = new Map<string, MenuCategory>();
  for (const item of raw as any[]) {
    const categoryId = item.category_id ?? '__uncategorized';
    if (!grouped.has(categoryId)) {
      grouped.set(categoryId, {
        id: categoryId,
        name: item.category_name ?? 'Sem categoria',
        is_active: true,
        items: [],
      });
    }
    grouped.get(categoryId)!.items.push({
      ...item,
      price: toNumber(item.price),
      is_available: item.is_available !== false,
    });
  }
  return [...grouped.values()];
}

export default function MenuScreen() {
  const colors = useColors();
  const { restaurantId, serverRole } = useRestaurantRole();
  const canManage = serverRole === 'owner' || serverRole === 'manager';
  const canToggle = canManage || serverRole === 'chef';
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<DeleteState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageUploading, setImageUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getMenu(restaurantId ?? undefined, showAll);
      setCategories(normalizeMenu(data));
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao carregar cardápio'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [restaurantId, showAll]);

  useEffect(() => { void load(); }, [load]);

  const totalItems = useMemo(
    () => categories.reduce((sum, category) => sum + category.items.length, 0),
    [categories],
  );
  const availableItems = useMemo(
    () => categories.reduce(
      (sum, category) => sum + category.items.filter((item) => item.is_available).length,
      0,
    ),
    [categories],
  );

  const openCategoryEditor = (category?: MenuCategory) => {
    setName(category?.name ?? '');
    setDescription(category?.description ?? '');
    setPrice('');
    setCategoryId('');
    setFormError(null);
    setEditor({ kind: 'category', category });
  };

  const openItemEditor = (targetCategoryId: string, item?: MenuItem) => {
    setName(item?.name ?? '');
    setDescription(item?.description ?? '');
    setPrice(item ? priceToInput(item.price) : '');
    setCategoryId(item?.category_id ?? targetCategoryId);
    setImageUrl(item?.image_url ?? '');
    setFormError(null);
    setEditor({ kind: 'item', categoryId: targetCategoryId, item });
  };

  const pickItemImage = async () => {
    if (!restaurantId || imageUploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para escolher a imagem do item.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled || !result.assets[0]) return;

    setImageUploading(true);
    try {
      const asset = result.assets[0];
      const uploadedUrl = await supabaseApiAdapter.uploadMenuItemImage(
        restaurantId,
        asset.uri,
        asset.mimeType ?? 'image/jpeg',
      );
      setImageUrl(uploadedUrl);
    } catch (err) {
      Alert.alert('Não foi possível enviar a imagem', getErrorMessage(err, 'Tente novamente.'));
    } finally {
      setImageUploading(false);
    }
  };

  const closeEditor = () => {
    if (saving) return;
    setEditor(null);
    setFormError(null);
  };

  const saveEditor = async () => {
    if (!editor || !restaurantId) return;
    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Informe um nome.');
      return;
    }

    const numericPrice = priceFromInput(price);
    if (editor.kind === 'item' && numericPrice <= 0) {
      setFormError('Informe um preço maior que zero.');
      return;
    }
    if (editor.kind === 'item' && !categoryId) {
      setFormError('Selecione uma categoria.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editor.kind === 'category') {
        if (editor.category) {
          await supabaseApiAdapter.updateMenuCategory(editor.category.id, {
            name: cleanName,
            description: description.trim(),
          });
        } else {
          await supabaseApiAdapter.createMenuCategory(
            restaurantId,
            cleanName,
            description.trim() || undefined,
            undefined,
            categories.length,
          );
        }
      } else {
        const payload = {
          name: cleanName,
          description: description.trim(),
          price: numericPrice,
          category_id: categoryId,
          image_url: imageUrl || null,
        };
        if (editor.item) {
          await supabaseApiAdapter.updateMenuItem(editor.item.id, payload);
        } else {
          await supabaseApiAdapter.createMenuItem(restaurantId, payload);
        }
      }
      setEditor(null);
      await load();
    } catch (err) {
      setFormError(getErrorMessage(err, 'Não foi possível salvar.'));
    } finally {
      setSaving(false);
    }
  };

  const toggleItem = async (item: MenuItem) => {
    if (!canToggle) return;
    setToggling(item.id);
    try {
      await supabaseApiAdapter.toggleMenuItem(item.id, !item.is_available);
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Erro ao alterar disponibilidade.'));
    } finally {
      setToggling(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      if (deleting.kind === 'item') {
        await supabaseApiAdapter.deleteMenuItem(deleting.item.id);
      } else if (deleting.mode === 'delete') {
        await supabaseApiAdapter.deleteMenuCategory(deleting.category.id);
      } else {
        await supabaseApiAdapter.updateMenuCategory(deleting.category.id, { is_active: false });
      }
      setDeleting(null);
      await load();
    } catch (err) {
      setDeleting(null);
      setError(getErrorMessage(err, 'Não foi possível remover.'));
    }
  };

  const activateCategory = async (category: MenuCategory) => {
    try {
      await supabaseApiAdapter.updateMenuCategory(category.id, { is_active: true });
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Não foi possível reativar a categoria.'));
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const isEditing = editor?.kind === 'category'
    ? Boolean(editor.category)
    : editor?.kind === 'item'
      ? Boolean(editor.item)
      : false;

  return (
    <>
      <V2Shell
        title="Cardápio"
        subtitle={canManage ? 'Categorias, itens, preços e disponibilidade' : 'Itens e disponibilidade'}
        showBack
        scroll={false}
        headerRight={
          <View style={styles.headerActions}>
            <TouchableOpacity
              accessibilityLabel={showAll ? 'Mostrar somente ativos' : 'Mostrar todos'}
              style={[styles.iconHeaderButton, { backgroundColor: `${colors.primary}15` }]}
              onPress={() => setShowAll((value) => !value)}
            >
              {showAll ? <Eye size={17} color={colors.primary} /> : <EyeOff size={17} color={colors.primary} />}
            </TouchableOpacity>
            {canManage ? (
              <TouchableOpacity
                accessibilityLabel="Cadastrar item"
                disabled={categories.length === 0}
                style={[
                  styles.addHeaderButton,
                  { backgroundColor: colors.primary },
                  categories.length === 0 && styles.disabled,
                ]}
                onPress={() => openItemEditor(categories[0].id)}
              >
                <Plus size={17} color="#FFF" />
                <Text style={styles.addHeaderLabel}>Item</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        }
      >
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {loading ? (
            <StateMessage message="Carregando cardápio…" />
          ) : error ? (
            <StateMessage message={error} actionLabel="Tentar novamente" onAction={() => void load()} />
          ) : (
            <>
              <View style={styles.summaryRow}>
                <SummaryCard icon={<UtensilsCrossed size={18} color={colors.primary} />} value={availableItems} label="Disponíveis" />
                <SummaryCard icon={<Tag size={18} color="#F59E0B" />} value={categories.length} label="Categorias" />
                <SummaryCard icon={<Plus size={18} color={colors.primary} />} value={totalItems} label="Itens" />
              </View>

              {canManage ? (
                <View style={[styles.manageBar, { backgroundColor: `${colors.primary}10`, borderColor: `${colors.primary}35` }]}>
                  <View style={styles.manageCopy}>
                    <Text style={[styles.manageTitle, { color: colors.foreground }]}>Organize seu cardápio</Text>
                    <Text style={[styles.manageSubtitle, { color: colors.foregroundSecondary }]}>Crie categorias antes de adicionar os itens.</Text>
                  </View>
                  <Pressable
                    style={[styles.outlineAction, { borderColor: colors.primary }]}
                    onPress={() => openCategoryEditor()}
                  >
                    <FolderPlus size={16} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 12 }}>Categoria</Text>
                  </Pressable>
                </View>
              ) : null}

              {categories.length === 0 ? (
                <View style={[styles.emptyBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}12` }]}>
                    <UtensilsCrossed size={30} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Seu cardápio começa aqui</Text>
                  <Text style={[styles.emptyText, { color: colors.foregroundSecondary }]}>
                    {canManage
                      ? 'Cadastre a primeira categoria e depois adicione seus pratos e bebidas.'
                      : 'Ainda não há itens cadastrados para este restaurante.'}
                  </Text>
                  {canManage ? (
                    <Pressable style={[styles.primaryCta, { backgroundColor: colors.primary }]} onPress={() => openCategoryEditor()}>
                      <FolderPlus size={17} color="#FFF" />
                      <Text style={styles.primaryCtaLabel}>Criar primeira categoria</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {categories.map((category) => (
                <View key={category.id} style={styles.categoryBlock}>
                  <View style={styles.categoryHeader}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.categoryTitleRow}>
                        <Text style={[styles.categoryTitle, { color: colors.foreground }]}>{category.name}</Text>
                        {!category.is_active ? <Text style={styles.inactiveBadge}>Inativa</Text> : null}
                      </View>
                      <Text style={[styles.categoryCount, { color: colors.foregroundSecondary }]}>
                        {category.items.length} {category.items.length === 1 ? 'item' : 'itens'}
                      </Text>
                    </View>
                    {canManage ? (
                      <View style={styles.rowActions}>
                        <IconAction label="Adicionar item" onPress={() => openItemEditor(category.id)}>
                          <Plus size={16} color={colors.primary} />
                        </IconAction>
                        <IconAction label="Editar categoria" onPress={() => openCategoryEditor(category)}>
                          <Pencil size={15} color={colors.foregroundSecondary} />
                        </IconAction>
                        {category.is_active ? (
                          <IconAction label="Desativar categoria" onPress={() => setDeleting({ kind: 'category', mode: 'deactivate', category })}>
                            <Ban size={15} color="#F59E0B" />
                          </IconAction>
                        ) : (
                          <>
                            <IconAction label="Ativar categoria" onPress={() => void activateCategory(category)}>
                              <CheckCircle2 size={15} color="#22C55E" />
                            </IconAction>
                            <IconAction label="Excluir categoria" onPress={() => setDeleting({ kind: 'category', mode: 'delete', category })}>
                              <Trash2 size={15} color="#EF4444" />
                            </IconAction>
                          </>
                        )}
                      </View>
                    ) : null}
                  </View>

                  <View style={[styles.itemList, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    {category.items.length === 0 ? (
                      <Pressable
                        disabled={!canManage}
                        onPress={() => openItemEditor(category.id)}
                        style={styles.emptyCategory}
                      >
                        <Text style={{ color: colors.foregroundSecondary }}>Nenhum item nesta categoria.</Text>
                        {canManage ? <Text style={{ color: colors.primary, fontWeight: '800' }}>Adicionar item</Text> : null}
                      </Pressable>
                    ) : null}
                    {category.items.map((item, index) => (
                      <View
                        key={item.id}
                        style={[
                          styles.itemRow,
                          index < category.items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                          !item.is_available && styles.unavailable,
                        ]}
                      >
                        {item.image_url ? (
                          <Image source={{ uri: item.image_url }} style={styles.thumb} />
                        ) : (
                          <View style={[styles.thumbPlaceholder, { backgroundColor: `${colors.primary}12` }]}>
                            <UtensilsCrossed size={18} color={colors.primary} />
                          </View>
                        )}
                        <View style={styles.itemCopy}>
                          <Text style={{ fontWeight: '700', color: colors.foreground }}>{item.name}</Text>
                          {item.description ? (
                            <Text numberOfLines={1} style={{ fontSize: 12, color: colors.foregroundSecondary }}>{item.description}</Text>
                          ) : null}
                          <Text style={[styles.price, { color: colors.primary }]}>{fmt(item.price)}</Text>
                        </View>
                        {canManage ? (
                          <View style={styles.itemEditActions}>
                            <IconAction label="Editar item" onPress={() => openItemEditor(category.id, item)}>
                              <Pencil size={15} color={colors.foregroundSecondary} />
                            </IconAction>
                            <IconAction label="Remover item" onPress={() => setDeleting({ kind: 'item', item })}>
                              <Trash2 size={15} color="#EF4444" />
                            </IconAction>
                          </View>
                        ) : null}
                        {canToggle ? (
                          <TouchableOpacity
                            accessibilityLabel={item.is_available ? 'Marcar indisponível' : 'Marcar disponível'}
                            style={[
                              styles.availabilityButton,
                              {
                                backgroundColor: item.is_available ? '#F0FDF4' : '#FEF2F2',
                                borderColor: item.is_available ? '#22C55E' : '#EF4444',
                                opacity: toggling === item.id ? 0.45 : 1,
                              },
                            ]}
                            onPress={() => void toggleItem(item)}
                            disabled={toggling === item.id}
                          >
                            {item.is_available ? <Eye size={14} color="#22C55E" /> : <EyeOff size={14} color="#EF4444" />}
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      </V2Shell>

      <V2FormSheet
        visible={editor !== null}
        title={editor?.kind === 'category'
          ? editor.category ? 'Editar categoria' : 'Nova categoria'
          : editor?.item ? 'Editar item' : 'Novo item'}
        subtitle={editor?.kind === 'category' ? 'Organize os itens por tipo' : 'Preencha as informações que aparecerão no cardápio'}
        saveLabel={isEditing ? 'Salvar alterações' : 'Cadastrar'}
        saving={saving}
        onClose={closeEditor}
        onSave={() => void saveEditor()}
      >
        <Field label={editor?.kind === 'category' ? 'Nome da categoria' : 'Nome do item'} required>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={editor?.kind === 'category' ? 'Ex.: Pratos principais' : 'Ex.: Risoto de cogumelos'}
            placeholderTextColor={colors.foregroundMuted}
            style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        <Field label="Descrição">
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Adicione uma descrição curta"
            placeholderTextColor={colors.foregroundMuted}
            multiline
            style={[styles.input, styles.textArea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
          />
        </Field>
        {editor?.kind === 'item' ? (
          <>
            <Field label="Imagem do item">
              <Pressable
                onPress={() => void pickItemImage()}
                disabled={imageUploading}
                style={[styles.imagePicker, { borderColor: colors.border, backgroundColor: colors.card }]}
              >
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.imagePreview} />
                ) : (
                  <View style={[styles.imagePlaceholder, { backgroundColor: `${colors.primary}12` }]}>
                    <UtensilsCrossed size={22} color={colors.primary} />
                  </View>
                )}
                <View style={styles.imagePickerCopy}>
                  <Text style={{ color: colors.foreground, fontWeight: '700', fontSize: 13 }}>
                    {imageUrl ? 'Trocar imagem' : 'Adicionar imagem'}
                  </Text>
                  <Text style={{ color: colors.foregroundSecondary, fontSize: 11, marginTop: 2 }}>
                    Aparecerá no cardápio do cliente
                  </Text>
                </View>
                {imageUploading ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Camera size={18} color={colors.primary} />
                )}
              </Pressable>
            </Field>
            <Field label="Preço" required>
              <View style={[styles.moneyInput, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.currencyPrefix, { color: colors.foregroundSecondary }]}>R$</Text>
                <TextInput
                  value={price}
                  onChangeText={(value) => setPrice(formatPriceInput(value))}
                  keyboardType="decimal-pad"
                  placeholder="0,00"
                  placeholderTextColor={colors.foregroundMuted}
                  style={[styles.moneyTextInput, { color: colors.foreground }]}
                />
              </View>
            </Field>
            <Field label="Categoria" required>
              <View style={styles.categoryOptions}>
                {categories.filter((category) => category.is_active).map((category) => {
                  const selected = categoryId === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => setCategoryId(category.id)}
                      style={[
                        styles.categoryOption,
                        { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? `${colors.primary}12` : colors.card },
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          { borderColor: selected ? colors.primary : colors.border },
                          selected && { backgroundColor: colors.primary },
                        ]}
                      />
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.categoryOptionLabel,
                          { color: selected ? colors.primary : colors.foreground, fontWeight: selected ? '800' : '600' },
                        ]}
                      >
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          </>
        ) : null}
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      </V2FormSheet>

      <V2ConfirmDialog
        visible={deleting !== null}
        title={
          deleting?.kind === 'category'
            ? deleting.mode === 'delete' ? 'Excluir categoria?' : 'Desativar categoria?'
            : 'Remover item?'
        }
        message={
          deleting?.kind === 'category'
            ? deleting.mode === 'delete'
              ? `A categoria “${deleting.category.name}” será excluída permanentemente. Os itens dela ficarão sem categoria.`
              : `A categoria “${deleting.category.name}” deixará de aparecer no cardápio ativo.`
            : `O item “${deleting?.item.name}” ficará indisponível no cardápio.`
        }
        confirmLabel={
          deleting?.kind === 'category'
            ? deleting.mode === 'delete' ? 'Excluir' : 'Desativar'
            : 'Remover'
        }
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {label}{required ? <Text style={{ color: colors.primary }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function SummaryCard({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  const colors = useColors();
  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {icon}
      <Text style={[styles.summaryValue, { color: colors.foreground }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.foregroundSecondary }]}>{label}</Text>
    </View>
  );
}

function IconAction({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={7}
      onPress={onPress}
      style={({ pressed }) => [styles.iconAction, { backgroundColor: colors.backgroundSecondary }, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

function StateMessage({ message, actionLabel, onAction }: { message: string; actionLabel?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.stateCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={{ color: colors.foregroundSecondary, textAlign: 'center' }}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={[styles.retryButton, { backgroundColor: colors.primary }]}>
          <Text style={{ color: '#FFF', fontWeight: '800' }}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconHeaderButton: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  addHeaderButton: { minHeight: 38, paddingHorizontal: 12, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 5 },
  addHeaderLabel: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  summaryRow: { flexDirection: 'row', gap: 9, marginBottom: 14 },
  summaryCard: { flex: 1, borderRadius: 15, borderWidth: 1, padding: 12, alignItems: 'center' },
  summaryValue: { fontSize: 22, fontWeight: '800', marginTop: 5 },
  summaryLabel: { fontSize: 11, marginTop: 1 },
  manageBar: { borderWidth: 1, borderRadius: 17, padding: 14, marginBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  manageCopy: { flex: 1 },
  manageTitle: { fontSize: 14, fontWeight: '800' },
  manageSubtitle: { fontSize: 11, lineHeight: 16, marginTop: 2 },
  outlineAction: { borderWidth: 1, minHeight: 38, borderRadius: 12, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  emptyBox: { borderRadius: 20, borderWidth: 1, padding: 28, alignItems: 'center', marginTop: 8 },
  emptyIcon: { width: 58, height: 58, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '800', marginTop: 15 },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6, maxWidth: 280 },
  primaryCta: { minHeight: 46, borderRadius: 14, paddingHorizontal: 18, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
  primaryCtaLabel: { color: '#FFF', fontWeight: '800' },
  categoryBlock: { marginBottom: 22 },
  categoryHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 9, gap: 10 },
  categoryTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryTitle: { fontSize: 16, fontWeight: '800' },
  categoryCount: { fontSize: 11, marginTop: 2 },
  inactiveBadge: { color: '#9A3412', backgroundColor: '#FFEDD5', fontSize: 10, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  rowActions: { flexDirection: 'row', gap: 6 },
  iconAction: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  itemList: { borderRadius: 17, borderWidth: 1, overflow: 'hidden' },
  itemRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11 },
  itemCopy: { flex: 1, minWidth: 0 },
  itemEditActions: { flexDirection: 'row', gap: 5 },
  unavailable: { opacity: 0.58 },
  thumb: { width: 50, height: 50, borderRadius: 13 },
  thumbPlaceholder: { width: 50, height: 50, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  price: { fontSize: 14, fontWeight: '800', marginTop: 3 },
  availabilityButton: { width: 34, height: 34, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  emptyCategory: { minHeight: 74, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 6 },
  stateCard: { borderWidth: 1, borderRadius: 16, padding: 22, alignItems: 'center', gap: 12 },
  retryButton: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 12 },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, fontSize: 15 },
  textArea: { minHeight: 100, paddingTop: 13, textAlignVertical: 'top' },
  moneyInput: { minHeight: 50, borderWidth: 1, borderRadius: 15, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' },
  currencyPrefix: { fontSize: 14, fontWeight: '800', marginRight: 8 },
  moneyTextInput: { flex: 1, fontSize: 16, paddingVertical: 0 },
  imagePicker: { minHeight: 66, borderWidth: 1, borderRadius: 15, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  imagePreview: { width: 46, height: 46, borderRadius: 12 },
  imagePlaceholder: { width: 46, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  imagePickerCopy: { flex: 1 },
  categoryOptions: { gap: 8 },
  categoryOption: { width: '100%', minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  categoryOptionLabel: { flex: 1, flexShrink: 1, lineHeight: 18 },
  radio: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  formError: { color: '#DC2626', backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, fontSize: 13 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
