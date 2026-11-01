export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      client_submissions: {
        Row: {
          client_id: string
          created_at: string
          id: string
          payload_hash: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id: string
          payload_hash: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          payload_hash?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_submissions_client_fk"
            columns: ["tenant_id", "client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "client_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          created_at: string
          default_price: number | null
          id: string
          name: string
          phone: string | null
          tenant_id: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          default_price?: number | null
          id?: string
          name: string
          phone?: string | null
          tenant_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          default_price?: number | null
          id?: string
          name?: string
          phone?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_counters: {
        Row: {
          next_number: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          next_number?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          next_number?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_lines: {
        Row: {
          created_at: string
          dropped_eggs: number
          eggs: number
          line_total: number
          order_id: string
          price_per_tray: number
          size_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dropped_eggs?: number
          eggs: number
          line_total: number
          order_id: string
          price_per_tray: number
          size_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dropped_eggs?: number
          eggs?: number
          line_total?: number
          order_id?: string
          price_per_tray?: number
          size_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_lines_order_fk"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_lines_size_fk"
            columns: ["tenant_id", "size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_submissions: {
        Row: {
          created_at: string
          id: string
          order_id: string
          payload_hash: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          order_id: string
          payload_hash: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          payload_hash?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_submissions_order_fk"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "order_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          client_id: string
          closed_short_at: string | null
          converted_from_sale_number: number | null
          created_at: string
          id: string
          order_date: string
          order_number: number
          status: string
          tenant_id: string
          updated_at: string
          version: number
          wanted_by: string | null
        }
        Insert: {
          cancelled_at?: string | null
          client_id: string
          closed_short_at?: string | null
          converted_from_sale_number?: number | null
          created_at?: string
          id?: string
          order_date: string
          order_number: number
          status?: string
          tenant_id: string
          updated_at?: string
          version?: number
          wanted_by?: string | null
        }
        Update: {
          cancelled_at?: string | null
          client_id?: string
          closed_short_at?: string | null
          converted_from_sale_number?: number | null
          created_at?: string
          id?: string
          order_date?: string
          order_number?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          version?: number
          wanted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_client_fk"
            columns: ["tenant_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production: {
        Row: {
          created_at: string
          eggs: number
          id: string
          produced_on: string
          quality: string
          size_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eggs: number
          id?: string
          produced_on: string
          quality: string
          size_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eggs?: number
          id?: string
          produced_on?: string
          quality?: string
          size_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_size_fk"
            columns: ["tenant_id", "size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "production_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_submissions: {
        Row: {
          created_at: string
          had_before: boolean
          id: string
          produced_on: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          had_before: boolean
          id: string
          produced_on: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          had_before?: boolean
          id?: string
          produced_on?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_counters: {
        Row: {
          next_number: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          next_number?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          next_number?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_counters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_lines: {
        Row: {
          created_at: string
          eggs: number
          line_total: number
          price_per_tray: number
          sale_id: string
          size_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          eggs: number
          line_total: number
          price_per_tray: number
          sale_id: string
          size_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          eggs?: number
          line_total?: number
          price_per_tray?: number
          sale_id?: string
          size_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_lines_sale_fk"
            columns: ["tenant_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sale_lines_size_fk"
            columns: ["tenant_id", "size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sale_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_submissions: {
        Row: {
          created_at: string
          id: string
          payload_hash: string
          sale_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          payload_hash: string
          sale_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          payload_hash?: string
          sale_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sale_submissions_sale_fk"
            columns: ["tenant_id", "sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sale_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          client_id: string | null
          created_at: string
          delivered_date: string | null
          id: string
          order_id: string | null
          sale_date: string
          sale_number: number
          tenant_id: string
          type: string
          updated_at: string
          version: number
          voided_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          delivered_date?: string | null
          id?: string
          order_id?: string | null
          sale_date: string
          sale_number: number
          tenant_id: string
          type: string
          updated_at?: string
          version?: number
          voided_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          delivered_date?: string | null
          id?: string
          order_id?: string | null
          sale_date?: string
          sale_number?: number
          tenant_id?: string
          type?: string
          updated_at?: string
          version?: number
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_client_fk"
            columns: ["tenant_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sales_order_fk"
            columns: ["tenant_id", "order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      size_submissions: {
        Row: {
          created_at: string
          id: string
          name: string
          size_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name: string
          size_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          size_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "size_submissions_size_fk"
            columns: ["tenant_id", "size_id"]
            isOneToOne: true
            referencedRelation: "sizes"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "size_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sizes: {
        Row: {
          archived_at: string | null
          color_slot: number
          created_at: string
          default_price: number | null
          id: string
          name: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          color_slot: number
          created_at?: string
          default_price?: number | null
          id?: string
          name: string
          sort_order: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          color_slot?: number
          created_at?: string
          default_price?: number | null
          id?: string
          name?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sizes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          currency: string
          eggs_per_tray: number
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          eggs_per_tray?: number
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          eggs_per_tray?: number
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_client: {
        Args: {
          p_default_price?: number
          p_name: string
          p_phone?: string
          p_submission_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      add_size: {
        Args: { p_name: string; p_submission_id: string; p_tenant_id: string; p_default_price?: number | null }
        Returns: Json
      }
      admin_revoke_sessions: { Args: { p_user_id: string }; Returns: number }
      admin_user_id_by_email: { Args: { p_email: string }; Returns: string }
      archive_client: {
        Args: { p_client_id: string; p_tenant_id: string }
        Returns: Json
      }
      archive_size: {
        Args: { p_size_id: string; p_tenant_id: string }
        Returns: Json
      }
      cancel_order: {
        Args: { p_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      close_order: {
        Args: { p_order_id: string; p_tenant_id: string; p_version: number }
        Returns: Json
      }
      create_order: {
        Args: {
          p_client_id: string
          p_eggs: number[]
          p_order_date: string
          p_prices: number[]
          p_size_ids: string[]
          p_submission_id: string
          p_tenant_id: string
          p_wanted_by?: string
        }
        Returns: Json
      }
      create_sale: {
        Args: {
          p_client_id?: string
          p_confirm_shortfall?: boolean
          p_eggs: number[]
          p_prices: number[]
          p_sale_date: string
          p_size_ids: string[]
          p_submission_id: string
          p_tenant_id: string
          p_type: string
        }
        Returns: Json
      }
      delete_production_day: {
        Args: { p_day: string; p_tenant_id: string }
        Returns: Json
      }
      deliver_order: {
        Args: {
          p_confirm_shortfall?: boolean
          p_delivered_date: string
          p_eggs: number[]
          p_order_id: string
          p_size_ids: string[]
          p_submission_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      get_inventory: { Args: { p_tenant_id: string }; Returns: Json }
      get_on_hand: {
        Args: { p_size_ids?: string[]; p_tenant_id: string }
        Returns: Json
      }
      get_order: {
        Args: { p_order_id: string; p_tenant_id: string }
        Returns: Json
      }
      get_sale: {
        Args: { p_sale_id: string; p_tenant_id: string }
        Returns: Json
      }
      list_orders: {
        Args: {
          p_client_id?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_tenant_id: string
          p_to?: string
          p_view?: string
        }
        Returns: Json
      }
      list_sales: {
        Args: {
          p_client_id?: string
          p_from?: string
          p_include_voided?: boolean
          p_limit?: number
          p_offset?: number
          p_tenant_id: string
          p_to?: string
          p_type?: string
        }
        Returns: Json
      }
      log_production: {
        Args: {
          p_day: string
          p_eggs: number[]
          p_rejects: number
          p_size_ids: string[]
          p_submission_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      production_days: {
        Args: { p_from?: string; p_tenant_id: string; p_to?: string }
        Returns: Json
      }
      provision_farm: {
        Args: {
          p_eggs_per_tray?: number
          p_farm_name: string
          p_update?: boolean
          p_user_id: string
        }
        Returns: {
          eggs_per_tray: number
          farm_name: string
          outcome: string
          tenant_id: string
        }[]
      }
      rename_size: {
        Args: { p_name: string; p_size_id: string; p_tenant_id: string; p_default_price?: number | null }
        Returns: Json
      }
      reorder_sizes: {
        Args: { p_size_ids: string[]; p_tenant_id: string }
        Returns: Json
      }
      replace_production_day: {
        Args: {
          p_day: string
          p_eggs: number[]
          p_rejects: number
          p_size_ids: string[]
          p_tenant_id: string
        }
        Returns: Json
      }
      restore_client: {
        Args: { p_client_id: string; p_tenant_id: string }
        Returns: Json
      }
      restore_size: {
        Args: { p_size_id: string; p_tenant_id: string }
        Returns: Json
      }
      set_order_status: {
        Args: { p_order_id: string; p_status: string; p_tenant_id: string }
        Returns: Json
      }
      update_client: {
        Args: {
          p_client_id: string
          p_default_price?: number
          p_name: string
          p_phone?: string
          p_tenant_id: string
          p_version: number
        }
        Returns: Json
      }
      update_order: {
        Args: {
          p_client_id: string
          p_eggs: number[]
          p_order_date: string
          p_order_id: string
          p_prices: number[]
          p_size_ids: string[]
          p_tenant_id: string
          p_version: number
          p_wanted_by?: string
        }
        Returns: Json
      }
      update_sale: {
        Args: {
          p_client_id?: string
          p_confirm_shortfall?: boolean
          p_eggs: number[]
          p_prices: number[]
          p_sale_date: string
          p_sale_id: string
          p_size_ids: string[]
          p_tenant_id: string
          p_type: string
          p_version: number
        }
        Returns: Json
      }
      void_sale: {
        Args: { p_sale_id: string; p_tenant_id: string; p_version: number }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Database

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

