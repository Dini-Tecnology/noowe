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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
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
      profiles: {
        Row: {
          avatar_url: string | null
          biometric_enabled: boolean
          birth_date: string | null
          created_at: string
          default_address: string | null
          deletion_requested_at: string | null
          deletion_scheduled_for: string | null
          deleted_at: string | null
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
          avatar_url?: string | null
          biometric_enabled?: boolean
          birth_date?: string | null
          created_at?: string
          default_address?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          deleted_at?: string | null
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
          avatar_url?: string | null
          biometric_enabled?: boolean
          birth_date?: string | null
          created_at?: string
          default_address?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_for?: string | null
          deleted_at?: string | null
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
      simulation_leads: {
        Row: {
          acts_completed: number | null
          completed: boolean | null
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
          completed?: boolean | null
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
          completed?: boolean | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      user_roles_role_enum: "customer" | "owner" | "manager" | "chef" | "cook" | "waiter" | "barman" | "maitre"
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
    Enums: {},
  },
} as const
