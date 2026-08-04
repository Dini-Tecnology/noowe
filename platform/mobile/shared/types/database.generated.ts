export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          complement: string | null
          country: string
          created_at: string
          id: string
          is_default: boolean
          label: string
          latitude: number | null
          longitude: number | null
          neighborhood: string
          number: string
          postal_code: string
          restaurant_id: string | null
          state: string
          street: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          complement?: string | null
          country: string
          created_at: string
          id?: string
          is_default: boolean
          label: string
          latitude?: number | null
          longitude?: number | null
          neighborhood: string
          number: string
          postal_code: string
          restaurant_id?: string | null
          state: string
          street: string
          updated_at: string
          user_id: string
        }
        Update: {
          city?: string
          complement?: string | null
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string
          latitude?: number | null
          longitude?: number | null
          neighborhood?: string
          number?: string
          postal_code?: string
          restaurant_id?: string | null
          state?: string
          street?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      approvals: {
        Row: {
          amount: number
          created_at: string
          id: string
          item_name: string
          order_id: string | null
          reason: string
          requester_id: string
          resolution_note: string | null
          resolved_at: string | null
          resolver_id: string | null
          restaurant_id: string
          status: string
          table_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          id?: string
          item_name: string
          order_id?: string | null
          reason: string
          requester_id: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          restaurant_id: string
          status?: string
          table_id?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          item_name?: string
          order_id?: string | null
          reason?: string
          requester_id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolver_id?: string | null
          restaurant_id?: string
          status?: string
          table_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendances: {
        Row: {
          check_in: string | null
          check_out: string | null
          created_at: string
          date: string
          hours_worked: number
          id: string
          notes: string | null
          restaurant_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in?: string | null
          check_out?: string | null
          created_at: string
          date: string
          hours_worked: number
          id?: string
          notes?: string | null
          restaurant_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Update: {
          check_in?: string | null
          check_out?: string | null
          created_at?: string
          date?: string
          hours_worked?: number
          id?: string
          notes?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          email: string | null
          entity_id: string | null
          entity_type: string | null
          failure_reason: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          success: boolean
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at: string
          email?: string | null
          entity_id?: string | null
          entity_type?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          success: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          email?: string | null
          entity_id?: string | null
          entity_type?: string | null
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          success?: boolean
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bills: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string
          due_date: string
          id: string
          is_recurring: boolean
          paid_date: string | null
          recurrence: string | null
          restaurant_id: string
          status: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at: string
          description: string
          due_date: string
          id?: string
          is_recurring: boolean
          paid_date?: string | null
          recurrence?: string | null
          restaurant_id: string
          status: string
          supplier?: string | null
          updated_at: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          is_recurring?: boolean
          paid_date?: string | null
          recurrence?: string | null
          restaurant_id?: string
          status?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      biometric_tokens: {
        Row: {
          biometric_type: string
          created_at: string
          device_id: string
          expires_at: string
          id: string
          ip_address: string | null
          is_revoked: boolean
          last_used_at: string | null
          platform: string | null
          public_key: string | null
          revoke_reason: string | null
          revoked_at: string | null
          token_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          biometric_type: string
          created_at: string
          device_id: string
          expires_at: string
          id?: string
          ip_address?: string | null
          is_revoked: boolean
          last_used_at?: string | null
          platform?: string | null
          public_key?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          token_hash: string
          updated_at: string
          user_id: string
        }
        Update: {
          biometric_type?: string
          created_at?: string
          device_id?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_revoked?: boolean
          last_used_at?: string | null
          platform?: string | null
          public_key?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          token_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cash_register_movements: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_cash: boolean
          order_id: string | null
          session_id: string
          type: string
        }
        Insert: {
          amount: number
          created_at: string
          created_by: string
          description?: string | null
          id?: string
          is_cash: boolean
          order_id?: string | null
          session_id: string
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_cash?: boolean
          order_id?: string | null
          session_id?: string
          type?: string
        }
        Relationships: []
      }
      cash_register_sessions: {
        Row: {
          actual_balance: number | null
          closed_at: string | null
          closed_by: string | null
          closing_notes: string | null
          difference: number | null
          expected_balance: number | null
          id: string
          opened_at: string
          opened_by: string
          opening_balance: number
          restaurant_id: string
          status: string
        }
        Insert: {
          actual_balance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          difference?: number | null
          expected_balance?: number | null
          id?: string
          opened_at: string
          opened_by: string
          opening_balance: number
          restaurant_id: string
          status: string
        }
        Update: {
          actual_balance?: number | null
          closed_at?: string | null
          closed_by?: string | null
          closing_notes?: string | null
          difference?: number | null
          expected_balance?: number | null
          id?: string
          opened_at?: string
          opened_by?: string
          opening_balance?: number
          restaurant_id?: string
          status?: string
        }
        Relationships: []
      }
      club_birthday_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          birth_date: string
          companions_allowed: number
          companions_registered: number
          created_at: string
          credit_amount: number
          discount_percentage: number | null
          document_number: string
          document_photo_url: string | null
          document_type: string
          event_date: string
          free_entry: boolean
          id: string
          name: string | null
          qr_code: string
          rejection_reason: string | null
          restaurant_id: string
          status: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          birth_date: string
          companions_allowed: number
          companions_registered: number
          created_at: string
          credit_amount: number
          discount_percentage?: number | null
          document_number: string
          document_photo_url?: string | null
          document_type: string
          event_date: string
          free_entry: boolean
          id?: string
          name?: string | null
          qr_code: string
          rejection_reason?: string | null
          restaurant_id: string
          status: string
          updated_at: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          birth_date?: string
          companions_allowed?: number
          companions_registered?: number
          created_at?: string
          credit_amount?: number
          discount_percentage?: number | null
          document_number?: string
          document_photo_url?: string | null
          document_type?: string
          event_date?: string
          free_entry?: boolean
          id?: string
          name?: string | null
          qr_code?: string
          rejection_reason?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      club_check_in_outs: {
        Row: {
          check_in_at: string
          check_out_at: string | null
          created_at: string
          entry_id: string | null
          id: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          check_in_at: string
          check_out_at?: string | null
          created_at: string
          entry_id?: string | null
          id?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          check_in_at?: string
          check_out_at?: string | null
          created_at?: string
          entry_id?: string | null
          id?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      club_entries: {
        Row: {
          created_at: string
          credit_amount: number
          event_date: string
          id: string
          metadata: Json | null
          purchase_type: string
          qr_code: string
          quantity: number
          restaurant_id: string
          status: string
          total_price: number
          transaction_id: string | null
          unit_price: number
          updated_at: string
          used_at: string | null
          user_id: string
          variation_id: string
          variation_name: string | null
        }
        Insert: {
          created_at: string
          credit_amount: number
          event_date: string
          id?: string
          metadata?: Json | null
          purchase_type: string
          qr_code: string
          quantity: number
          restaurant_id: string
          status: string
          total_price: number
          transaction_id?: string | null
          unit_price: number
          updated_at: string
          used_at?: string | null
          user_id: string
          variation_id: string
          variation_name?: string | null
        }
        Update: {
          created_at?: string
          credit_amount?: number
          event_date?: string
          id?: string
          metadata?: Json | null
          purchase_type?: string
          qr_code?: string
          quantity?: number
          restaurant_id?: string
          status?: string
          total_price?: number
          transaction_id?: string | null
          unit_price?: number
          updated_at?: string
          used_at?: string | null
          user_id?: string
          variation_id?: string
          variation_name?: string | null
        }
        Relationships: []
      }
      cook_stations: {
        Row: {
          created_at: string
          description: string | null
          display_color: string | null
          display_name: string | null
          display_order: number
          emoji: string | null
          id: string
          is_active: boolean
          kds_label: string | null
          late_threshold_minutes: number
          name: string
          printer_ip: string | null
          restaurant_id: string
          station_type: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_color?: string | null
          display_name?: string | null
          display_order?: number
          emoji?: string | null
          id?: string
          is_active?: boolean
          kds_label?: string | null
          late_threshold_minutes?: number
          name: string
          printer_ip?: string | null
          restaurant_id: string
          station_type?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_color?: string | null
          display_name?: string | null
          display_order?: number
          emoji?: string | null
          id?: string
          is_active?: boolean
          kds_label?: string | null
          late_threshold_minutes?: number
          name?: string
          printer_ip?: string | null
          restaurant_id?: string
          station_type?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      customer_feedback: {
        Row: {
          collected_at: string
          collected_by: string
          created_at: string
          customer_id: string | null
          customer_name: string | null
          id: string
          note: string | null
          rating: number | null
          restaurant_id: string
          sentiment: string
          service_stage: string
          table_id: string | null
          table_session_id: string | null
          updated_at: string
        }
        Insert: {
          collected_at?: string
          collected_by: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          note?: string | null
          rating?: number | null
          restaurant_id: string
          sentiment: string
          service_stage?: string
          table_id?: string | null
          table_session_id?: string | null
          updated_at?: string
        }
        Update: {
          collected_at?: string
          collected_by?: string
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          id?: string
          note?: string | null
          rating?: number | null
          restaurant_id?: string
          sentiment?: string
          service_stage?: string
          table_id?: string | null
          table_session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedback_collected_by_fkey"
            columns: ["collected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedback_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: true
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          avg_ticket: number
          birthday: string | null
          created_at: string
          dietary_preferences: string
          favorite_items: string
          id: string
          last_visit_at: string | null
          notes: string | null
          restaurant_id: string
          segment: string
          total_spent: number
          total_visits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_ticket: number
          birthday?: string | null
          created_at: string
          dietary_preferences: string
          favorite_items: string
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          restaurant_id: string
          segment: string
          total_spent: number
          total_visits: number
          updated_at: string
          user_id: string
        }
        Update: {
          avg_ticket?: number
          birthday?: string | null
          created_at?: string
          dietary_preferences?: string
          favorite_items?: string
          id?: string
          last_visit_at?: string | null
          notes?: string | null
          restaurant_id?: string
          segment?: string
          total_spent?: number
          total_visits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      delivery_settlements: {
        Row: {
          actual_received: number | null
          commission_amount: number
          created_at: string
          difference: number | null
          expected_net: number
          gross_amount: number
          id: string
          order_count: number
          platform: string
          restaurant_id: string
          settlement_date: string
          status: string
        }
        Insert: {
          actual_received?: number | null
          commission_amount: number
          created_at: string
          difference?: number | null
          expected_net: number
          gross_amount: number
          id?: string
          order_count: number
          platform: string
          restaurant_id: string
          settlement_date: string
          status: string
        }
        Update: {
          actual_received?: number | null
          commission_amount?: number
          created_at?: string
          difference?: number | null
          expected_net?: number
          gross_amount?: number
          id?: string
          order_count?: number
          platform?: string
          restaurant_id?: string
          settlement_date?: string
          status?: string
        }
        Relationships: []
      }
      demo_feedback: {
        Row: {
          active_role: string | null
          created_at: string
          demo_step: string | null
          description: string | null
          email: string | null
          feedback_type: string
          id: string
          journey_step: string | null
          page_route: string | null
          rating: number | null
          recent_actions: Json | null
          viewport_mode: string | null
        }
        Insert: {
          active_role?: string | null
          created_at?: string
          demo_step?: string | null
          description?: string | null
          email?: string | null
          feedback_type?: string
          id?: string
          journey_step?: string | null
          page_route?: string | null
          rating?: number | null
          recent_actions?: Json | null
          viewport_mode?: string | null
        }
        Update: {
          active_role?: string | null
          created_at?: string
          demo_step?: string | null
          description?: string | null
          email?: string | null
          feedback_type?: string
          id?: string
          journey_step?: string | null
          page_route?: string | null
          rating?: number | null
          recent_actions?: Json | null
          viewport_mode?: string | null
        }
        Relationships: []
      }
      demo_leads: {
        Row: {
          access_code: string
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          restaurant: string
          verified: boolean
        }
        Insert: {
          access_code: string
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          restaurant: string
          verified?: boolean
        }
        Update: {
          access_code?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          restaurant?: string
          verified?: boolean
        }
        Relationships: []
      }
      drink_recipes: {
        Row: {
          base_spirit: string | null
          category: string
          created_at: string
          description: string | null
          difficulty: string
          estimated_cost: number | null
          garnish: string | null
          glass_type: string
          id: string
          image_url: string | null
          ingredients: string
          is_active: boolean
          margin_percentage: number | null
          name: string
          preparation_time_minutes: number
          price: number
          restaurant_id: string | null
          serving_temp: string
          steps: string
          tags: string | null
          updated_at: string
        }
        Insert: {
          base_spirit?: string | null
          category: string
          created_at: string
          description?: string | null
          difficulty: string
          estimated_cost?: number | null
          garnish?: string | null
          glass_type: string
          id?: string
          image_url?: string | null
          ingredients: string
          is_active: boolean
          margin_percentage?: number | null
          name: string
          preparation_time_minutes: number
          price: number
          restaurant_id?: string | null
          serving_temp: string
          steps: string
          tags?: string | null
          updated_at: string
        }
        Update: {
          base_spirit?: string | null
          category?: string
          created_at?: string
          description?: string | null
          difficulty?: string
          estimated_cost?: number | null
          garnish?: string | null
          glass_type?: string
          id?: string
          image_url?: string | null
          ingredients?: string
          is_active?: boolean
          margin_percentage?: number | null
          name?: string
          preparation_time_minutes?: number
          price?: number
          restaurant_id?: string | null
          serving_temp?: string
          steps?: string
          tags?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      edge_rate_limits: {
        Row: {
          key: string
          request_count: number
          updated_at: string
          window_start: string
        }
        Insert: {
          key: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Update: {
          key?: string
          request_count?: number
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      external_menu_mappings: {
        Row: {
          created_at: string
          external_item_id: string
          external_item_name: string
          id: string
          internal_menu_item_id: string
          is_active: boolean
          platform: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at: string
          external_item_id: string
          external_item_name: string
          id?: string
          internal_menu_item_id: string
          is_active: boolean
          platform: string
          restaurant_id: string
          updated_at: string
        }
        Update: {
          created_at?: string
          external_item_id?: string
          external_item_name?: string
          id?: string
          internal_menu_item_id?: string
          is_active?: boolean
          platform?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          restaurant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at: string
          id?: string
          notes?: string | null
          restaurant_id: string
          updated_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          restaurant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string
          description: string | null
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          restaurant_id: string
          transaction_date: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id: string
          transaction_date: string
          type: string
          updated_at: string
        }
        Update: {
          amount?: number
          category?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id?: string
          transaction_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      fire_schedules: {
        Row: {
          actual_ready_at: string | null
          course: string | null
          created_at: string
          expected_ready_at: string | null
          fire_at: string | null
          fire_mode: string
          fired: boolean
          id: string
          order_id: string
          order_item_id: string
          station_id: string
        }
        Insert: {
          actual_ready_at?: string | null
          course?: string | null
          created_at: string
          expected_ready_at?: string | null
          fire_at?: string | null
          fire_mode: string
          fired: boolean
          id?: string
          order_id: string
          order_item_id: string
          station_id: string
        }
        Update: {
          actual_ready_at?: string | null
          course?: string | null
          created_at?: string
          expected_ready_at?: string | null
          fire_at?: string | null
          fire_mode?: string
          fired?: boolean
          id?: string
          order_id?: string
          order_item_id?: string
          station_id?: string
        }
        Relationships: []
      }
      fiscal_configs: {
        Row: {
          auto_emit: boolean
          certificate_base64: string | null
          certificate_password: string | null
          certificate_uploaded: boolean
          cnpj: string
          created_at: string
          csc_id: string | null
          csc_token: string | null
          current_series: number
          endereco: Json
          fiscal_provider: string
          focus_nfe_token: string | null
          id: string
          ie: string | null
          is_active: boolean
          next_number: number
          nome_fantasia: string | null
          razao_social: string
          regime_tributario: string
          restaurant_id: string
          state_code: string
          tax_defaults: Json
          updated_at: string
        }
        Insert: {
          auto_emit: boolean
          certificate_base64?: string | null
          certificate_password?: string | null
          certificate_uploaded: boolean
          cnpj: string
          created_at: string
          csc_id?: string | null
          csc_token?: string | null
          current_series: number
          endereco: Json
          fiscal_provider: string
          focus_nfe_token?: string | null
          id?: string
          ie?: string | null
          is_active: boolean
          next_number: number
          nome_fantasia?: string | null
          razao_social: string
          regime_tributario: string
          restaurant_id: string
          state_code: string
          tax_defaults: Json
          updated_at: string
        }
        Update: {
          auto_emit?: boolean
          certificate_base64?: string | null
          certificate_password?: string | null
          certificate_uploaded?: boolean
          cnpj?: string
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          current_series?: number
          endereco?: Json
          fiscal_provider?: string
          focus_nfe_token?: string | null
          id?: string
          ie?: string | null
          is_active?: boolean
          next_number?: number
          nome_fantasia?: string | null
          razao_social?: string
          regime_tributario?: string
          restaurant_id?: string
          state_code?: string
          tax_defaults?: Json
          updated_at?: string
        }
        Relationships: []
      }
      fiscal_documents: {
        Row: {
          access_key: string | null
          created_at: string
          danfe_url: string | null
          error_message: string | null
          external_ref: string | null
          id: string
          items_snapshot: string | null
          number: number | null
          order_id: string
          protocol: string | null
          provider: string
          qr_code_url: string | null
          restaurant_id: string
          series: number | null
          status: string
          total_amount: number
          type: string
          xml: string | null
        }
        Insert: {
          access_key?: string | null
          created_at: string
          danfe_url?: string | null
          error_message?: string | null
          external_ref?: string | null
          id?: string
          items_snapshot?: string | null
          number?: number | null
          order_id: string
          protocol?: string | null
          provider: string
          qr_code_url?: string | null
          restaurant_id: string
          series?: number | null
          status: string
          total_amount: number
          type: string
          xml?: string | null
        }
        Update: {
          access_key?: string | null
          created_at?: string
          danfe_url?: string | null
          error_message?: string | null
          external_ref?: string | null
          id?: string
          items_snapshot?: string | null
          number?: number | null
          order_id?: string
          protocol?: string | null
          provider?: string
          qr_code_url?: string | null
          restaurant_id?: string
          series?: number | null
          status?: string
          total_amount?: number
          type?: string
          xml?: string | null
        }
        Relationships: []
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          created_at: string
          details: Json
          id: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at: string
          details: Json
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status: string
          updated_at: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          details?: Json
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gateway_configs: {
        Row: {
          created_at: string
          credentials: Json | null
          gateway_type: string | null
          id: string
          is_active: boolean
          merchant_name: string | null
          pix_key: string | null
          provider: string
          restaurant_id: string
          settings: Json | null
          supported_methods: Json | null
          updated_at: string
        }
        Insert: {
          created_at: string
          credentials?: Json | null
          gateway_type?: string | null
          id?: string
          is_active: boolean
          merchant_name?: string | null
          pix_key?: string | null
          provider: string
          restaurant_id: string
          settings?: Json | null
          supported_methods?: Json | null
          updated_at: string
        }
        Update: {
          created_at?: string
          credentials?: Json | null
          gateway_type?: string | null
          id?: string
          is_active?: boolean
          merchant_name?: string | null
          pix_key?: string | null
          provider?: string
          restaurant_id?: string
          settings?: Json | null
          supported_methods?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      gateway_transactions: {
        Row: {
          amount: number | null
          amount_cents: number
          correlation_id: string | null
          created_at: string
          customer_id: string | null
          error_code: string | null
          error_message: string | null
          external_id: string | null
          id: string
          idempotency_key: string
          metadata: Json | null
          order_id: string | null
          payment_method: string
          provider: string
          refunded_amount_cents: number
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          amount_cents: number
          correlation_id?: string | null
          created_at: string
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          idempotency_key: string
          metadata?: Json | null
          order_id?: string | null
          payment_method: string
          provider: string
          refunded_amount_cents: number
          restaurant_id: string
          status: string
          updated_at: string
        }
        Update: {
          amount?: number | null
          amount_cents?: number
          correlation_id?: string | null
          created_at?: string
          customer_id?: string | null
          error_code?: string | null
          error_message?: string | null
          external_id?: string | null
          id?: string
          idempotency_key?: string
          metadata?: Json | null
          order_id?: string | null
          payment_method?: string
          provider?: string
          refunded_amount_cents?: number
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      guest_list_entries: {
        Row: {
          created_at: string
          event_date: string
          id: string
          name: string
          party_size: number
          promoter_id: string | null
          qr_code: string
          restaurant_id: string
          status: string
          updated_at: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at: string
          event_date: string
          id?: string
          name: string
          party_size: number
          promoter_id?: string | null
          qr_code: string
          restaurant_id: string
          status: string
          updated_at: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_date?: string
          id?: string
          name?: string
          party_size?: number
          promoter_id?: string | null
          qr_code?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      happy_hour_schedules: {
        Row: {
          applies_to: string
          category_ids: string | null
          created_at: string
          days: string
          description: string | null
          discount_type: string
          discount_value: number
          end_time: string
          id: string
          is_active: boolean
          item_ids: string | null
          name: string
          restaurant_id: string
          start_time: string
          updated_at: string
        }
        Insert: {
          applies_to: string
          category_ids?: string | null
          created_at: string
          days: string
          description?: string | null
          discount_type: string
          discount_value: number
          end_time: string
          id?: string
          is_active: boolean
          item_ids?: string | null
          name: string
          restaurant_id: string
          start_time: string
          updated_at: string
        }
        Update: {
          applies_to?: string
          category_ids?: string | null
          created_at?: string
          days?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_time?: string
          id?: string
          is_active?: boolean
          item_ids?: string | null
          name?: string
          restaurant_id?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingredient_prices: {
        Row: {
          created_at: string
          effective_date: string
          id: string
          ingredient_id: string
          price_per_unit: number
          supplier: string | null
        }
        Insert: {
          created_at: string
          effective_date: string
          id?: string
          ingredient_id: string
          price_per_unit: number
          supplier?: string | null
        }
        Update: {
          created_at?: string
          effective_date?: string
          id?: string
          ingredient_id?: string
          price_per_unit?: number
          supplier?: string | null
        }
        Relationships: []
      }
      ingredient_suppliers: {
        Row: {
          created_at: string
          id: string
          ingredient_id: string
          is_preferred: boolean
          last_price: number | null
          notes: string | null
          supplier_id: string
        }
        Insert: {
          created_at: string
          id?: string
          ingredient_id: string
          is_preferred: boolean
          last_price?: number | null
          notes?: string | null
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_id?: string
          is_preferred?: boolean
          last_price?: number | null
          notes?: string | null
          supplier_id?: string
        }
        Relationships: []
      }
      ingredients: {
        Row: {
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at: string
          id?: string
          is_active: boolean
          name: string
          restaurant_id: string
          unit: string
          updated_at: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_count_items: {
        Row: {
          count_id: string
          counted_quantity: number | null
          deviation: number | null
          deviation_value: number | null
          id: string
          ingredient_id: string
          ingredient_name: string
          is_counted: boolean
          stock_item_id: string
          system_quantity: number
          unit: string
        }
        Insert: {
          count_id: string
          counted_quantity?: number | null
          deviation?: number | null
          deviation_value?: number | null
          id?: string
          ingredient_id: string
          ingredient_name: string
          is_counted: boolean
          stock_item_id: string
          system_quantity: number
          unit: string
        }
        Update: {
          count_id?: string
          counted_quantity?: number | null
          deviation?: number | null
          deviation_value?: number | null
          id?: string
          ingredient_id?: string
          ingredient_name?: string
          is_counted?: boolean
          stock_item_id?: string
          system_quantity?: number
          unit?: string
        }
        Relationships: []
      }
      inventory_counts: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          id: string
          notes: string | null
          restaurant_id: string
          started_at: string
          started_by: string
          status: string
          total_deviation_value: number | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          notes?: string | null
          restaurant_id: string
          started_at: string
          started_by: string
          status?: string
          total_deviation_value?: number | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          notes?: string | null
          restaurant_id?: string
          started_at?: string
          started_by?: string
          status?: string
          total_deviation_value?: number | null
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          category: string
          created_at: string
          current_level: number
          id: string
          is_active: boolean
          last_restocked_at: string | null
          max_level: number | null
          min_level: number
          name: string
          notes: string | null
          restaurant_id: string
          supplier: string | null
          unit: string
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          category: string
          created_at: string
          current_level: number
          id?: string
          is_active: boolean
          last_restocked_at?: string | null
          max_level?: number | null
          min_level: number
          name: string
          notes?: string | null
          restaurant_id: string
          supplier?: string | null
          unit: string
          unit_cost?: number | null
          updated_at: string
        }
        Update: {
          category?: string
          created_at?: string
          current_level?: number
          id?: string
          is_active?: boolean
          last_restocked_at?: string | null
          max_level?: number | null
          min_level?: number
          name?: string
          notes?: string | null
          restaurant_id?: string
          supplier?: string | null
          unit?: string
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      kds_brain_configs: {
        Row: {
          auto_accept_delivery: boolean
          auto_routing: boolean | null
          batch_cooking: boolean | null
          course_gap_minutes: number
          course_gap_mode: string
          created_at: string
          default_prep_minutes: number | null
          delivery_buffer_minutes: number
          fire_order_enabled: boolean | null
          id: string
          kds_screens: number | null
          priority_alerts: boolean | null
          restaurant_id: string
          sound_enabled: boolean
          sound_volume: number
          updated_at: string
        }
        Insert: {
          auto_accept_delivery?: boolean
          auto_routing?: boolean | null
          batch_cooking?: boolean | null
          course_gap_minutes?: number
          course_gap_mode?: string
          created_at: string
          default_prep_minutes?: number | null
          delivery_buffer_minutes?: number
          fire_order_enabled?: boolean | null
          id?: string
          kds_screens?: number | null
          priority_alerts?: boolean | null
          restaurant_id: string
          sound_enabled?: boolean
          sound_volume?: number
          updated_at: string
        }
        Update: {
          auto_accept_delivery?: boolean
          auto_routing?: boolean | null
          batch_cooking?: boolean | null
          course_gap_minutes?: number
          course_gap_mode?: string
          created_at?: string
          default_prep_minutes?: number | null
          delivery_buffer_minutes?: number
          fire_order_enabled?: boolean | null
          id?: string
          kds_screens?: number | null
          priority_alerts?: boolean | null
          restaurant_id?: string
          sound_enabled?: boolean
          sound_volume?: number
          updated_at?: string
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          rejection_reason: string | null
          restaurant_id: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at: string
          end_date: string
          id?: string
          leave_type: string
          reason?: string | null
          rejection_reason?: string | null
          restaurant_id: string
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          rejection_reason?: string | null
          restaurant_id?: string
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lineup_slots: {
        Row: {
          artist_name: string
          artist_type: string
          created_at: string
          display_order: number
          end_time: string
          genre: string | null
          id: string
          is_headliner: boolean
          lineup_id: string
          photo_url: string | null
          stage: string | null
          start_time: string
          updated_at: string
        }
        Insert: {
          artist_name: string
          artist_type: string
          created_at: string
          display_order: number
          end_time: string
          genre?: string | null
          id?: string
          is_headliner: boolean
          lineup_id: string
          photo_url?: string | null
          stage?: string | null
          start_time: string
          updated_at: string
        }
        Update: {
          artist_name?: string
          artist_type?: string
          created_at?: string
          display_order?: number
          end_time?: string
          genre?: string | null
          id?: string
          is_headliner?: boolean
          lineup_id?: string
          photo_url?: string | null
          stage?: string | null
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      lineups: {
        Row: {
          cover_image_url: string | null
          created_at: string
          description: string | null
          event_date: string
          event_name: string | null
          id: string
          is_active: boolean
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at: string
          description?: string | null
          event_date: string
          event_name?: string | null
          id?: string
          is_active: boolean
          restaurant_id: string
          updated_at: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          event_date?: string
          event_name?: string | null
          id?: string
          is_active?: boolean
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_configs: {
        Row: {
          cashback_enabled: boolean
          cashback_percentage: number
          created_at: string
          id: string
          min_points_for_redemption: number
          points_enabled: boolean
          points_per_real: number
          points_redemption_rate: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          cashback_enabled: boolean
          cashback_percentage: number
          created_at: string
          id?: string
          min_points_for_redemption: number
          points_enabled: boolean
          points_per_real: number
          points_redemption_rate: number
          restaurant_id: string
          updated_at: string
        }
        Update: {
          cashback_enabled?: boolean
          cashback_percentage?: number
          created_at?: string
          id?: string
          min_points_for_redemption?: number
          points_enabled?: boolean
          points_per_real?: number
          points_redemption_rate?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_programs: {
        Row: {
          available_rewards: Json | null
          awarded_order_ids: string
          created_at: string
          id: string
          is_active: boolean
          last_visit: string | null
          points: number
          restaurant_id: string
          rewards_claimed: Json | null
          tier: string
          total_spent: number
          total_visits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          available_rewards?: Json | null
          awarded_order_ids: string
          created_at: string
          id?: string
          is_active: boolean
          last_visit?: string | null
          points: number
          restaurant_id: string
          rewards_claimed?: Json | null
          tier: string
          total_spent: number
          total_visits: number
          updated_at: string
          user_id: string
        }
        Update: {
          available_rewards?: Json | null
          awarded_order_ids?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_visit?: string | null
          points?: number
          restaurant_id?: string
          rewards_claimed?: Json | null
          tier?: string
          total_spent?: number
          total_visits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_customization_groups: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          max_select: number
          menu_item_id: string
          min_select: number
          name: string
          options: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at: string
          id?: string
          is_required: boolean
          max_select: number
          menu_item_id: string
          min_select: number
          name: string
          options: string
          sort_order: number
          updated_at: string
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_select?: number
          menu_item_id?: string
          min_select?: number
          name?: string
          options?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          allergens: Json | null
          calories: number | null
          category_id: string | null
          cfop: string
          course: string
          created_at: string
          customizations: Json | null
          description: string | null
          dietary_info: Json | null
          display_order: number
          estimated_prep_minutes: number
          id: string
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          metadata: Json
          name: string
          ncm: string
          original_price: number | null
          preparation_time: number | null
          price: number
          restaurant_id: string
          sort_order: number
          station_id: string | null
          updated_at: string
        }
        Insert: {
          allergens?: Json | null
          calories?: number | null
          category_id?: string | null
          cfop?: string
          course?: string
          created_at?: string
          customizations?: Json | null
          description?: string | null
          dietary_info?: Json | null
          display_order?: number
          estimated_prep_minutes?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          metadata?: Json
          name: string
          ncm?: string
          original_price?: number | null
          preparation_time?: number | null
          price: number
          restaurant_id: string
          sort_order?: number
          station_id?: string | null
          updated_at?: string
        }
        Update: {
          allergens?: Json | null
          calories?: number | null
          category_id?: string | null
          cfop?: string
          course?: string
          created_at?: string
          customizations?: Json | null
          description?: string | null
          dietary_info?: Json | null
          display_order?: number
          estimated_prep_minutes?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          metadata?: Json
          name?: string
          ncm?: string
          original_price?: number | null
          preparation_time?: number | null
          price?: number
          restaurant_id?: string
          sort_order?: number
          station_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          metadata: Json | null
          notification_type: Database["public"]["Enums"]["notifications_notification_type_enum"]
          read_at: string | null
          related_id: string | null
          related_type:
            | Database["public"]["Enums"]["notifications_related_type_enum"]
            | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json | null
          notification_type?: Database["public"]["Enums"]["notifications_notification_type_enum"]
          read_at?: string | null
          related_id?: string | null
          related_type?:
            | Database["public"]["Enums"]["notifications_related_type_enum"]
            | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json | null
          notification_type?: Database["public"]["Enums"]["notifications_notification_type_enum"]
          read_at?: string | null
          related_id?: string | null
          related_type?:
            | Database["public"]["Enums"]["notifications_related_type_enum"]
            | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_guests: {
        Row: {
          amount_due: number
          amount_paid: number
          guest_name: string | null
          guest_user_id: string | null
          id: string
          is_host: boolean
          joined_at: string
          left_at: string | null
          order_id: string
          payment_completed: boolean
          payment_completed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount_due: number
          amount_paid: number
          guest_name?: string | null
          guest_user_id?: string | null
          id?: string
          is_host: boolean
          joined_at: string
          left_at?: string | null
          order_id: string
          payment_completed: boolean
          payment_completed_at?: string | null
          status: string
          updated_at: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          guest_name?: string | null
          guest_user_id?: string | null
          id?: string
          is_host?: boolean
          joined_at?: string
          left_at?: string | null
          order_id?: string
          payment_completed?: boolean
          payment_completed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          course: string | null
          created_at: string
          customizations: Json | null
          expected_ready_at: string | null
          fire_at: string | null
          id: string
          menu_item_id: string
          order_id: string
          ordered_by: string | null
          ordered_by_name: string | null
          prepared_at: string | null
          prepared_by: string | null
          quantity: number
          special_instructions: string | null
          station_id: string | null
          status: Database["public"]["Enums"]["order_items_status_enum"]
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          course?: string | null
          created_at?: string
          customizations?: Json | null
          expected_ready_at?: string | null
          fire_at?: string | null
          id?: string
          menu_item_id: string
          order_id: string
          ordered_by?: string | null
          ordered_by_name?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          quantity: number
          special_instructions?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["order_items_status_enum"]
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          course?: string | null
          created_at?: string
          customizations?: Json | null
          expected_ready_at?: string | null
          fire_at?: string | null
          id?: string
          menu_item_id?: string
          order_id?: string
          ordered_by?: string | null
          ordered_by_name?: string | null
          prepared_at?: string | null
          prepared_by?: string | null
          quantity?: number
          special_instructions?: string | null
          station_id?: string | null
          status?: Database["public"]["Enums"]["order_items_status_enum"]
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          actual_ready_at: string | null
          cancellation_reason: string | null
          completed_at: string | null
          created_at: string
          customer_id: string
          delivery_address: Json | null
          delivery_address_text: string | null
          delivery_phone: string | null
          delivery_rider_eta: string | null
          discount_amount: number
          estimated_ready_at: string | null
          estimated_time: number | null
          id: string
          is_shared: boolean
          metadata: Json | null
          order_number: string | null
          order_type: Database["public"]["Enums"]["orders_order_type_enum"]
          party_size: number
          payment_method: string | null
          payment_split_mode: string | null
          restaurant_id: string
          source: string
          source_order_id: string | null
          special_instructions: string | null
          status: Database["public"]["Enums"]["orders_status_enum"]
          subtotal: number | null
          table_id: string | null
          tax_amount: number
          tip_amount: number
          total_amount: number | null
          updated_at: string
          user_id: string | null
          waiter_id: string | null
        }
        Insert: {
          actual_ready_at?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id: string
          delivery_address?: Json | null
          delivery_address_text?: string | null
          delivery_phone?: string | null
          delivery_rider_eta?: string | null
          discount_amount?: number
          estimated_ready_at?: string | null
          estimated_time?: number | null
          id?: string
          is_shared?: boolean
          metadata?: Json | null
          order_number?: string | null
          order_type?: Database["public"]["Enums"]["orders_order_type_enum"]
          party_size?: number
          payment_method?: string | null
          payment_split_mode?: string | null
          restaurant_id: string
          source?: string
          source_order_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["orders_status_enum"]
          subtotal?: number | null
          table_id?: string | null
          tax_amount?: number
          tip_amount?: number
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
          waiter_id?: string | null
        }
        Update: {
          actual_ready_at?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          created_at?: string
          customer_id?: string
          delivery_address?: Json | null
          delivery_address_text?: string | null
          delivery_phone?: string | null
          delivery_rider_eta?: string | null
          discount_amount?: number
          estimated_ready_at?: string | null
          estimated_time?: number | null
          id?: string
          is_shared?: boolean
          metadata?: Json | null
          order_number?: string | null
          order_type?: Database["public"]["Enums"]["orders_order_type_enum"]
          party_size?: number
          payment_method?: string | null
          payment_split_mode?: string | null
          restaurant_id?: string
          source?: string
          source_order_id?: string | null
          special_instructions?: string | null
          status?: Database["public"]["Enums"]["orders_status_enum"]
          subtotal?: number | null
          table_id?: string | null
          tax_amount?: number
          tip_amount?: number
          total_amount?: number | null
          updated_at?: string
          user_id?: string | null
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_tokens: {
        Row: {
          attempts: number
          channel: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          is_used: boolean
          phone_number: string
          purpose: string
          used_at: string | null
        }
        Insert: {
          attempts: number
          channel: string
          code_hash: string
          created_at: string
          expires_at: string
          id?: string
          ip_address?: string | null
          is_used: boolean
          phone_number: string
          purpose: string
          used_at?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_used?: boolean
          phone_number?: string
          purpose?: string
          used_at?: string | null
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          is_used: boolean
          token: string
          used_at: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at: string
          expires_at: string
          id?: string
          ip_address?: string | null
          is_used: boolean
          token: string
          used_at?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          is_used?: boolean
          token?: string
          used_at?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          card_brand: string | null
          card_exp_month: string | null
          card_exp_year: string | null
          card_last_four: string | null
          created_at: string
          external_payment_method_id: string | null
          id: string
          is_active: boolean
          is_default: boolean
          metadata: Json | null
          method_type: string
          pix_key: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          card_brand?: string | null
          card_exp_month?: string | null
          card_exp_year?: string | null
          card_last_four?: string | null
          created_at: string
          external_payment_method_id?: string | null
          id?: string
          is_active: boolean
          is_default: boolean
          metadata?: Json | null
          method_type: string
          pix_key?: string | null
          updated_at: string
          user_id: string
        }
        Update: {
          card_brand?: string | null
          card_exp_month?: string | null
          card_exp_year?: string | null
          card_last_four?: string | null
          created_at?: string
          external_payment_method_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          metadata?: Json | null
          method_type?: string
          pix_key?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_splits: {
        Row: {
          amount_due: number
          amount_paid: number
          created_at: string
          custom_amount: number | null
          guest_user_id: string
          id: string
          notes: string | null
          order_id: string
          paid_at: string | null
          payment_id: string | null
          payment_transaction_id: string | null
          selected_items: string | null
          service_charge: number
          split_mode: string
          status: string
          tip_amount: number
          updated_at: string
        }
        Insert: {
          amount_due: number
          amount_paid: number
          created_at: string
          custom_amount?: number | null
          guest_user_id: string
          id?: string
          notes?: string | null
          order_id: string
          paid_at?: string | null
          payment_id?: string | null
          payment_transaction_id?: string | null
          selected_items?: string | null
          service_charge: number
          split_mode: string
          status: string
          tip_amount: number
          updated_at: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number
          created_at?: string
          custom_amount?: number | null
          guest_user_id?: string
          id?: string
          notes?: string | null
          order_id?: string
          paid_at?: string | null
          payment_id?: string | null
          payment_transaction_id?: string | null
          selected_items?: string | null
          service_charge?: number
          split_mode?: string
          status?: string
          tip_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_connections: {
        Row: {
          auto_accept: boolean
          created_at: string
          credentials: Json | null
          high_load_threshold: number
          id: string
          is_active: boolean
          last_sync_at: string | null
          max_concurrent_orders: number
          platform: string
          restaurant_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          auto_accept: boolean
          created_at: string
          credentials?: Json | null
          high_load_threshold: number
          id?: string
          is_active: boolean
          last_sync_at?: string | null
          max_concurrent_orders: number
          platform: string
          restaurant_id: string
          updated_at: string
          webhook_secret?: string | null
        }
        Update: {
          auto_accept?: boolean
          created_at?: string
          credentials?: Json | null
          high_load_threshold?: number
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          max_concurrent_orders?: number
          platform?: string
          restaurant_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: []
      }
      prep_analytics: {
        Row: {
          actual_prep_minutes: number | null
          day_of_week: string | null
          expected_prep_minutes: number
          id: string
          menu_item_id: string
          order_item_id: string
          recorded_at: string
          restaurant_id: string
          shift: string | null
          source: string | null
          station_id: string
          was_late: boolean
        }
        Insert: {
          actual_prep_minutes?: number | null
          day_of_week?: string | null
          expected_prep_minutes: number
          id?: string
          menu_item_id: string
          order_item_id: string
          recorded_at: string
          restaurant_id: string
          shift?: string | null
          source?: string | null
          station_id: string
          was_late: boolean
        }
        Update: {
          actual_prep_minutes?: number | null
          day_of_week?: string | null
          expected_prep_minutes?: number
          id?: string
          menu_item_id?: string
          order_item_id?: string
          recorded_at?: string
          restaurant_id?: string
          shift?: string | null
          source?: string | null
          station_id?: string
          was_late?: boolean
        }
        Relationships: []
      }
      prep_time_suggestions: {
        Row: {
          confidence_score: number
          created_at: string
          current_prep_minutes: number
          decided_at: string | null
          decided_by: string | null
          id: string
          menu_item_id: string
          menu_item_name: string
          restaurant_id: string
          sample_size: number
          station_id: string | null
          status: string
          suggested_prep_minutes: number
        }
        Insert: {
          confidence_score: number
          created_at: string
          current_prep_minutes: number
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          menu_item_id: string
          menu_item_name: string
          restaurant_id: string
          sample_size: number
          station_id?: string | null
          status: string
          suggested_prep_minutes: number
        }
        Update: {
          confidence_score?: number
          created_at?: string
          current_prep_minutes?: number
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          menu_item_id?: string
          menu_item_name?: string
          restaurant_id?: string
          sample_size?: number
          station_id?: string | null
          status?: string
          suggested_prep_minutes?: number
        }
        Relationships: []
      }
      profile_roles: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          is_active: boolean
          restaurant_id: string | null
          role_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string | null
          role_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string | null
          role_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_roles_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_roles_role_key_fkey"
            columns: ["role_key"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "profile_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apple_id: string | null
          avatar_url: string | null
          biometric_enabled: boolean
          birth_date: string | null
          created_at: string
          default_address: string | null
          deleted_at: string | null
          deletion_requested_at: string | null
          deletion_scheduled_for: string | null
          dietary_restrictions: string[] | null
          email: string | null
          favorite_cuisines: string[] | null
          fcm_token: string | null
          full_name: string | null
          google_id: string | null
          id: string
          is_active: boolean
          last_login_at: string | null
          marketing_consent: boolean
          phone: string | null
          phone_verified: boolean
          preferences: Json | null
          provider: string | null
          updated_at: string
        }
        Insert: {
          apple_id?: string | null
          avatar_url?: string | null
          biometric_enabled?: boolean
          birth_date?: string | null
          created_at?: string
          default_address?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          dietary_restrictions?: string[] | null
          email?: string | null
          favorite_cuisines?: string[] | null
          fcm_token?: string | null
          full_name?: string | null
          google_id?: string | null
          id: string
          is_active?: boolean
          last_login_at?: string | null
          marketing_consent?: boolean
          phone?: string | null
          phone_verified?: boolean
          preferences?: Json | null
          provider?: string | null
          updated_at?: string
        }
        Update: {
          apple_id?: string | null
          avatar_url?: string | null
          biometric_enabled?: boolean
          birth_date?: string | null
          created_at?: string
          default_address?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          dietary_restrictions?: string[] | null
          email?: string | null
          favorite_cuisines?: string[] | null
          fcm_token?: string | null
          full_name?: string | null
          google_id?: string | null
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          marketing_consent?: boolean
          phone?: string | null
          phone_verified?: boolean
          preferences?: Json | null
          provider?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      Projeto_Ativo: {
        Row: {
          Ativo: string | null
          created_at: string
          id: number
        }
        Insert: {
          Ativo?: string | null
          created_at?: string
          id?: number
        }
        Update: {
          Ativo?: string | null
          created_at?: string
          id?: number
        }
        Relationships: []
      }
      promoter_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_method: string
          payment_proof_url: string | null
          period_end: string
          period_start: string
          processed_at: string | null
          processed_by: string | null
          promoter_id: string
          restaurant_id: string
          sale_ids: Json
          sales_count: number
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at: string
          id?: string
          notes?: string | null
          payment_method: string
          payment_proof_url?: string | null
          period_end: string
          period_start: string
          processed_at?: string | null
          processed_by?: string | null
          promoter_id: string
          restaurant_id: string
          sale_ids: Json
          sales_count: number
          status: string
          transaction_id?: string | null
          updated_at: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          period_end?: string
          period_start?: string
          processed_at?: string | null
          processed_by?: string | null
          promoter_id?: string
          restaurant_id?: string
          sale_ids?: Json
          sales_count?: number
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      promoter_sales: {
        Row: {
          commission_amount: number
          commission_status: string
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          event_date: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_reference: string | null
          promoter_id: string
          quantity: number
          reference_id: string
          restaurant_id: string
          sale_amount: number
          sale_type: string
          updated_at: string
        }
        Insert: {
          commission_amount: number
          commission_status: string
          created_at: string
          customer_name?: string | null
          customer_phone?: string | null
          event_date: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          promoter_id: string
          quantity: number
          reference_id: string
          restaurant_id: string
          sale_amount: number
          sale_type: string
          updated_at: string
        }
        Update: {
          commission_amount?: number
          commission_status?: string
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          event_date?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_reference?: string | null
          promoter_id?: string
          quantity?: number
          reference_id?: string
          restaurant_id?: string
          sale_amount?: number
          sale_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      promoters: {
        Row: {
          bank: string | null
          commission_rate: number
          commission_type: string
          created_at: string
          email: string | null
          fixed_commission_amount: number
          id: string
          name: string
          nickname: string | null
          notes: string | null
          pending_commission: number
          phone: string | null
          photo_url: string | null
          pix_key: string | null
          promoter_code: string
          restaurant_id: string
          status: string
          tier: number | null
          total_commission_earned: number
          total_entries_sold: number
          total_revenue_generated: number
          total_tables_sold: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bank?: string | null
          commission_rate: number
          commission_type: string
          created_at: string
          email?: string | null
          fixed_commission_amount: number
          id?: string
          name: string
          nickname?: string | null
          notes?: string | null
          pending_commission: number
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          promoter_code: string
          restaurant_id: string
          status: string
          tier?: number | null
          total_commission_earned: number
          total_entries_sold: number
          total_revenue_generated: number
          total_tables_sold: number
          updated_at: string
          user_id: string
        }
        Update: {
          bank?: string | null
          commission_rate?: number
          commission_type?: string
          created_at?: string
          email?: string | null
          fixed_commission_amount?: number
          id?: string
          name?: string
          nickname?: string | null
          notes?: string | null
          pending_commission?: number
          phone?: string | null
          photo_url?: string | null
          pix_key?: string | null
          promoter_code?: string
          restaurant_id?: string
          status?: string
          tier?: number | null
          total_commission_earned?: number
          total_entries_sold?: number
          total_revenue_generated?: number
          total_tables_sold?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promotions: {
        Row: {
          applicable_categories: string | null
          code: string
          created_at: string
          current_uses: number
          days_of_week: number | null
          description: string | null
          discount_value: number | null
          free_item_id: string | null
          hours_from: string | null
          hours_until: string | null
          id: string
          max_uses: number | null
          max_uses_per_user: number
          min_order_value: number | null
          restaurant_id: string
          status: string
          title: string
          type: string
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Insert: {
          applicable_categories?: string | null
          code: string
          created_at: string
          current_uses: number
          days_of_week?: number | null
          description?: string | null
          discount_value?: number | null
          free_item_id?: string | null
          hours_from?: string | null
          hours_until?: string | null
          id?: string
          max_uses?: number | null
          max_uses_per_user: number
          min_order_value?: number | null
          restaurant_id: string
          status: string
          title: string
          type: string
          updated_at: string
          valid_from: string
          valid_until: string
        }
        Update: {
          applicable_categories?: string | null
          code?: string
          created_at?: string
          current_uses?: number
          days_of_week?: number | null
          description?: string | null
          discount_value?: number | null
          free_item_id?: string | null
          hours_from?: string | null
          hours_until?: string | null
          id?: string
          max_uses?: number | null
          max_uses_per_user?: number
          min_order_value?: number | null
          restaurant_id?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string
        }
        Relationships: []
      }
      purchase_records: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          import_method: string
          invoice_date: string
          invoice_number: string | null
          items: Json
          restaurant_id: string
          status: string
          supplier_name: string
          total_amount: number
        }
        Insert: {
          created_at: string
          created_by?: string | null
          id?: string
          import_method: string
          invoice_date: string
          invoice_number?: string | null
          items: Json
          restaurant_id: string
          status: string
          supplier_name: string
          total_amount: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          import_method?: string
          invoice_date?: string
          invoice_number?: string | null
          items?: Json
          restaurant_id?: string
          status?: string
          supplier_name?: string
          total_amount?: number
        }
        Relationships: []
      }
      qr_scan_logs: {
        Row: {
          device_info: Json | null
          id: string
          ip_address: string | null
          qr_code_id: string
          restaurant_id: string
          scan_result: string
          scanned_at: string
          scanned_by: string | null
          session_id: string | null
          table_id: string
        }
        Insert: {
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          qr_code_id: string
          restaurant_id: string
          scan_result: string
          scanned_at: string
          scanned_by?: string | null
          session_id?: string | null
          table_id: string
        }
        Update: {
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          qr_code_id?: string
          restaurant_id?: string
          scan_result?: string
          scanned_at?: string
          scanned_by?: string | null
          session_id?: string | null
          table_id?: string
        }
        Relationships: []
      }
      queue_entries: {
        Row: {
          called_at: string | null
          created_at: string
          entered_at: string | null
          estimated_wait_minutes: number
          id: string
          left_at: string | null
          party_size: number
          position: number
          priority_level_id: string
          priority_level_name: string | null
          restaurant_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          called_at?: string | null
          created_at: string
          entered_at?: string | null
          estimated_wait_minutes: number
          id?: string
          left_at?: string | null
          party_size: number
          position: number
          priority_level_id: string
          priority_level_name?: string | null
          restaurant_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Update: {
          called_at?: string | null
          created_at?: string
          entered_at?: string | null
          estimated_wait_minutes?: number
          id?: string
          left_at?: string | null
          party_size?: number
          position?: number
          priority_level_id?: string
          priority_level_name?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          items_snapshot: string
          order_id: string
          payment_id: string | null
          payment_method: string
          restaurant_id: string
          service_fee: number
          subtotal: number
          table_id: string | null
          tip: number
          total: number
          user_id: string
        }
        Insert: {
          created_at: string
          generated_at: string
          id?: string
          items_snapshot: string
          order_id: string
          payment_id?: string | null
          payment_method: string
          restaurant_id: string
          service_fee: number
          subtotal: number
          table_id?: string | null
          tip: number
          total: number
          user_id: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          items_snapshot?: string
          order_id?: string
          payment_id?: string | null
          payment_method?: string
          restaurant_id?: string
          service_fee?: number
          subtotal?: number
          table_id?: string | null
          tip?: number
          total?: number
          user_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          id: string
          ingredient_id: string
          quantity: number
          recipe_id: string
        }
        Insert: {
          id?: string
          ingredient_id: string
          quantity: number
          recipe_id: string
        }
        Update: {
          id?: string
          ingredient_id?: string
          quantity?: number
          recipe_id?: string
        }
        Relationships: []
      }
      recipes: {
        Row: {
          calculated_cost: number | null
          calculated_margin_pct: number | null
          created_at: string
          id: string
          last_calculated_at: string | null
          menu_item_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          calculated_cost?: number | null
          calculated_margin_pct?: number | null
          created_at: string
          id?: string
          last_calculated_at?: string | null
          menu_item_id: string
          restaurant_id: string
          updated_at: string
        }
        Update: {
          calculated_cost?: number | null
          calculated_margin_pct?: number | null
          created_at?: string
          id?: string
          last_calculated_at?: string | null
          menu_item_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reservation_guests: {
        Row: {
          arrived_at: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          guest_user_id: string | null
          has_arrived: boolean
          id: string
          invite_method: string | null
          invite_token: string | null
          invited_at: string
          invited_by: string | null
          is_host: boolean
          requires_host_approval: boolean
          reservation_id: string
          responded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          arrived_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_user_id?: string | null
          has_arrived: boolean
          id?: string
          invite_method?: string | null
          invite_token?: string | null
          invited_at: string
          invited_by?: string | null
          is_host: boolean
          requires_host_approval: boolean
          reservation_id: string
          responded_at?: string | null
          status: string
          updated_at: string
        }
        Update: {
          arrived_at?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          guest_user_id?: string | null
          has_arrived?: boolean
          id?: string
          invite_method?: string | null
          invite_token?: string | null
          invited_at?: string
          invited_by?: string | null
          is_host?: boolean
          requires_host_approval?: boolean
          reservation_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          customer_id: string
          id: string
          metadata: Json | null
          party_size: number
          reservation_time: string
          restaurant_id: string
          special_requests: string | null
          status: Database["public"]["Enums"]["reservations_status_enum"]
          table_id: string | null
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          customer_id: string
          id?: string
          metadata?: Json | null
          party_size: number
          reservation_time: string
          restaurant_id: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["reservations_status_enum"]
          table_id?: string | null
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          metadata?: Json | null
          party_size?: number
          reservation_time?: string
          restaurant_id?: string
          special_requests?: string | null
          status?: Database["public"]["Enums"]["reservations_status_enum"]
          table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_configs: {
        Row: {
          created_at: string
          enabled_features: string | null
          experience_flags: string | null
          floor_layout: string | null
          id: string
          kitchen_stations: string | null
          payment_config: string | null
          profile: string | null
          restaurant_id: string
          service_types: string | null
          setup_complete: boolean
          setup_completed_at: string | null
          team_config: string | null
          updated_at: string
        }
        Insert: {
          created_at: string
          enabled_features?: string | null
          experience_flags?: string | null
          floor_layout?: string | null
          id?: string
          kitchen_stations?: string | null
          payment_config?: string | null
          profile?: string | null
          restaurant_id: string
          service_types?: string | null
          setup_complete: boolean
          setup_completed_at?: string | null
          team_config?: string | null
          updated_at: string
        }
        Update: {
          created_at?: string
          enabled_features?: string | null
          experience_flags?: string | null
          floor_layout?: string | null
          id?: string
          kitchen_stations?: string | null
          payment_config?: string | null
          profile?: string | null
          restaurant_id?: string
          service_types?: string | null
          setup_complete?: boolean
          setup_completed_at?: string | null
          team_config?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_integrations: {
        Row: {
          connected_at: string | null
          created_at: string
          external_store_id: string | null
          id: string
          is_connected: boolean
          provider: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          connected_at?: string | null
          created_at?: string
          external_store_id?: string | null
          id?: string
          is_connected?: boolean
          provider: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          connected_at?: string | null
          created_at?: string
          external_store_id?: string | null
          id?: string
          is_connected?: boolean
          provider?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_integrations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_service_configs: {
        Row: {
          average_meal_duration: number | null
          avg_preparation_time: number | null
          build_your_own_enabled: boolean | null
          call_waiter_button: boolean | null
          config_metadata: Json | null
          created_at: string
          current_location: Json | null
          customization_options: Json | null
          dress_code: string | null
          drive_thru_lanes: number | null
          estimated_wait_display: boolean | null
          experience_duration: number | null
          experience_highlights: string | null
          fixed_price: number | null
          geofencing_enabled: boolean | null
          geofencing_radius: number | null
          group_friendly: boolean | null
          group_reservation_required: number | null
          id: string
          is_active: boolean
          license_plate_recognition: boolean | null
          max_group_size: number | null
          noise_level: string | null
          offline_mode_enabled: boolean | null
          order_at_table: boolean | null
          partial_order_enabled: boolean | null
          payment_mode: string | null
          pickup_zones: string | null
          power_outlets_available: boolean | null
          pre_booking_required: boolean | null
          price_per_kg: number | null
          reservation_grace_period: number | null
          reservation_required: boolean | null
          reservations_optional: boolean | null
          restaurant_id: string
          schedule: Json | null
          seats_available: number | null
          service_charge_included: boolean | null
          service_type: string
          skip_the_line_enabled: boolean | null
          smart_scales_enabled: boolean | null
          sommelier_available: boolean | null
          special_instructions: string | null
          split_bill_promoted: boolean | null
          suggested_tip_percentage: number | null
          table_service: boolean | null
          table_turnover_target: number | null
          tasting_menu_only: boolean | null
          updated_at: string
          waitlist_advance_drinks: boolean | null
          waitlist_enabled: boolean | null
          wifi_available: boolean | null
          work_friendly: boolean | null
        }
        Insert: {
          average_meal_duration?: number | null
          avg_preparation_time?: number | null
          build_your_own_enabled?: boolean | null
          call_waiter_button?: boolean | null
          config_metadata?: Json | null
          created_at: string
          current_location?: Json | null
          customization_options?: Json | null
          dress_code?: string | null
          drive_thru_lanes?: number | null
          estimated_wait_display?: boolean | null
          experience_duration?: number | null
          experience_highlights?: string | null
          fixed_price?: number | null
          geofencing_enabled?: boolean | null
          geofencing_radius?: number | null
          group_friendly?: boolean | null
          group_reservation_required?: number | null
          id?: string
          is_active: boolean
          license_plate_recognition?: boolean | null
          max_group_size?: number | null
          noise_level?: string | null
          offline_mode_enabled?: boolean | null
          order_at_table?: boolean | null
          partial_order_enabled?: boolean | null
          payment_mode?: string | null
          pickup_zones?: string | null
          power_outlets_available?: boolean | null
          pre_booking_required?: boolean | null
          price_per_kg?: number | null
          reservation_grace_period?: number | null
          reservation_required?: boolean | null
          reservations_optional?: boolean | null
          restaurant_id: string
          schedule?: Json | null
          seats_available?: number | null
          service_charge_included?: boolean | null
          service_type: string
          skip_the_line_enabled?: boolean | null
          smart_scales_enabled?: boolean | null
          sommelier_available?: boolean | null
          special_instructions?: string | null
          split_bill_promoted?: boolean | null
          suggested_tip_percentage?: number | null
          table_service?: boolean | null
          table_turnover_target?: number | null
          tasting_menu_only?: boolean | null
          updated_at: string
          waitlist_advance_drinks?: boolean | null
          waitlist_enabled?: boolean | null
          wifi_available?: boolean | null
          work_friendly?: boolean | null
        }
        Update: {
          average_meal_duration?: number | null
          avg_preparation_time?: number | null
          build_your_own_enabled?: boolean | null
          call_waiter_button?: boolean | null
          config_metadata?: Json | null
          created_at?: string
          current_location?: Json | null
          customization_options?: Json | null
          dress_code?: string | null
          drive_thru_lanes?: number | null
          estimated_wait_display?: boolean | null
          experience_duration?: number | null
          experience_highlights?: string | null
          fixed_price?: number | null
          geofencing_enabled?: boolean | null
          geofencing_radius?: number | null
          group_friendly?: boolean | null
          group_reservation_required?: number | null
          id?: string
          is_active?: boolean
          license_plate_recognition?: boolean | null
          max_group_size?: number | null
          noise_level?: string | null
          offline_mode_enabled?: boolean | null
          order_at_table?: boolean | null
          partial_order_enabled?: boolean | null
          payment_mode?: string | null
          pickup_zones?: string | null
          power_outlets_available?: boolean | null
          pre_booking_required?: boolean | null
          price_per_kg?: number | null
          reservation_grace_period?: number | null
          reservation_required?: boolean | null
          reservations_optional?: boolean | null
          restaurant_id?: string
          schedule?: Json | null
          seats_available?: number | null
          service_charge_included?: boolean | null
          service_type?: string
          skip_the_line_enabled?: boolean | null
          smart_scales_enabled?: boolean | null
          sommelier_available?: boolean | null
          special_instructions?: string | null
          split_bill_promoted?: boolean | null
          suggested_tip_percentage?: number | null
          table_service?: boolean | null
          table_turnover_target?: number | null
          tasting_menu_only?: boolean | null
          updated_at?: string
          waitlist_advance_drinks?: boolean | null
          waitlist_enabled?: boolean | null
          wifi_available?: boolean | null
          work_friendly?: boolean | null
        }
        Relationships: []
      }
      restaurant_special_requests: {
        Row: {
          acknowledged_at: string | null
          action_label: string | null
          assigned_to: string | null
          created_at: string
          customer_id: string | null
          description: string
          due_at: string | null
          handled_by: string | null
          handled_note: string | null
          id: string
          metadata: Json
          priority: number
          request_type: string
          requested_by: string | null
          reservation_id: string | null
          resolved_at: string | null
          restaurant_id: string
          source: string
          status: string
          table_id: string | null
          table_session_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          action_label?: string | null
          assigned_to?: string | null
          created_at?: string
          customer_id?: string | null
          description: string
          due_at?: string | null
          handled_by?: string | null
          handled_note?: string | null
          id?: string
          metadata?: Json
          priority?: number
          request_type?: string
          requested_by?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          restaurant_id: string
          source?: string
          status?: string
          table_id?: string | null
          table_session_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          action_label?: string | null
          assigned_to?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string
          due_at?: string | null
          handled_by?: string | null
          handled_note?: string | null
          id?: string
          metadata?: Json
          priority?: number
          request_type?: string
          requested_by?: string | null
          reservation_id?: string | null
          resolved_at?: string | null
          restaurant_id?: string
          source?: string
          status?: string
          table_id?: string | null
          table_session_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_special_requests_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_special_requests_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_special_requests_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_special_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_special_requests_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_special_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_special_requests_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_special_requests_table_session_id_fkey"
            columns: ["table_session_id"]
            isOneToOne: false
            referencedRelation: "table_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string
          address_complement: string | null
          address_number: string | null
          average_prep_time: number | null
          average_ticket: number | null
          banner_url: string | null
          business_hours: Json | null
          city: string
          cover_image_url: string | null
          created_at: string
          cuisine_type: string | null
          cuisine_types: Json | null
          description: string | null
          email: string
          features: Json | null
          geofence_radius: number | null
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          location: Json | null
          logo_url: string | null
          max_party_size: number | null
          name: string
          neighborhood: string | null
          opening_hours: Json | null
          owner_id: string
          phone: string
          price_range: string | null
          rating: number
          service_config: Json | null
          service_type: string
          settings: Json | null
          setup_progress: Json
          state: string
          total_reviews: number
          updated_at: string
          zip_code: string
        }
        Insert: {
          address: string
          address_complement?: string | null
          address_number?: string | null
          average_prep_time?: number | null
          average_ticket?: number | null
          banner_url?: string | null
          business_hours?: Json | null
          city: string
          cover_image_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          cuisine_types?: Json | null
          description?: string | null
          email: string
          features?: Json | null
          geofence_radius?: number | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          location?: Json | null
          logo_url?: string | null
          max_party_size?: number | null
          name: string
          neighborhood?: string | null
          opening_hours?: Json | null
          owner_id: string
          phone: string
          price_range?: string | null
          rating?: number
          service_config?: Json | null
          service_type: string
          settings?: Json | null
          setup_progress?: Json
          state: string
          total_reviews?: number
          updated_at?: string
          zip_code: string
        }
        Update: {
          address?: string
          address_complement?: string | null
          address_number?: string | null
          average_prep_time?: number | null
          average_ticket?: number | null
          banner_url?: string | null
          business_hours?: Json | null
          city?: string
          cover_image_url?: string | null
          created_at?: string
          cuisine_type?: string | null
          cuisine_types?: Json | null
          description?: string | null
          email?: string
          features?: Json | null
          geofence_radius?: number | null
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          location?: Json | null
          logo_url?: string | null
          max_party_size?: number | null
          name?: string
          neighborhood?: string | null
          opening_hours?: Json | null
          owner_id?: string
          phone?: string
          price_range?: string | null
          rating?: number
          service_config?: Json | null
          service_type?: string
          settings?: Json | null
          setup_progress?: Json
          state?: string
          total_reviews?: number
          updated_at?: string
          zip_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          ambiance_rating: number | null
          comment: string | null
          created_at: string
          deleted_at: string
          food_rating: number | null
          helpful_count: number
          id: string
          images: string | null
          is_verified: boolean
          is_visible: boolean
          order_id: string | null
          owner_responded_at: string | null
          owner_response: string | null
          rating: number
          restaurant_id: string
          sentiment: string | null
          sentiment_analysis: Json | null
          service_rating: number | null
          updated_at: string
          user_id: string
          value_rating: number | null
        }
        Insert: {
          ambiance_rating?: number | null
          comment?: string | null
          created_at: string
          deleted_at: string
          food_rating?: number | null
          helpful_count: number
          id?: string
          images?: string | null
          is_verified: boolean
          is_visible: boolean
          order_id?: string | null
          owner_responded_at?: string | null
          owner_response?: string | null
          rating: number
          restaurant_id: string
          sentiment?: string | null
          sentiment_analysis?: Json | null
          service_rating?: number | null
          updated_at: string
          user_id: string
          value_rating?: number | null
        }
        Update: {
          ambiance_rating?: number | null
          comment?: string | null
          created_at?: string
          deleted_at?: string
          food_rating?: number | null
          helpful_count?: number
          id?: string
          images?: string | null
          is_verified?: boolean
          is_visible?: boolean
          order_id?: string | null
          owner_responded_at?: string | null
          owner_response?: string | null
          rating?: number
          restaurant_id?: string
          sentiment?: string | null
          sentiment_analysis?: Json | null
          service_rating?: number | null
          updated_at?: string
          user_id?: string
          value_rating?: number | null
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          is_system: boolean
          key: string
          label: string
          privilege_level: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          is_system?: boolean
          key: string
          label: string
          privilege_level?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          is_system?: boolean
          key?: string
          label?: string
          privilege_level?: number
          updated_at?: string
        }
        Relationships: []
      }
      security_incidents: {
        Row: {
          affected_data_types: string
          affected_users_count: number
          anpd_notified: boolean
          anpd_notified_at: string | null
          assigned_to: string | null
          contained_at: string | null
          created_at: string
          description: string
          detected_at: string
          id: string
          incident_type: string
          remediation_steps: string | null
          reported_by: string
          resolved_at: string | null
          response_deadline: string
          root_cause: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          users_notified: boolean
          users_notified_at: string | null
        }
        Insert: {
          affected_data_types: string
          affected_users_count: number
          anpd_notified: boolean
          anpd_notified_at?: string | null
          assigned_to?: string | null
          contained_at?: string | null
          created_at: string
          description: string
          detected_at: string
          id?: string
          incident_type: string
          remediation_steps?: string | null
          reported_by: string
          resolved_at?: string | null
          response_deadline: string
          root_cause?: string | null
          severity: string
          status: string
          title: string
          updated_at: string
          users_notified: boolean
          users_notified_at?: string | null
        }
        Update: {
          affected_data_types?: string
          affected_users_count?: number
          anpd_notified?: boolean
          anpd_notified_at?: string | null
          assigned_to?: string | null
          contained_at?: string | null
          created_at?: string
          description?: string
          detected_at?: string
          id?: string
          incident_type?: string
          remediation_steps?: string | null
          reported_by?: string
          resolved_at?: string | null
          response_deadline?: string
          root_cause?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string
          users_notified?: boolean
          users_notified_at?: string | null
        }
        Relationships: []
      }
      service_calls: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          call_type: string
          called_at: string
          created_at: string
          id: string
          message: string | null
          resolved_at: string | null
          resolved_by: string | null
          restaurant_id: string
          status: string
          table_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          call_type: string
          called_at: string
          created_at: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          restaurant_id: string
          status: string
          table_id?: string | null
          updated_at: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          call_type?: string
          called_at?: string
          created_at?: string
          id?: string
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          restaurant_id?: string
          status?: string
          table_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          actual_end_time: string | null
          actual_start_time: string | null
          break_minutes: number | null
          created_at: string
          date: string
          end_time: string
          hourly_rate: number | null
          id: string
          is_overtime: boolean
          notes: string | null
          restaurant_id: string
          role: string | null
          staff_id: string
          start_time: string
          status: string
          total_pay: number | null
          updated_at: string
        }
        Insert: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          break_minutes?: number | null
          created_at: string
          date: string
          end_time: string
          hourly_rate?: number | null
          id?: string
          is_overtime: boolean
          notes?: string | null
          restaurant_id: string
          role?: string | null
          staff_id: string
          start_time: string
          status: string
          total_pay?: number | null
          updated_at: string
        }
        Update: {
          actual_end_time?: string | null
          actual_start_time?: string | null
          break_minutes?: number | null
          created_at?: string
          date?: string
          end_time?: string
          hourly_rate?: number | null
          id?: string
          is_overtime?: boolean
          notes?: string | null
          restaurant_id?: string
          role?: string | null
          staff_id?: string
          start_time?: string
          status?: string
          total_pay?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      simulation_leads: {
        Row: {
          acts_completed: number | null
          completed: boolean
          created_at: string
          cta_clicked: string | null
          id: string
          language: string | null
          model: string
          pain_points: string[] | null
          pillar: string | null
          profile: string
          time_per_act: Json | null
          total_time_seconds: number | null
        }
        Insert: {
          acts_completed?: number | null
          completed?: boolean
          created_at?: string
          cta_clicked?: string | null
          id?: string
          language?: string | null
          model: string
          pain_points?: string[] | null
          pillar?: string | null
          profile: string
          time_per_act?: Json | null
          total_time_seconds?: number | null
        }
        Update: {
          acts_completed?: number | null
          completed?: boolean
          created_at?: string
          cta_clicked?: string | null
          id?: string
          language?: string | null
          model?: string
          pain_points?: string[] | null
          pillar?: string | null
          profile?: string
          time_per_act?: Json | null
          total_time_seconds?: number | null
        }
        Relationships: []
      }
      stamp_cards: {
        Row: {
          completed: boolean
          completed_at: string | null
          completed_cycles: number
          created_at: string
          current_stamps: number
          id: string
          required_stamps: number
          restaurant_id: string
          reward_description: string
          service_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed: boolean
          completed_at?: string | null
          completed_cycles: number
          created_at: string
          current_stamps: number
          id?: string
          required_stamps: number
          restaurant_id: string
          reward_description: string
          service_type: string
          updated_at: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          completed_cycles?: number
          created_at?: string
          current_stamps?: number
          id?: string
          required_stamps?: number
          restaurant_id?: string
          reward_description?: string
          service_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          current_quantity: number
          id: string
          ingredient_id: string
          last_purchase_date: string | null
          last_purchase_price: number | null
          max_quantity: number | null
          min_quantity: number | null
          restaurant_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          current_quantity: number
          id?: string
          ingredient_id: string
          last_purchase_date?: string | null
          last_purchase_price?: number | null
          max_quantity?: number | null
          min_quantity?: number | null
          restaurant_id: string
          unit: string
          updated_at: string
        }
        Update: {
          current_quantity?: number
          id?: string
          ingredient_id?: string
          last_purchase_date?: string | null
          last_purchase_price?: number | null
          max_quantity?: number | null
          min_quantity?: number | null
          restaurant_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ingredient_id: string
          notes: string | null
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id: string | null
          reference_type: string | null
          restaurant_id: string
          stock_item_id: string
          type: string
          unit_cost: number | null
        }
        Insert: {
          created_at: string
          created_by?: string | null
          id?: string
          ingredient_id: string
          notes?: string | null
          quantity: number
          quantity_after: number
          quantity_before: number
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id: string
          stock_item_id: string
          type: string
          unit_cost?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ingredient_id?: string
          notes?: string | null
          quantity?: number
          quantity_after?: number
          quantity_before?: number
          reference_id?: string | null
          reference_type?: string | null
          restaurant_id?: string
          stock_item_id?: string
          type?: string
          unit_cost?: number | null
        }
        Relationships: []
      }
      supplier_item_mappings: {
        Row: {
          conversion_factor: number | null
          created_at: string
          external_item_description: string
          external_ncm: string | null
          id: string
          ingredient_id: string
          restaurant_id: string
          supplier_cnpj: string
        }
        Insert: {
          conversion_factor?: number | null
          created_at: string
          external_item_description: string
          external_ncm?: string | null
          id?: string
          ingredient_id: string
          restaurant_id: string
          supplier_cnpj: string
        }
        Update: {
          conversion_factor?: number | null
          created_at?: string
          external_item_description?: string
          external_ncm?: string | null
          id?: string
          ingredient_id?: string
          restaurant_id?: string
          supplier_cnpj?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          address: string | null
          cnpj: string | null
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at: string
          email?: string | null
          id?: string
          is_active: boolean
          name: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          updated_at: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tab_items: {
        Row: {
          created_at: string
          customizations: Json | null
          discount_amount: number
          discount_reason: string | null
          id: string
          is_round_repeat: boolean
          menu_item_id: string
          ordered_by_user_id: string
          prepared_at: string | null
          prepared_by: string | null
          quantity: number
          special_instructions: string | null
          status: string
          tab_id: string
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at: string
          customizations?: Json | null
          discount_amount: number
          discount_reason?: string | null
          id?: string
          is_round_repeat: boolean
          menu_item_id: string
          ordered_by_user_id: string
          prepared_at?: string | null
          prepared_by?: string | null
          quantity: number
          special_instructions?: string | null
          status: string
          tab_id: string
          total_price: number
          unit_price: number
          updated_at: string
        }
        Update: {
          created_at?: string
          customizations?: Json | null
          discount_amount?: number
          discount_reason?: string | null
          id?: string
          is_round_repeat?: boolean
          menu_item_id?: string
          ordered_by_user_id?: string
          prepared_at?: string | null
          prepared_by?: string | null
          quantity?: number
          special_instructions?: string | null
          status?: string
          tab_id?: string
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      tab_members: {
        Row: {
          amount_consumed: number
          amount_paid: number
          credit_contribution: number
          id: string
          joined_at: string
          left_at: string | null
          role: string
          status: string
          tab_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_consumed: number
          amount_paid: number
          credit_contribution: number
          id?: string
          joined_at: string
          left_at?: string | null
          role: string
          status: string
          tab_id: string
          updated_at: string
          user_id: string
        }
        Update: {
          amount_consumed?: number
          amount_paid?: number
          credit_contribution?: number
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string
          status?: string
          tab_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      tab_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          idempotency_key: string | null
          payment_details: Json | null
          payment_method: string
          status: string
          tab_id: string
          tip_amount: number
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at: string
          id?: string
          idempotency_key?: string | null
          payment_details?: Json | null
          payment_method: string
          status: string
          tab_id: string
          tip_amount: number
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          idempotency_key?: string | null
          payment_details?: Json | null
          payment_method?: string
          status?: string
          tab_id?: string
          tip_amount?: number
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      table_qr_codes: {
        Row: {
          color_primary: string
          color_secondary: string | null
          created_at: string
          expires_at: string | null
          generated_by: string | null
          id: string
          is_active: boolean
          logo_included: boolean
          qr_code_data: string
          qr_code_image: string | null
          restaurant_id: string
          signature: string
          style: string
          table_id: string
          updated_at: string
          version: number
        }
        Insert: {
          color_primary: string
          color_secondary?: string | null
          created_at: string
          expires_at?: string | null
          generated_by?: string | null
          id?: string
          is_active: boolean
          logo_included: boolean
          qr_code_data: string
          qr_code_image?: string | null
          restaurant_id: string
          signature: string
          style: string
          table_id: string
          updated_at: string
          version: number
        }
        Update: {
          color_primary?: string
          color_secondary?: string | null
          created_at?: string
          expires_at?: string | null
          generated_by?: string | null
          id?: string
          is_active?: boolean
          logo_included?: boolean
          qr_code_data?: string
          qr_code_image?: string | null
          restaurant_id?: string
          signature?: string
          style?: string
          table_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      table_sessions: {
        Row: {
          created_at: string
          customer_id: string | null
          ended_at: string | null
          guest_count: number
          guest_name: string | null
          guest_user_ids: Json
          id: string
          last_activity: string
          notes: string | null
          primary_user_id: string | null
          qr_code_id: string | null
          restaurant_id: string
          started_at: string
          status: string
          table_id: string
          total_amount: number | null
          total_orders: number
          total_spent: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          ended_at?: string | null
          guest_count?: number
          guest_name?: string | null
          guest_user_ids?: Json
          id?: string
          last_activity?: string
          notes?: string | null
          primary_user_id?: string | null
          qr_code_id?: string | null
          restaurant_id: string
          started_at?: string
          status?: string
          table_id: string
          total_amount?: number | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          ended_at?: string | null
          guest_count?: number
          guest_name?: string | null
          guest_user_ids?: Json
          id?: string
          last_activity?: string
          notes?: string | null
          primary_user_id?: string | null
          qr_code_id?: string | null
          restaurant_id?: string
          started_at?: string
          status?: string
          table_id?: string
          total_amount?: number | null
          total_orders?: number
          total_spent?: number
          updated_at?: string
        }
        Relationships: []
      }
      tables: {
        Row: {
          assigned_waiter_id: string | null
          created_at: string
          height: number
          id: string
          notes: string | null
          occupied_since: string | null
          position_x: number | null
          position_y: number | null
          qr_code: string | null
          restaurant_id: string
          seats: number
          section: string | null
          shape: string
          status: string
          table_number: string
          updated_at: string
          width: number
        }
        Insert: {
          assigned_waiter_id?: string | null
          created_at?: string
          height?: number
          id?: string
          notes?: string | null
          occupied_since?: string | null
          position_x?: number | null
          position_y?: number | null
          qr_code?: string | null
          restaurant_id: string
          seats: number
          section?: string | null
          shape?: string
          status?: string
          table_number: string
          updated_at?: string
          width?: number
        }
        Update: {
          assigned_waiter_id?: string | null
          created_at?: string
          height?: number
          id?: string
          notes?: string | null
          occupied_since?: string | null
          position_x?: number | null
          position_y?: number | null
          qr_code?: string | null
          restaurant_id?: string
          seats?: number
          section?: string | null
          shape?: string
          status?: string
          table_number?: string
          updated_at?: string
          width?: number
        }
        Relationships: []
      }
      tabs: {
        Row: {
          amount_paid: number
          closed_at: string | null
          cover_charge_credit: number
          created_at: string
          deposit_credit: number
          discount_amount: number
          host_user_id: string
          id: string
          invite_token: string | null
          metadata: Json | null
          preauth_amount: number | null
          preauth_transaction_id: string | null
          restaurant_id: string
          status: string
          subtotal: number
          table_id: string | null
          tip_amount: number
          total_amount: number
          type: string
          updated_at: string
        }
        Insert: {
          amount_paid: number
          closed_at?: string | null
          cover_charge_credit: number
          created_at: string
          deposit_credit: number
          discount_amount: number
          host_user_id: string
          id?: string
          invite_token?: string | null
          metadata?: Json | null
          preauth_amount?: number | null
          preauth_transaction_id?: string | null
          restaurant_id: string
          status: string
          subtotal: number
          table_id?: string | null
          tip_amount: number
          total_amount: number
          type: string
          updated_at: string
        }
        Update: {
          amount_paid?: number
          closed_at?: string | null
          cover_charge_credit?: number
          created_at?: string
          deposit_credit?: number
          discount_amount?: number
          host_user_id?: string
          id?: string
          invite_token?: string | null
          metadata?: Json | null
          preauth_amount?: number | null
          preauth_transaction_id?: string | null
          restaurant_id?: string
          status?: string
          subtotal?: number
          table_id?: string | null
          tip_amount?: number
          total_amount?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tips: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          distributed_at: string | null
          distribution_details: Json | null
          id: string
          message: string | null
          order_id: string | null
          restaurant_id: string
          staff_id: string | null
          status: string
          tip_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at: string
          customer_id: string
          distributed_at?: string | null
          distribution_details?: Json | null
          id?: string
          message?: string | null
          order_id?: string | null
          restaurant_id: string
          staff_id?: string | null
          status: string
          tip_type: string
          updated_at: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          distributed_at?: string | null
          distribution_details?: Json | null
          id?: string
          message?: string | null
          order_id?: string | null
          restaurant_id?: string
          staff_id?: string | null
          status?: string
          tip_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      token_blacklist: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          revoked_ip: string | null
          revoked_reason: string | null
          token_jti: string
          token_type: string
          user_id: string
        }
        Insert: {
          created_at: string
          expires_at: string
          id?: string
          revoked_ip?: string | null
          revoked_reason?: string | null
          token_jti: string
          token_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          revoked_ip?: string | null
          revoked_reason?: string | null
          token_jti?: string
          token_type?: string
          user_id?: string
        }
        Relationships: []
      }
      unit_conversions: {
        Row: {
          created_at: string
          factor: number
          from_unit: string
          id: string
          ingredient_id: string | null
          restaurant_id: string | null
          to_unit: string
        }
        Insert: {
          created_at: string
          factor: number
          from_unit: string
          id?: string
          ingredient_id?: string | null
          restaurant_id?: string | null
          to_unit: string
        }
        Update: {
          created_at?: string
          factor?: number
          from_unit?: string
          id?: string
          ingredient_id?: string | null
          restaurant_id?: string | null
          to_unit?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          accepted_at: string
          consent_type: string
          device_id: string | null
          id: string
          ip_address: string
          metadata: Json | null
          revoked_at: string | null
          user_agent: string | null
          user_id: string
          version: string
          version_hash: string | null
        }
        Insert: {
          accepted_at: string
          consent_type: string
          device_id?: string | null
          id?: string
          ip_address: string
          metadata?: Json | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id: string
          version: string
          version_hash?: string | null
        }
        Update: {
          accepted_at?: string
          consent_type?: string
          device_id?: string | null
          id?: string
          ip_address?: string
          metadata?: Json | null
          revoked_at?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
          version_hash?: string | null
        }
        Relationships: []
      }
      user_credentials: {
        Row: {
          created_at: string
          deleted_at: string
          failed_login_attempts: number
          id: string
          last_login_at: string | null
          last_login_ip: string | null
          locked_until: string | null
          mfa_backup_codes: string | null
          mfa_enabled: boolean
          mfa_secret: string | null
          password_changed_at: string | null
          password_hash: string
          password_history: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at: string
          deleted_at: string
          failed_login_attempts: number
          id?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          locked_until?: string | null
          mfa_backup_codes?: string | null
          mfa_enabled: boolean
          mfa_secret?: string | null
          password_changed_at?: string | null
          password_hash: string
          password_history?: string | null
          updated_at: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string
          failed_login_attempts?: number
          id?: string
          last_login_at?: string | null
          last_login_ip?: string | null
          locked_until?: string | null
          mfa_backup_codes?: string | null
          mfa_enabled?: boolean
          mfa_secret?: string | null
          password_changed_at?: string | null
          password_hash?: string
          password_history?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          restaurant_id: string
          role: Database["public"]["Enums"]["user_roles_role_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          restaurant_id: string
          role: Database["public"]["Enums"]["user_roles_role_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          restaurant_id?: string
          role?: Database["public"]["Enums"]["user_roles_role_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sanctions: {
        Row: {
          active: boolean
          created_at: string
          defense_deadline: string | null
          defense_submitted: boolean
          defense_text: string | null
          evidence: Json
          id: string
          notice_sent_at: string | null
          reason: string
          reviewed_at: string | null
          reviewed_by: string | null
          sanction_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active: boolean
          created_at: string
          defense_deadline?: string | null
          defense_submitted: boolean
          defense_text?: string | null
          evidence: Json
          id?: string
          notice_sent_at?: string | null
          reason: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sanction_type: string
          updated_at: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          defense_deadline?: string | null
          defense_submitted?: boolean
          defense_text?: string | null
          evidence?: Json
          id?: string
          notice_sent_at?: string | null
          reason?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          sanction_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vip_table_guests: {
        Row: {
          checked_in_at: string | null
          credit_contribution: number
          email: string | null
          entry_id: string | null
          id: string
          invite_token: string
          invited_at: string
          name: string | null
          phone: string | null
          reservation_id: string
          responded_at: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          checked_in_at?: string | null
          credit_contribution: number
          email?: string | null
          entry_id?: string | null
          id?: string
          invite_token: string
          invited_at: string
          name?: string | null
          phone?: string | null
          reservation_id: string
          responded_at?: string | null
          status: string
          updated_at: string
          user_id?: string | null
        }
        Update: {
          checked_in_at?: string | null
          credit_contribution?: number
          email?: string | null
          entry_id?: string | null
          id?: string
          invite_token?: string
          invited_at?: string
          name?: string | null
          phone?: string | null
          reservation_id?: string
          responded_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      vip_table_reservations: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          confirmation_deadline: string | null
          confirmed_at: string | null
          created_at: string
          deposit_amount: number
          deposit_credit: number
          deposit_transaction_id: string | null
          event_date: string
          host_user_id: string
          id: string
          invite_token: string | null
          metadata: Json | null
          minimum_spend: number
          party_size: number
          restaurant_id: string
          special_requests: string | null
          status: string
          table_id: string | null
          table_type_id: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_deadline?: string | null
          confirmed_at?: string | null
          created_at: string
          deposit_amount: number
          deposit_credit: number
          deposit_transaction_id?: string | null
          event_date: string
          host_user_id: string
          id?: string
          invite_token?: string | null
          metadata?: Json | null
          minimum_spend: number
          party_size: number
          restaurant_id: string
          special_requests?: string | null
          status: string
          table_id?: string | null
          table_type_id: string
          updated_at: string
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          confirmation_deadline?: string | null
          confirmed_at?: string | null
          created_at?: string
          deposit_amount?: number
          deposit_credit?: number
          deposit_transaction_id?: string | null
          event_date?: string
          host_user_id?: string
          id?: string
          invite_token?: string | null
          metadata?: Json | null
          minimum_spend?: number
          party_size?: number
          restaurant_id?: string
          special_requests?: string | null
          status?: string
          table_id?: string | null
          table_type_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      vip_table_tab_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          ordered_by_user_id: string
          quantity: number
          special_instructions: string | null
          status: string
          table_tab_id: string
          total_price: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at: string
          id?: string
          menu_item_id: string
          ordered_by_user_id: string
          quantity: number
          special_instructions?: string | null
          status: string
          table_tab_id: string
          total_price: number
          unit_price: number
          updated_at: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          ordered_by_user_id?: string
          quantity?: number
          special_instructions?: string | null
          status?: string
          table_tab_id?: string
          total_price?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      vip_table_tabs: {
        Row: {
          amount_paid: number
          closed_at: string | null
          created_at: string
          deposit_credit: number
          entry_credits_total: number
          id: string
          minimum_spend_progress: number
          reservation_id: string
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid: number
          closed_at?: string | null
          created_at: string
          deposit_credit: number
          entry_credits_total: number
          id?: string
          minimum_spend_progress: number
          reservation_id: string
          status: string
          subtotal: number
          total_amount: number
          updated_at: string
        }
        Update: {
          amount_paid?: number
          closed_at?: string | null
          created_at?: string
          deposit_credit?: number
          entry_credits_total?: number
          id?: string
          minimum_spend_progress?: number
          reservation_id?: string
          status?: string
          subtotal?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      waiter_calls: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
          id: string
          notes: string | null
          reason: string
          resolved_at: string | null
          restaurant_id: string
          status: string
          tab_id: string | null
          table_id: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason: string
          resolved_at?: string | null
          restaurant_id: string
          status?: string
          tab_id?: string | null
          table_id?: string | null
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          reason?: string
          resolved_at?: string | null
          restaurant_id?: string
          status?: string
          tab_id?: string | null
          table_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          city: string | null
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          state: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          state?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          state?: string | null
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          called_at: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          customer_phone: string | null
          estimated_wait_minutes: number | null
          has_kids: boolean
          id: string
          kids_ages: Json | null
          kids_allergies: Json | null
          no_show_at: string | null
          notes: string | null
          party_size: number
          position: number
          preference: Database["public"]["Enums"]["waitlist_entries_preference_enum"]
          restaurant_id: string
          seated_at: string | null
          status: Database["public"]["Enums"]["waitlist_entries_status_enum"]
          table_number: string | null
          updated_at: string
          waitlist_bar_orders: Json
        }
        Insert: {
          called_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name: string
          customer_phone?: string | null
          estimated_wait_minutes?: number | null
          has_kids?: boolean
          id?: string
          kids_ages?: Json | null
          kids_allergies?: Json | null
          no_show_at?: string | null
          notes?: string | null
          party_size: number
          position: number
          preference?: Database["public"]["Enums"]["waitlist_entries_preference_enum"]
          restaurant_id: string
          seated_at?: string | null
          status?: Database["public"]["Enums"]["waitlist_entries_status_enum"]
          table_number?: string | null
          updated_at?: string
          waitlist_bar_orders?: Json
        }
        Update: {
          called_at?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          customer_phone?: string | null
          estimated_wait_minutes?: number | null
          has_kids?: boolean
          id?: string
          kids_ages?: Json | null
          kids_allergies?: Json | null
          no_show_at?: string | null
          notes?: string | null
          party_size?: number
          position?: number
          preference?: Database["public"]["Enums"]["waitlist_entries_preference_enum"]
          restaurant_id?: string
          seated_at?: string | null
          status?: Database["public"]["Enums"]["waitlist_entries_status_enum"]
          table_number?: string | null
          updated_at?: string
          waitlist_bar_orders?: Json
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          external_transaction_id: string | null
          id: string
          idempotency_key: string | null
          metadata: Json | null
          order_id: string | null
          payment_method_id: string | null
          transaction_type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description?: string | null
          external_transaction_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          order_id?: string | null
          payment_method_id?: string | null
          transaction_type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          external_transaction_id?: string | null
          id?: string
          idempotency_key?: string | null
          metadata?: Json | null
          order_id?: string | null
          payment_method_id?: string | null
          transaction_type?: string
          wallet_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          daily_limit: number
          id: string
          is_active: boolean
          max_balance: number
          metadata: Json | null
          monthly_limit: number
          restaurant_id: string | null
          updated_at: string
          user_id: string | null
          wallet_type: string
        }
        Insert: {
          balance: number
          created_at: string
          daily_limit: number
          id?: string
          is_active: boolean
          max_balance: number
          metadata?: Json | null
          monthly_limit: number
          restaurant_id?: string | null
          updated_at: string
          user_id?: string | null
          wallet_type: string
        }
        Update: {
          balance?: number
          created_at?: string
          daily_limit?: number
          id?: string
          is_active?: boolean
          max_balance?: number
          metadata?: Json | null
          monthly_limit?: number
          restaurant_id?: string | null
          updated_at?: string
          user_id?: string | null
          wallet_type?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_type: string
          id: string
          max_retries: number
          next_retry_at: string | null
          payload: Json
          response_body: string | null
          response_code: number | null
          retry_count: number
          status: string
          subscription_id: string
        }
        Insert: {
          created_at: string
          delivered_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          max_retries: number
          next_retry_at?: string | null
          payload: Json
          response_body?: string | null
          response_code?: number | null
          retry_count: number
          status: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          payload?: Json
          response_body?: string | null
          response_code?: number | null
          retry_count?: number
          status?: string
          subscription_id?: string
        }
        Relationships: []
      }
      webhook_subscriptions: {
        Row: {
          created_at: string
          description: string | null
          events: string
          failure_count: number
          headers: Json | null
          id: string
          is_active: boolean
          last_failure_at: string | null
          last_success_at: string | null
          last_triggered_at: string | null
          restaurant_id: string
          secret: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at: string
          description?: string | null
          events: string
          failure_count: number
          headers?: Json | null
          id?: string
          is_active: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          restaurant_id: string
          secret?: string | null
          updated_at: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          events?: string
          failure_count?: number
          headers?: Json | null
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          last_triggered_at?: string | null
          restaurant_id?: string
          secret?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_my_restaurant: {
        Args: {
          p_address?: string
          p_city?: string
          p_email: string
          p_name: string
          p_phone: string
          p_service_type?: string
          p_state?: string
          p_zip_code?: string
        }
        Returns: Json
      }
      create_restaurant_special_request: {
        Args: {
          p_action_label?: string
          p_customer_id?: string
          p_description: string
          p_due_at?: string
          p_metadata?: Json
          p_priority?: number
          p_request_type: string
          p_reservation_id?: string
          p_restaurant_id: string
          p_table_id?: string
          p_table_session_id?: string
          p_title: string
        }
        Returns: Json
      }
      create_service_call: {
        Args: {
          p_call_type?: string
          p_message?: string
          p_restaurant_id: string
          p_table_id?: string
        }
        Returns: Json
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      export_user_data: { Args: never; Returns: Json }
      get_my_loyalty: { Args: { p_restaurant_id: string }; Returns: Json }
      get_my_notifications: {
        Args: { p_limit?: number; p_unread_only?: boolean }
        Returns: Json
      }
      get_my_restaurant_special_requests: {
        Args: { p_restaurant_id?: string }
        Returns: Json
      }
      get_my_restaurants: { Args: never; Returns: Json }
      get_notification_unread_count: { Args: never; Returns: number }
      mark_all_notifications_read: { Args: never; Returns: Json }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: Json
      }
      place_order: {
        Args: {
          p_customer_id?: string
          p_delivery_address?: Json
          p_items: Json
          p_order_type: string
          p_restaurant_id: string
          p_special_instructions?: string
          p_table_id?: string
        }
        Returns: Json
      }
      request_account_deletion: { Args: never; Returns: Json }
      restaurant_acknowledge_service_call: {
        Args: { p_call_id: string }
        Returns: Json
      }
      restaurant_add_cash_movement: {
        Args: {
          p_amount: number
          p_description?: string
          p_is_cash?: boolean
          p_order_id?: string
          p_session_id: string
          p_type: string
        }
        Returns: Json
      }
      restaurant_calculate_split: {
        Args: {
          p_order_id: string
          p_parts?: number
          p_percentages?: number[]
          p_split_mode: string
        }
        Returns: Json
      }
      restaurant_close_cash_register: {
        Args: {
          p_actual_balance: number
          p_closing_notes?: string
          p_session_id: string
        }
        Returns: Json
      }
      restaurant_close_promotion: {
        Args: { p_promotion_id: string }
        Returns: Json
      }
      restaurant_close_table_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      restaurant_collect_customer_feedback: {
        Args: {
          p_note?: string
          p_rating?: number
          p_sentiment: string
          p_service_stage?: string
          p_table_session_id: string
        }
        Returns: Json
      }
      restaurant_create_bill: {
        Args: {
          p_amount: number
          p_category?: string
          p_due_date: string
          p_restaurant_id: string
          p_supplier_name: string
        }
        Returns: Json
      }
      restaurant_create_cook_station: {
        Args: { p_payload: Json; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_create_menu_category: {
        Args: {
          p_description?: string
          p_image_url?: string
          p_name: string
          p_restaurant_id: string
          p_sort_order?: number
        }
        Returns: Json
      }
      restaurant_create_menu_item: {
        Args: {
          p_allergens?: string[]
          p_calories?: number
          p_category_id: string
          p_course?: string
          p_description?: string
          p_dietary_info?: string[]
          p_image_url?: string
          p_is_available?: boolean
          p_is_featured?: boolean
          p_metadata?: Json
          p_name: string
          p_original_price?: number
          p_preparation_time?: number
          p_price?: number
          p_restaurant_id: string
          p_sort_order?: number
          p_station_id?: string
        }
        Returns: Json
      }
      restaurant_create_shift: {
        Args: {
          p_date: string
          p_end_time: string
          p_notes?: string
          p_restaurant_id: string
          p_role?: string
          p_staff_id: string
          p_start_time: string
        }
        Returns: Json
      }
      restaurant_create_stock_item: {
        Args: {
          p_category: string
          p_current_level?: number
          p_max_level?: number
          p_min_level?: number
          p_name: string
          p_notes?: string
          p_restaurant_id: string
          p_supplier?: string
          p_unit: string
          p_unit_cost?: number
        }
        Returns: Json
      }
      restaurant_deactivate_staff: {
        Args: { p_role_id: string }
        Returns: Json
      }
      restaurant_delete_bill: { Args: { p_bill_id: string }; Returns: Json }
      restaurant_delete_cook_station: {
        Args: { p_station_id: string }
        Returns: Json
      }
      restaurant_delete_menu_category: {
        Args: { p_category_id: string }
        Returns: Json
      }
      restaurant_delete_menu_item: {
        Args: { p_item_id: string }
        Returns: Json
      }
      restaurant_delete_shift: { Args: { p_shift_id: string }; Returns: Json }
      restaurant_find_user_by_email: {
        Args: { p_email: string; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_fire_course: {
        Args: { p_course: string; p_order_id: string }
        Returns: Json
      }
      restaurant_generate_table_qr: {
        Args: { p_table_id: string }
        Returns: Json
      }
      restaurant_get_active_shift_count: {
        Args: { p_restaurant_id: string }
        Returns: number
      }
      restaurant_get_approvals: {
        Args: { p_restaurant_id: string; p_status?: string }
        Returns: Json
      }
      restaurant_get_bar_queue: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_bills: {
        Args: { p_limit?: number; p_restaurant_id: string; p_status?: string }
        Returns: Json
      }
      restaurant_get_call_stats: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_cash_register: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_cash_register_history: {
        Args: { p_limit?: number; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_cook_stations: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_customer_assistance_hub: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_customer_crm: {
        Args: { p_restaurant_id: string; p_segment?: string }
        Returns: Json
      }
      restaurant_get_customers: {
        Args: { p_limit?: number; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_dashboard_snapshot: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_financial_dashboard: {
        Args: { p_from?: string; p_restaurant_id: string; p_to?: string }
        Returns: Json
      }
      restaurant_get_financial_summary: {
        Args: { p_from?: string; p_restaurant_id: string; p_to?: string }
        Returns: Json
      }
      restaurant_get_gateway_config: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_integrations: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_kds_config: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_kds_queue: {
        Args: { p_restaurant_id: string; p_station_id?: string }
        Returns: Json
      }
      restaurant_get_low_stock_alerts: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_loyalty_config: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_loyalty_stats: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_menu: {
        Args: { p_include_unavailable?: boolean; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_my_tables: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_orders: {
        Args: {
          p_date?: string
          p_limit?: number
          p_restaurant_id: string
          p_statuses?: string[]
          p_table_id?: string
        }
        Returns: Json
      }
      restaurant_get_profile: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_promotions: {
        Args: { p_restaurant_id: string; p_status?: string }
        Returns: Json
      }
      restaurant_get_reports: {
        Args: { p_from?: string; p_restaurant_id: string; p_to?: string }
        Returns: Json
      }
      restaurant_get_reservations: {
        Args: {
          p_date?: string
          p_limit?: number
          p_restaurant_id: string
          p_status?: string[]
        }
        Returns: Json
      }
      restaurant_get_reviews: {
        Args: { p_limit?: number; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_satisfaction_recurrence: {
        Args: { p_from?: string; p_restaurant_id: string; p_to?: string }
        Returns: Json
      }
      restaurant_get_service_calls: {
        Args: { p_limit?: number; p_restaurant_id: string; p_status?: string[] }
        Returns: Json
      }
      restaurant_get_service_configs: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_shifts: {
        Args: { p_from?: string; p_restaurant_id: string; p_to?: string }
        Returns: Json
      }
      restaurant_get_staff: { Args: { p_restaurant_id: string }; Returns: Json }
      restaurant_get_stock: {
        Args: { p_include_inactive?: boolean; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_table_bills: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_table_qr_codes: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_tables: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_get_tips_summary: {
        Args: { p_from?: string; p_restaurant_id: string; p_to?: string }
        Returns: Json
      }
      restaurant_get_transactions: {
        Args: {
          p_from?: string
          p_limit?: number
          p_restaurant_id: string
          p_to?: string
        }
        Returns: Json
      }
      restaurant_get_waitlist: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      restaurant_open_cash_register: {
        Args: { p_opening_balance: number; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_open_table_session: {
        Args: {
          p_guest_count?: number
          p_guest_name?: string
          p_table_id: string
        }
        Returns: Json
      }
      restaurant_reactivate_staff: {
        Args: { p_role_id: string }
        Returns: Json
      }
      restaurant_record_payment:
        | {
            Args: {
              p_amount: number
              p_notes?: string
              p_order_id: string
              p_payment_method: string
              p_tip_amount?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_idempotency_key?: string
              p_notes?: string
              p_order_id: string
              p_payment_method: string
              p_tip_amount?: number
            }
            Returns: Json
          }
      restaurant_remove_staff_role: {
        Args: { p_role_id: string }
        Returns: Json
      }
      restaurant_request_approval: {
        Args: {
          p_amount?: number
          p_item_name: string
          p_order_id?: string
          p_reason: string
          p_restaurant_id: string
          p_table_id?: string
          p_type: string
        }
        Returns: Json
      }
      restaurant_resolve_approval: {
        Args: {
          p_approval_id: string
          p_resolution_note?: string
          p_status: string
        }
        Returns: Json
      }
      restaurant_resolve_service_call: {
        Args: { p_call_id: string }
        Returns: Json
      }
      restaurant_respond_review: {
        Args: { p_response: string; p_review_id: string }
        Returns: Json
      }
      restaurant_set_integration_connection: {
        Args: {
          p_external_store_id?: string
          p_is_connected: boolean
          p_provider: string
          p_restaurant_id: string
        }
        Returns: Json
      }
      restaurant_toggle_menu_item: {
        Args: { p_is_available: boolean; p_item_id: string }
        Returns: Json
      }
      restaurant_update_bill_status: {
        Args: { p_bill_id: string; p_status: string }
        Returns: Json
      }
      restaurant_update_cook_station: {
        Args: { p_payload: Json; p_station_id: string }
        Returns: Json
      }
      restaurant_update_kds_config: {
        Args: { p_config: Json; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_update_menu_category: {
        Args: {
          p_category_id: string
          p_description?: string
          p_image_url?: string
          p_is_active?: boolean
          p_name?: string
          p_sort_order?: number
        }
        Returns: Json
      }
      restaurant_update_menu_item: {
        Args: {
          p_allergens?: string[]
          p_calories?: number
          p_category_id?: string
          p_course?: string
          p_description?: string
          p_dietary_info?: string[]
          p_image_url?: string
          p_is_available?: boolean
          p_is_featured?: boolean
          p_item_id: string
          p_metadata?: Json
          p_name?: string
          p_original_price?: number
          p_preparation_time?: number
          p_price?: number
          p_sort_order?: number
          p_station_id?: string
        }
        Returns: Json
      }
      restaurant_update_order_item_status: {
        Args: { p_item_id: string; p_status: string }
        Returns: Json
      }
      restaurant_update_order_status: {
        Args: {
          p_estimated_time?: number
          p_order_id: string
          p_status: string
        }
        Returns: Json
      }
      restaurant_update_profile: {
        Args: { p_patch: Json; p_restaurant_id: string }
        Returns: Json
      }
      restaurant_update_reservation_status: {
        Args: {
          p_notes?: string
          p_reservation_id: string
          p_status: string
          p_table_id?: string
        }
        Returns: Json
      }
      restaurant_update_shift: {
        Args: {
          p_date?: string
          p_end_time?: string
          p_notes?: string
          p_role?: string
          p_shift_id: string
          p_start_time?: string
          p_status?: string
        }
        Returns: Json
      }
      restaurant_update_special_request_status: {
        Args: {
          p_assigned_to?: string
          p_handled_note?: string
          p_request_id: string
          p_status: string
        }
        Returns: Json
      }
      restaurant_update_staff_role: {
        Args: { p_role: string; p_role_id: string }
        Returns: Json
      }
      restaurant_update_stock_level: {
        Args: { p_item_id: string; p_notes?: string; p_quantity_delta: number }
        Returns: Json
      }
      restaurant_update_table_status: {
        Args: { p_notes?: string; p_status?: string; p_table_id: string }
        Returns: Json
      }
      restaurant_upsert_promotion: {
        Args: {
          p_code: string
          p_description?: string
          p_discount_value: number
          p_promotion_id: string
          p_restaurant_id: string
          p_title: string
          p_type: string
          p_valid_from: string
          p_valid_until: string
        }
        Returns: Json
      }
      restaurant_upsert_staff_role: {
        Args: { p_restaurant_id: string; p_role: string; p_user_id: string }
        Returns: Json
      }
    }
    Enums: {
      notifications_notification_type_enum:
        | "order_placed"
        | "order_confirmed"
        | "order_ready"
        | "order_delivered"
        | "order_cancelled"
        | "reservation_confirmed"
        | "reservation_reminder"
        | "reservation_cancelled"
        | "payment_received"
        | "payment_failed"
        | "promotion"
        | "system"
      notifications_related_type_enum:
        | "order"
        | "reservation"
        | "payment"
        | "loyalty"
        | "review"
        | "restaurant"
        | "promotion"
      order_items_status_enum:
        | "pending"
        | "preparing"
        | "ready"
        | "delivered"
        | "cancelled"
      orders_order_type_enum:
        | "dine_in"
        | "pickup"
        | "delivery"
        | "tab"
        | "table_tab"
      orders_status_enum:
        | "pending"
        | "confirmed"
        | "preparing"
        | "ready"
        | "delivered"
        | "completed"
        | "cancelled"
        | "delivering"
        | "open_for_additions"
      reservations_status_enum:
        | "pending"
        | "confirmed"
        | "seated"
        | "completed"
        | "cancelled"
        | "no_show"
      user_roles_role_enum:
        | "customer"
        | "owner"
        | "manager"
        | "chef"
        | "waiter"
        | "barman"
        | "maitre"
        | "cook"
      waitlist_entries_preference_enum: "salao" | "terraco" | "qualquer"
      waitlist_entries_status_enum:
        | "waiting"
        | "called"
        | "seated"
        | "no_show"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      notifications_notification_type_enum: [
        "order_placed",
        "order_confirmed",
        "order_ready",
        "order_delivered",
        "order_cancelled",
        "reservation_confirmed",
        "reservation_reminder",
        "reservation_cancelled",
        "payment_received",
        "payment_failed",
        "promotion",
        "system",
      ],
      notifications_related_type_enum: [
        "order",
        "reservation",
        "payment",
        "loyalty",
        "review",
        "restaurant",
        "promotion",
      ],
      order_items_status_enum: [
        "pending",
        "preparing",
        "ready",
        "delivered",
        "cancelled",
      ],
      orders_order_type_enum: [
        "dine_in",
        "pickup",
        "delivery",
        "tab",
        "table_tab",
      ],
      orders_status_enum: [
        "pending",
        "confirmed",
        "preparing",
        "ready",
        "delivered",
        "completed",
        "cancelled",
        "delivering",
        "open_for_additions",
      ],
      reservations_status_enum: [
        "pending",
        "confirmed",
        "seated",
        "completed",
        "cancelled",
        "no_show",
      ],
      user_roles_role_enum: [
        "customer",
        "owner",
        "manager",
        "chef",
        "waiter",
        "barman",
        "maitre",
        "cook",
      ],
      waitlist_entries_preference_enum: ["salao", "terraco", "qualquer"],
      waitlist_entries_status_enum: [
        "waiting",
        "called",
        "seated",
        "no_show",
        "cancelled",
      ],
    },
  },
} as const
