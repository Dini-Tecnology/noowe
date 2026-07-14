import { useMemo, useState } from 'react';
import { Share } from 'react-native';
import { Layers, QrCode } from 'lucide-react-native';
import { supabaseApiAdapter } from '@okinawa/shared/services/supabase-api';
import { V2ListScreen, type V2ListItem } from './shared/V2ListScreen';
import { useRestaurantTables } from './shared/useRestaurantOperations';

export default function QRBatchScreen() {
  const { data: tables, loading, refresh } = useRestaurantTables();
  const [generating, setGenerating] = useState(false);

  const sections = useMemo(() => {
    const bySection = new Map<string, typeof tables>();
    for (const table of tables) {
      const key = table.section || 'Sem seção';
      bySection.set(key, [...(bySection.get(key) ?? []), table]);
    }
    return Array.from(bySection.entries());
  }, [tables]);

  const generateAll = async () => {
    setGenerating(true);
    try {
      const results = await Promise.allSettled(tables.map((t) => supabaseApiAdapter.generateTableQR(t.id)));
      const ok = results.filter((r) => r.status === 'fulfilled').length;
      // No PDF-rendering library is installed yet; share a plain-text summary
      // of the generated payloads until a proper batch export is built.
      const summary = results
        .map((r, i) => r.status === 'fulfilled' ? `Mesa ${tables[i].label}: ${(r.value as any)?.qr_code_data}` : null)
        .filter(Boolean)
        .join('\n');
      void Share.share({ message: summary || `${ok} QR codes gerados`, title: 'QR Codes em lote' });
      await refresh();
    } finally {
      setGenerating(false);
    }
  };

  const items: V2ListItem[] = loading
    ? [{ icon: Layers, label: 'Carregando mesas…' }]
    : [
        ...sections.map(([section, sectionTables]) => ({
          icon: Layers,
          label: section,
          subtitle: `${sectionTables.length} mesa${sectionTables.length === 1 ? '' : 's'}`,
        })),
        {
          icon: QrCode,
          label: generating ? 'Gerando…' : 'Gerar lote para todas as mesas',
          subtitle: `${tables.length} QR codes`,
          onPress: generating ? undefined : () => { void generateAll(); },
        },
      ];

  return <V2ListScreen title="QR Codes em Lote" subtitle="Gerar para várias mesas" showBack items={items} onRefresh={refresh} />;
}
