import { useState } from 'react';
import { Share } from 'react-native';
import { QrCode } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantTables } from './shared/useRestaurantOperations';

export default function QRGeneratorScreen() {
  const { data: tables, loading, refresh } = useRestaurantTables();
  const [generatingId, setGeneratingId] = useState<string | null>(null);

  const generate = async (tableId: string) => {
    setGeneratingId(tableId);
    try {
      const result = await supabaseApiAdapter.generateTableQR(tableId);
      // No QR-image rendering library is installed yet; share the encoded
      // payload so staff can at least copy/forward it until one is added.
      void Share.share({ message: result?.qr_code_data ?? '', title: 'QR Code da mesa' });
      await refresh();
    } finally {
      setGeneratingId(null);
    }
  };

  const items: V2ListItem[] = loading
    ? [{ icon: QrCode, label: 'Carregando mesas…' }]
    : tables.length === 0
      ? [{ icon: QrCode, label: 'Nenhuma mesa cadastrada' }]
      : tables.map((table) => ({
          icon: QrCode,
          label: `Mesa ${table.label}`,
          subtitle: generatingId === table.id ? 'Gerando…' : table.hasQR ? 'QR ativo · toque para regenerar' : 'Sem QR · toque para gerar',
          onPress: () => { void generate(table.id); },
        }));

  return <V2ListScreen title="Gerar QR Code" subtitle="Mesa ou estação" showBack items={items} />;
}
