import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { Text } from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import {
  Store,
  Camera,
  Edit3,
  Phone,
  Link2,
  Plus,
  Trash2,
  Check,
  X,
  Clock,
  ImageIcon,
} from 'lucide-react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useColors } from '@okinawa/shared/contexts/ThemeContext';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { formatBrazilianPhone } from '@okinawa/shared/utils/phone-validation';
import { V2Shell } from './shared/V2Shell';
import type { BusinessHour } from './shared/v2Types';
import { ConfigSegmentedTabs } from './config/ConfigSegmentedTabs';
import { ConfigSectionCard } from './config/ConfigSectionCard';
import { SocialBrandIcon } from './config/SocialBrandIcon';
import { displayPriceRange, maskPriceRange } from './config/priceRangeMask';
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_SOCIALS,
  SERVICE_TYPE_CATALOG,
  calculateProfileProgress,
  type ProfileContact,
  type ProfileSocial,
  type ProfileTab,
} from './config/configTypes';

interface ProfileState {
  name: string;
  description: string;
  cnpj: string;
  cuisine: string;
  priceRange: string;
  capacity: string;
  phone: string;
  email: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  serviceType: string;
}

const EMPTY_PROFILE: ProfileState = {
  name: '',
  description: '',
  cnpj: '',
  cuisine: '',
  priceRange: '',
  capacity: '',
  phone: '',
  email: '',
  logoUrl: null,
  bannerUrl: null,
  serviceType: '',
};

export default function RestaurantProfileScreen() {
  const colors = useColors();
  const navigation = useNavigation();
  const route = useRoute<any>();
  const initialTab = (route.params?.initialTab as ProfileTab | undefined) ?? 'info';

  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileState>(EMPTY_PROFILE);
  const [hours, setHours] = useState<BusinessHour[]>(DEFAULT_BUSINESS_HOURS);
  const [contacts, setContacts] = useState<ProfileContact[]>([]);
  const [socials, setSocials] = useState<ProfileSocial[]>(DEFAULT_SOCIALS);
  const [settingsBase, setSettingsBase] = useState<Record<string, unknown>>({});

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'logo' | 'banner' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editHourIndex, setEditHourIndex] = useState<number | null>(null);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState<{ type: ProfileContact['type']; value: string }>({
    type: 'Telefone',
    value: '',
  });
  const [socialDraftKey, setSocialDraftKey] = useState<ProfileSocial['key'] | null>(null);
  const [socialDraftValue, setSocialDraftValue] = useState('');

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await supabaseApiAdapter.getRestaurantProfile();
      if (!data) return;
      setRestaurantId(data.id ?? null);
      const settings = (data.settings && typeof data.settings === 'object' ? data.settings : {}) as Record<
        string,
        unknown
      >;
      setSettingsBase(settings);

      setProfile({
        name: data.name ?? '',
        description: data.description ?? '',
        cnpj: typeof settings.cnpj === 'string' ? settings.cnpj : data.cnpj ?? '',
        cuisine: data.cuisine_type ?? '',
        priceRange: displayPriceRange(data.price_range) === '—' ? '' : displayPriceRange(data.price_range),
        capacity: data.max_party_size != null ? String(data.max_party_size) : '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        logoUrl: data.logo_url ?? null,
        bannerUrl: data.banner_url ?? data.cover_image_url ?? null,
        serviceType: data.service_type ?? '',
      });

      if (Array.isArray(data.business_hours) && data.business_hours.length > 0) {
        setHours(data.business_hours as BusinessHour[]);
      }

      const storedContacts = Array.isArray(settings.contacts) ? (settings.contacts as ProfileContact[]) : [];
      if (storedContacts.length > 0) {
        setContacts(storedContacts);
      } else {
        const seed: ProfileContact[] = [];
        if (data.phone) seed.push({ id: 'phone', type: 'Telefone', value: data.phone });
        if (data.email) seed.push({ id: 'email', type: 'Email', value: data.email });
        setContacts(seed);
      }

      const storedSocials = Array.isArray(settings.socials) ? (settings.socials as ProfileSocial[]) : null;
      if (storedSocials && storedSocials.length > 0) {
        setSocials(
          DEFAULT_SOCIALS.map((base) => {
            const found = storedSocials.find((s) => s.key === base.key || s.label === base.label);
            return found ? { ...base, ...found, id: base.id, key: base.key, label: base.label } : base;
          }),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (route.params?.initialTab) setActiveTab(route.params.initialTab);
  }, [route.params?.initialTab]);

  const progress = useMemo(
    () =>
      calculateProfileProgress({
        name: profile.name,
        logo_url: profile.logoUrl,
        banner_url: profile.bannerUrl,
        description: profile.description,
        cuisine_type: profile.cuisine,
        phone: profile.phone,
        email: profile.email,
        business_hours: hours,
        settings: { cnpj: profile.cnpj, contacts, socials },
      }),
    [profile, hours, contacts, socials],
  );

  const serviceLabel =
    SERVICE_TYPE_CATALOG.find((t) => t.id === profile.serviceType)?.name ??
    profile.serviceType.replace(/_/g, ' ');

  const persistPatch = async (patch: Record<string, unknown>, settingsPatch?: Record<string, unknown>) => {
    if (!restaurantId) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const nextSettings = { ...settingsBase, ...settingsPatch };
      await supabaseApiAdapter.updateRestaurantProfile(restaurantId, {
        ...patch,
        ...(settingsPatch ? { settings: nextSettings } : {}),
      });
      if (settingsPatch) setSettingsBase(nextSettings);
      setSavedMsg('Alterações salvas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (kind: 'logo' | 'banner') => {
    if (!restaurantId || uploading) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permissão necessária', 'Autorize o acesso às fotos para alterar a imagem.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'logo' ? [1, 1] : [16, 9],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;

    setUploading(kind);
    try {
      const asset = result.assets[0];
      if (kind === 'logo') {
        const url = await supabaseApiAdapter.uploadRestaurantLogo(
          restaurantId,
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
        );
        setProfile((p) => ({ ...p, logoUrl: url }));
      } else {
        const url = await supabaseApiAdapter.uploadRestaurantBanner(
          restaurantId,
          asset.uri,
          asset.mimeType ?? 'image/jpeg',
        );
        setProfile((p) => ({ ...p, bannerUrl: url }));
      }
      setSavedMsg(kind === 'logo' ? 'Logo atualizada' : 'Banner atualizado');
    } catch (err) {
      Alert.alert('Falha no upload', err instanceof Error ? err.message : 'Tente novamente.');
    } finally {
      setUploading(null);
    }
  };

  const startEdit = (field: string, value: string) => {
    setEditingField(field);
    setEditValue(field === 'capacity' ? value.replace(/\D/g, '') : value);
  };

  const saveField = async (field: string) => {
    const value = editValue.trim();
    const next = { ...profile };
    if (field === 'name') next.name = value;
    if (field === 'description') next.description = value;
    if (field === 'cnpj') next.cnpj = value;
    if (field === 'cuisine') next.cuisine = value;
    if (field === 'priceRange') next.priceRange = maskPriceRange(value);
    if (field === 'capacity') next.capacity = value.replace(/\D/g, '');
    setProfile(next);
    setEditingField(null);

    const patch: Record<string, unknown> = {};
    const settingsPatch: Record<string, unknown> = {};
    if (field === 'name') patch.name = next.name;
    if (field === 'description') patch.description = next.description;
    if (field === 'cuisine') patch.cuisine_type = next.cuisine;
    if (field === 'priceRange') patch.price_range = next.priceRange;
    if (field === 'capacity') patch.max_party_size = Number(next.capacity) || null;
    if (field === 'cnpj') settingsPatch.cnpj = next.cnpj;

    await persistPatch(patch, Object.keys(settingsPatch).length ? settingsPatch : undefined);
  };

  const saveHours = async (nextHours: BusinessHour[]) => {
    setHours(nextHours);
    await persistPatch({ business_hours: nextHours });
  };

  const saveContactsAndSocials = async (nextContacts: ProfileContact[], nextSocials: ProfileSocial[]) => {
    setContacts(nextContacts);
    setSocials(nextSocials);
    const phone = nextContacts.find((c) => c.type === 'Telefone')?.value ?? profile.phone;
    const email = nextContacts.find((c) => c.type === 'Email')?.value ?? profile.email;
    setProfile((p) => ({ ...p, phone, email }));
    await persistPatch(
      { phone, email },
      { contacts: nextContacts, socials: nextSocials, cnpj: profile.cnpj },
    );
  };

  const profileFields = [
    { key: 'name', label: 'Nome', value: profile.name },
    { key: 'description', label: 'Descrição', value: profile.description || '—' },
    { key: 'cnpj', label: 'CNPJ', value: profile.cnpj || '—' },
    { key: 'cuisine', label: 'Tipo de Cozinha', value: profile.cuisine || '—' },
    { key: 'priceRange', label: 'Faixa de Preço', value: displayPriceRange(profile.priceRange) },
    {
      key: 'capacity',
      label: 'Capacidade',
      value: profile.capacity ? `${profile.capacity} lugares` : '—',
    },
  ];

  return (
    <V2Shell
      title="Perfil do Restaurante"
      subtitle="Identidade do seu estabelecimento"
      showBack
      onRefresh={load}
      headerRight={
        <View style={[styles.badge, { backgroundColor: `${colors.primary}18` }]}>
          <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800' }}>{progress}%</Text>
        </View>
      }
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <ConfigSegmentedTabs
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'info', label: 'Info' },
              { id: 'hours', label: 'Horários' },
              { id: 'contact', label: 'Contato' },
            ]}
          />

          {activeTab === 'info' && (
            <>
              <View style={[styles.mediaCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View style={styles.bannerWrap}>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => void pickImage('banner')}
                    disabled={!!uploading}
                    style={styles.bannerTap}
                  >
                    {profile.bannerUrl ? (
                      <Image source={{ uri: profile.bannerUrl }} style={styles.banner} />
                    ) : (
                      <View
                        style={[
                          styles.banner,
                          styles.bannerEmpty,
                          { backgroundColor: colors.backgroundSecondary, borderColor: colors.border },
                        ]}
                      >
                        <ImageIcon size={28} color={colors.foregroundSecondary} strokeWidth={1.5} />
                        <Text style={{ fontSize: 10, color: colors.foregroundSecondary, marginTop: 6, fontWeight: '600' }}>
                          Foto do banner
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.bannerCam, { backgroundColor: 'rgba(17,24,39,0.55)' }]}
                    onPress={() => void pickImage('banner')}
                    disabled={!!uploading}
                    accessibilityLabel="Alterar banner"
                  >
                    {uploading === 'banner' ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <Camera size={14} color="#FFF" />
                    )}
                  </TouchableOpacity>
                </View>
                <View style={styles.logoRow}>
                  <View style={styles.logoWrap}>
                    <TouchableOpacity
                      onPress={() => void pickImage('logo')}
                      disabled={!!uploading}
                      style={[styles.logoBox, { borderColor: colors.card, backgroundColor: `${colors.primary}15` }]}
                    >
                      {profile.logoUrl ? (
                        <Image source={{ uri: profile.logoUrl }} style={styles.logoImg} />
                      ) : (
                        <Store size={24} color={colors.primary} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => void pickImage('logo')}
                      disabled={!!uploading}
                      style={[styles.camBadge, { backgroundColor: colors.primary, borderColor: colors.card }]}
                      accessibilityLabel="Alterar logo"
                    >
                      {uploading === 'logo' ? (
                        <ActivityIndicator size="small" color="#FFF" />
                      ) : (
                        <Camera size={11} color="#FFF" />
                      )}
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1, paddingBottom: 4 }}>
                    <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>
                      {profile.name || 'Sem nome'}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.foregroundSecondary }} numberOfLines={1}>
                      {[serviceLabel, profile.cuisine].filter(Boolean).join(' · ') || 'Configure o perfil'}
                    </Text>
                  </View>
                </View>
              </View>

              <ConfigSectionCard title="Informações Básicas" Icon={Edit3}>
                {profileFields.map((field, index) => (
                  <View
                    key={field.key}
                    style={[
                      styles.fieldRow,
                      index < profileFields.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    {editingField === field.key ? (
                      <View style={{ gap: 8 }}>
                        <Text style={[styles.fieldLabel, { color: colors.foregroundSecondary }]}>
                          {field.label}
                        </Text>
                        <TextInput
                          value={editValue}
                          onChangeText={(text) =>
                            setEditValue(field.key === 'priceRange' ? maskPriceRange(text) : text)
                          }
                          autoFocus
                          multiline={field.key === 'description'}
                          keyboardType={field.key === 'priceRange' || field.key === 'capacity' ? 'numeric' : 'default'}
                          placeholder={field.key === 'priceRange' ? 'Ex.: 40-120' : undefined}
                          placeholderTextColor={colors.foregroundSecondary}
                          style={[
                            styles.input,
                            {
                              borderColor: `${colors.primary}55`,
                              color: colors.foreground,
                              backgroundColor: colors.background,
                            },
                          ]}
                        />
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <TouchableOpacity
                            style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]}
                            onPress={() => void saveField(field.key)}
                            disabled={saving}
                          >
                            <Check size={12} color="#FFF" />
                            <Text style={styles.primaryBtnText}>Salvar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.mutedBtn, { backgroundColor: colors.backgroundSecondary }]}
                            onPress={() => setEditingField(null)}
                          >
                            <Text style={{ color: colors.foregroundSecondary, fontWeight: '700', fontSize: 11 }}>
                              Cancelar
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() =>
                          startEdit(
                            field.key,
                            field.key === 'capacity'
                              ? profile.capacity
                              : field.key === 'description'
                                ? profile.description
                                : field.key === 'cnpj'
                                  ? profile.cnpj
                                  : field.key === 'cuisine'
                                    ? profile.cuisine
                                    : field.key === 'priceRange'
                                      ? profile.priceRange
                                      : profile.name,
                          )
                        }
                        style={styles.fieldPress}
                      >
                        <Text style={[styles.fieldLabel, { color: colors.foregroundSecondary }]}>
                          {field.label}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '60%' }}>
                          <Text
                            style={{ color: colors.foreground, fontSize: 12, fontWeight: '600' }}
                            numberOfLines={1}
                          >
                            {field.value}
                          </Text>
                          <Edit3 size={12} color={`${colors.primary}99`} />
                        </View>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ConfigSectionCard>
            </>
          )}

          {activeTab === 'hours' && (
            <ConfigSectionCard title="Horários de Funcionamento" Icon={Clock}>
              {hours.map((day, index) => (
                <View
                  key={day.day}
                  style={[
                    styles.fieldRow,
                    index < hours.length - 1 && {
                      borderBottomWidth: StyleSheet.hairlineWidth,
                      borderBottomColor: colors.border,
                    },
                  ]}
                >
                  {editHourIndex === index ? (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontWeight: '700', color: colors.foreground, fontSize: 12 }}>{day.day}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TextInput
                          value={day.start}
                          onChangeText={(start) =>
                            setHours((prev) => prev.map((h, i) => (i === index ? { ...h, start } : h)))
                          }
                          style={[
                            styles.timeInput,
                            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
                          ]}
                        />
                        <Text style={{ color: colors.foregroundSecondary }}>–</Text>
                        <TextInput
                          value={day.end}
                          onChangeText={(end) =>
                            setHours((prev) => prev.map((h, i) => (i === index ? { ...h, end } : h)))
                          }
                          style={[
                            styles.timeInput,
                            { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
                          ]}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity
                          style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]}
                          onPress={() => {
                            setEditHourIndex(null);
                            void saveHours(hours);
                          }}
                        >
                          <Check size={12} color="#FFF" />
                          <Text style={styles.primaryBtnText}>Salvar</Text>
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 11, color: colors.foregroundSecondary }}>
                            {day.open ? 'Aberto' : 'Fechado'}
                          </Text>
                          <Switch
                            value={day.open}
                            onValueChange={(open) => {
                              const next = hours.map((h, i) => (i === index ? { ...h, open } : h));
                              setHours(next);
                            }}
                            trackColor={{ false: colors.border, true: `${colors.primary}80` }}
                            thumbColor={day.open ? colors.primary : colors.foregroundSecondary}
                          />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity onPress={() => setEditHourIndex(index)} style={styles.fieldPress}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <View
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            backgroundColor: day.open ? colors.success : colors.border,
                          }}
                        />
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>{day.day}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: '700',
                            color: day.open ? colors.primary : colors.foregroundSecondary,
                            textDecorationLine: day.open ? 'none' : 'line-through',
                          }}
                        >
                          {day.open ? `${day.start} - ${day.end}` : 'Fechado'}
                        </Text>
                        <Edit3 size={12} color={`${colors.primary}99`} />
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ConfigSectionCard>
          )}

          {activeTab === 'contact' && (
            <>
              <ConfigSectionCard
                title="Contatos"
                Icon={Phone}
                action={
                  <TouchableOpacity
                    onPress={() => setShowAddContact(true)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Plus size={12} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Novo</Text>
                  </TouchableOpacity>
                }
              >
                {contacts.length === 0 ? (
                  <Text style={{ padding: 14, color: colors.foregroundSecondary, fontSize: 12 }}>
                    Nenhum contato cadastrado
                  </Text>
                ) : (
                  contacts.map((contact, index) => (
                    <View
                      key={contact.id}
                      style={[
                        styles.contactRow,
                        index < contacts.length - 1 && {
                          borderBottomWidth: StyleSheet.hairlineWidth,
                          borderBottomColor: colors.border,
                        },
                      ]}
                    >
                      <View style={[styles.contactIcon, { backgroundColor: `${colors.primary}15` }]}>
                        <Phone size={12} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10, color: colors.foregroundSecondary }}>{contact.type}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground }}>
                          {contact.value}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          const next = contacts.filter((c) => c.id !== contact.id);
                          void saveContactsAndSocials(next, socials);
                        }}
                      >
                        <Trash2 size={14} color={`${colors.error}99`} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </ConfigSectionCard>

              <ConfigSectionCard title="Redes Sociais" Icon={Link2}>
                {socials.map((social, index) => (
                  <View
                    key={social.id}
                    style={[
                      styles.contactRow,
                      index < socials.length - 1 && {
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: colors.border,
                      },
                    ]}
                  >
                    <SocialBrandIcon socialKey={social.key} size={32} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.foreground, flex: 1 }}>
                      {social.label}
                    </Text>
                    {social.connected ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }} numberOfLines={1}>
                          {social.value || 'Conectado'}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            const next = socials.map((s) =>
                              s.id === social.id ? { ...s, connected: false, value: '' } : s,
                            );
                            void saveContactsAndSocials(contacts, next);
                          }}
                        >
                          <X size={12} color={`${colors.error}99`} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => {
                          setSocialDraftKey(social.key);
                          setSocialDraftValue('');
                        }}
                      >
                        <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '700' }}>Conectar</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </ConfigSectionCard>
            </>
          )}

          {error ? (
            <Text style={{ textAlign: 'center', color: colors.error, marginBottom: 8 }}>{error}</Text>
          ) : null}
          {savedMsg ? (
            <Text style={{ textAlign: 'center', color: colors.success, marginBottom: 8, fontWeight: '600' }}>
              {savedMsg}
            </Text>
          ) : null}

          <TouchableOpacity onPress={() => navigation.goBack()} style={{ alignSelf: 'center', marginTop: 8 }}>
            <Text style={{ color: colors.foregroundSecondary, fontSize: 12 }}>Voltar à Central</Text>
          </TouchableOpacity>
        </>
      )}

      <Modal visible={showAddContact} transparent animationType="fade" onRequestClose={() => setShowAddContact(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Novo Contato</Text>
            <View style={styles.typeRow}>
              {(['Telefone', 'WhatsApp', 'Website', 'Email'] as ProfileContact['type'][]).map((type) => (
                <TouchableOpacity
                  key={type}
                  onPress={() => setNewContact((p) => ({ ...p, type }))}
                  style={[
                    styles.typeChip,
                    {
                      backgroundColor:
                        newContact.type === type ? `${colors.primary}18` : colors.backgroundSecondary,
                      borderColor: newContact.type === type ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '700',
                      color: newContact.type === type ? colors.primary : colors.foregroundSecondary,
                    }}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              value={newContact.value}
              onChangeText={(value) =>
                setNewContact((p) => ({
                  ...p,
                  value: p.type === 'Telefone' || p.type === 'WhatsApp' ? formatBrazilianPhone(value) : value,
                }))
              }
              placeholder={newContact.type === 'Website' ? 'seusite.com.br' : '(11) 99999-9999'}
              placeholderTextColor={colors.foregroundSecondary}
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.mutedBtn, { backgroundColor: colors.backgroundSecondary, flex: 1 }]}
                onPress={() => setShowAddContact(false)}
              >
                <Text style={{ fontWeight: '700', color: colors.foregroundSecondary }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => {
                  if (!newContact.value.trim()) return;
                  const next = [
                    ...contacts,
                    { id: `c-${Date.now()}`, type: newContact.type, value: newContact.value.trim() },
                  ];
                  setShowAddContact(false);
                  setNewContact({ type: 'Telefone', value: '' });
                  void saveContactsAndSocials(next, socials);
                }}
              >
                <Text style={styles.primaryBtnText}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!socialDraftKey}
        transparent
        animationType="fade"
        onRequestClose={() => setSocialDraftKey(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Conectar rede</Text>
            <TextInput
              value={socialDraftValue}
              onChangeText={setSocialDraftValue}
              placeholder="@seuusuario"
              placeholderTextColor={colors.foregroundSecondary}
              autoFocus
              style={[
                styles.input,
                { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.mutedBtn, { backgroundColor: colors.backgroundSecondary, flex: 1 }]}
                onPress={() => setSocialDraftKey(null)}
              >
                <Text style={{ fontWeight: '700', color: colors.foregroundSecondary }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.primary, flex: 1 }]}
                onPress={() => {
                  if (!socialDraftKey || !socialDraftValue.trim()) return;
                  const next = socials.map((s) =>
                    s.key === socialDraftKey
                      ? { ...s, connected: true, value: socialDraftValue.trim() }
                      : s,
                  );
                  setSocialDraftKey(null);
                  void saveContactsAndSocials(contacts, next);
                }}
              >
                <Text style={styles.primaryBtnText}>Conectar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </V2Shell>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  mediaCard: { borderWidth: 1, borderRadius: 16, overflow: 'visible', marginBottom: 14 },
  bannerWrap: { height: 96, position: 'relative', borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  banner: { width: '100%', height: '100%' },
  bannerTap: { width: '100%', height: '100%' },
  bannerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bannerCam: {
    position: 'absolute',
    top: 10,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginTop: -28,
    paddingHorizontal: 14,
    paddingBottom: 14,
    overflow: 'visible',
  },
  logoWrap: {
    width: 64,
    height: 64,
    position: 'relative',
    overflow: 'visible',
  },
  logoBox: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImg: { width: '100%', height: '100%' },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  name: { fontSize: 15, fontWeight: '800' },
  fieldRow: { padding: 12 },
  fieldPress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 10, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  timeInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    textAlign: 'center',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  primaryBtnText: { color: '#FFF', fontWeight: '700', fontSize: 11 },
  mutedBtn: {
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  contactIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { borderRadius: 18, padding: 18 },
  modalTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  typeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
