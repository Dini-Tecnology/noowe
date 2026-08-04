import { FC, useState } from 'react';
import { Clock, Check, ChefHat, Truck, X, ChevronLeft, Play } from "lucide-react";
import RestaurantLiquidGlassNav from '../../components/RestaurantLiquidGlassNav';

interface RestaurantOrdersScreenV2Props {
  onNavigate: (screen: string) => void;
}

type PreviewOrderStatus = "new" | "confirmed" | "preparing" | "ready" | "delivered";

const initialOrders: { id: string; customerName: string; table: string; items: string[]; total: number; time: string; status: PreviewOrderStatus }[] = [
  { id: "#1234", customerName: "Rafael Souza", table: "Mesa 5", items: ["2x Ramen Tonkotsu", "1x Gyoza"], total: 119.80, time: "14:32", status: "preparing" },
  { id: "#1235", customerName: "Camila Rodrigues", table: "Mesa 12", items: ["1x Udon", "2x Edamame"], total: 68.00, time: "14:35", status: "new" },
  { id: "#1236", customerName: "Ana Souza", table: "Mesa 3", items: ["3x Ramen", "2x Gyoza"], total: 194.70, time: "14:28", status: "ready" },
];

const RestaurantOrdersScreenV2: FC<RestaurantOrdersScreenV2Props> = ({ onNavigate }) => {
  const [orders, setOrders] = useState(initialOrders);
  const advance = (id: string, status: PreviewOrderStatus) => {
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order));
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-muted to-background">
      {/* Header */}
      <div className="px-5 py-4 bg-card border-b border-border">
        <div className="flex items-center gap-3 mb-3">
          <button 
            onClick={() => onNavigate('restaurant-dashboard-v2')}
            className="p-2 -ml-2 rounded-full hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-semibold text-foreground">Pedidos</h1>
        </div>
        <div className="flex gap-2">
          {["Todos", "Novos", "Preparando", "Prontos", "Entregues"].map((tab, i) => (
            <button key={tab} className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              i === 0 
                ? 'bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg' 
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 pb-24">
        {orders.map((order) => (
          <div key={order.id} className={`p-4 rounded-2xl border-2 ${
            order.status === 'new' ? 'border-primary bg-primary/5' :
            order.status === 'ready' ? 'border-success bg-success/5' : 'border-border bg-card'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 font-bold text-primary">
                  {order.table.replace("Mesa ", "")}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-foreground">{order.customerName}</p>
                  <p className="text-sm text-muted-foreground">{order.table}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span className="text-sm">{order.time}</span>
              </div>
            </div>
            
            <div className="space-y-1 mb-3">
              {order.items.map((item, i) => (
                <p key={i} className="text-sm text-muted-foreground">{item}</p>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className="font-bold text-primary">R$ {order.total.toFixed(2)}</span>
              <div className="flex gap-2">
                {order.status === 'new' && (
                  <>
                    <button className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors">
                      <X className="w-5 h-5" />
                    </button>
                    <button onClick={() => advance(order.id, "confirmed")} className="px-4 py-2 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-medium text-sm flex items-center gap-2 shadow-lg">
                      <ChefHat className="w-4 h-4" />
                      Aceitar
                    </button>
                  </>
                )}
                {order.status === 'confirmed' && (
                  <button onClick={() => advance(order.id, "preparing")} className="px-4 py-2 rounded-xl bg-amber-500 text-white font-medium text-sm flex items-center gap-2 shadow-lg">
                    <Play className="w-4 h-4" />
                    Preparar
                  </button>
                )}
                {order.status === 'preparing' && (
                  <button onClick={() => advance(order.id, "ready")} className="px-4 py-2 rounded-xl bg-gradient-to-r from-success to-secondary text-success-foreground font-medium text-sm flex items-center gap-2 shadow-lg">
                    <Check className="w-4 h-4" />
                    Marcar como Pronto
                  </button>
                )}
                {order.status === 'ready' && (
                  <button onClick={() => advance(order.id, "delivered")} className="px-4 py-2 rounded-xl bg-gradient-to-r from-secondary to-secondary/80 text-secondary-foreground font-medium text-sm flex items-center gap-2 shadow-lg">
                    <Truck className="w-4 h-4" />
                    Entregar
                  </button>
                )}
                {order.status === 'delivered' && (
                  <span className="rounded-full bg-success/10 px-3 py-2 text-sm font-semibold text-success">Entregue</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <RestaurantLiquidGlassNav activeTab="orders" onNavigate={onNavigate} />
    </div>
  );
};

export default RestaurantOrdersScreenV2;
