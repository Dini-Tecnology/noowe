import Ionicons from '@expo/vector-icons/Ionicons';
import {
  FINE_DINING_AMBIANCE,
  FINE_DINING_AMBIANCE_PRESENTATION,
} from '@okinawa/shared/config/fine-dining';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** "Casual, Bar, Café" — the discovery filter chips for the Fine Dining tab. */
export const FINE_DINING_FILTERS: { key: string; label: string; icon: IoniconName }[] =
  FINE_DINING_AMBIANCE.map((key) => ({
    key,
    label: FINE_DINING_AMBIANCE_PRESENTATION[key].label,
    icon: FINE_DINING_AMBIANCE_PRESENTATION[key].icon as IoniconName,
  }));
