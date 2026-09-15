import { FC } from 'react';
import { ChevronLeft, Calendar, Users, Clock, Check, MapPin, Phone, X } from "lucide-react";

interface RestaurantReservationsScreenV2Props { onNavigate: (screen: string) => void; }

const reservations = [
  { id: 1, name: 'Silva', guests: 4, time: '19:00', table: '05', phone: '(11) 99999-1234', status: 'confirmed' },
  { id: 2, name: 'Santos', guests: 2, time: '20:00', table: 'A definir', phone: '(11) 98888-5678', status: 'pending' },
  { id: 3, name: 'Costa', guests: 6, time: '21:00', table: '09', phone: '(11) 97777-9012', status: 'confirmed' },
];

const RestaurantReservationsScreenV2: FC<RestaurantReservationsScreenV2Props> = ({ onNavigate }) => (
  <div className="h-full flex flex-col bg-gradient-to-b from-muted to-background">
    <div className="px-5 py-4 bg-card border-b border-border">
      <div className="flex items-center gap-3">
        <button onClick={() => onNavigate('restaurant-dashboard-v2')} className="p-2 -ml-2 rounded-full hover:bg-muted"><ChevronLeft className="w-5 h-5 text-muted-foreground" /></button>
        <h1 className="text-xl font-semibold text-foreground">Reservas</h1>
      </div>
    </div>
    <div className="flex-1 overflow-y-auto p-5 space-y-3">
      {reservations.map(res => (
        <div key={res.id} className={`p-4 rounded-2xl border-2 ${res.status === 'pending' ? 'bg-warning/5 border-warning' : 'bg-card border-border'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-foreground">Família {res.name}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${res.status === 'confirmed' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {res.status === 'confirmed' ? 'Confirmada' : 'Pendente'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-muted-foreground mb-3">
            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />Hora: {res.time}</span>
            <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />Mesa: {res.table}</span>
            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{res.guests} pessoas</span>
            <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{res.phone}</span>
          </div>
          {res.status === 'pending' && (
            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-xl bg-gradient-to-r from-success to-secondary text-success-foreground text-sm font-medium flex items-center justify-center gap-1"><Check className="w-4 h-4" />Confirmar</button>
              <button className="py-2 px-3 rounded-xl bg-destructive/10 text-destructive"><X className="w-4 h-4" /></button>
            </div>
          )}
        </div>
      ))}
    </div>
  </div>
);

export default RestaurantReservationsScreenV2;
