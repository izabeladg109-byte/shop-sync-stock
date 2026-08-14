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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          browser: string | null
          created_at: string
          device: string | null
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          new_values: Json | null
          old_values: Json | null
          user_id: string
        }
        Insert: {
          action: string
          browser?: string | null
          created_at?: string
          device?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string
        }
        Update: {
          action?: string
          browser?: string | null
          created_at?: string
          device?: string | null
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          new_values?: Json | null
          old_values?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      barcodes: {
        Row: {
          code: string
          created_at: string
          deleted_at: string | null
          id: string
          kit_id: string | null
          sku_id: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kit_id?: string | null
          sku_id?: string | null
          user_id?: string
        }
        Update: {
          code?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          kit_id?: string | null
          sku_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "barcodes_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "barcodes_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits_available"
            referencedColumns: ["kit_id"]
          },
          {
            foreignKeyName: "barcodes_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          position: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          position?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      colors: {
        Row: {
          created_at: string
          deleted_at: string | null
          hex: string
          id: string
          name: string
          position: number
          sku_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          hex?: string
          id?: string
          name: string
          position?: number
          sku_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          hex?: string
          id?: string
          name?: string
          position?: number
          sku_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "colors_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_colors: {
        Row: {
          color_id: string
          id: string
          kit_id: string
          position: number
          user_id: string
        }
        Insert: {
          color_id: string
          id?: string
          kit_id: string
          position?: number
          user_id?: string
        }
        Update: {
          color_id?: string
          id?: string
          kit_id?: string
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_colors_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_colors_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_colors_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits_available"
            referencedColumns: ["kit_id"]
          },
        ]
      }
      kit_stock: {
        Row: {
          formed_qty: number
          id: string
          kit_id: string
          size_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          formed_qty?: number
          id?: string
          kit_id: string
          size_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          formed_qty?: number
          id?: string
          kit_id?: string
          size_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_stock_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kit_stock_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits_available"
            referencedColumns: ["kit_id"]
          },
          {
            foreignKeyName: "kit_stock_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "kits_available"
            referencedColumns: ["size_id"]
          },
          {
            foreignKeyName: "kit_stock_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          },
        ]
      }
      kits: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          position: number
          sku_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          position?: number
          sku_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          position?: number
          sku_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kits_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          affect_formed: boolean
          affect_units: boolean
          color_id: string | null
          created_at: string
          direction: Database["public"]["Enums"]["mov_direction"]
          id: string
          kind: Database["public"]["Enums"]["mov_kind"]
          kit_id: string | null
          lines: Json
          note: string | null
          order_ref: string | null
          platform_id: string | null
          qty: number
          size_id: string | null
          sku_id: string | null
          source: string
          stock_after: number | null
          stock_before: number | null
          undone_at: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          affect_formed?: boolean
          affect_units?: boolean
          color_id?: string | null
          created_at?: string
          direction: Database["public"]["Enums"]["mov_direction"]
          id?: string
          kind: Database["public"]["Enums"]["mov_kind"]
          kit_id?: string | null
          lines?: Json
          note?: string | null
          order_ref?: string | null
          platform_id?: string | null
          qty: number
          size_id?: string | null
          sku_id?: string | null
          source?: string
          stock_after?: number | null
          stock_before?: number | null
          undone_at?: string | null
          user_id?: string
          user_name?: string | null
        }
        Update: {
          affect_formed?: boolean
          affect_units?: boolean
          color_id?: string | null
          created_at?: string
          direction?: Database["public"]["Enums"]["mov_direction"]
          id?: string
          kind?: Database["public"]["Enums"]["mov_kind"]
          kit_id?: string | null
          lines?: Json
          note?: string | null
          order_ref?: string | null
          platform_id?: string | null
          qty?: number
          size_id?: string | null
          sku_id?: string | null
          source?: string
          stock_after?: number | null
          stock_before?: number | null
          undone_at?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movements_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_reads: {
        Row: {
          barcode: string | null
          created_at: string
          id: string
          movement_id: string | null
          order_ref: string | null
          parsed: Json | null
          raw_text: string | null
          user_id: string
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          id?: string
          movement_id?: string | null
          order_ref?: string | null
          parsed?: Json | null
          raw_text?: string | null
          user_id?: string
        }
        Update: {
          barcode?: string | null
          created_at?: string
          id?: string
          movement_id?: string | null
          order_ref?: string | null
          parsed?: Json | null
          raw_text?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_reads_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
        ]
      }
      platforms: {
        Row: {
          active: boolean
          color: string
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          position: number
          slug: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          position?: number
          slug: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          position?: number
          slug?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      sizes: {
        Row: {
          created_at: string
          deleted_at: string | null
          grid_qty: number
          id: string
          name: string
          position: number
          sku_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          grid_qty?: number
          id?: string
          name: string
          position?: number
          sku_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          grid_qty?: number
          id?: string
          name?: string
          position?: number
          sku_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sizes_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      skus: {
        Row: {
          category_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          locked: boolean
          min_stock: number
          name: string
          notes: string | null
          position: number
          seller_sku: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          locked?: boolean
          min_stock?: number
          name: string
          notes?: string | null
          position?: number
          seller_sku: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          locked?: boolean
          min_stock?: number
          name?: string
          notes?: string | null
          position?: number
          seller_sku?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "skus_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_allocations: {
        Row: {
          color_id: string
          created_at: string
          id: string
          platform_id: string
          qty: number
          size_id: string
          sku_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_id: string
          created_at?: string
          id?: string
          platform_id: string
          qty?: number
          size_id: string
          sku_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color_id?: string
          created_at?: string
          id?: string
          platform_id?: string
          qty?: number
          size_id?: string
          sku_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_allocations_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "kits_available"
            referencedColumns: ["size_id"]
          },
          {
            foreignKeyName: "stock_allocations_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_allocations_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_edits: {
        Row: {
          color_id: string | null
          created_at: string
          delta: number
          id: string
          kind: string
          note: string | null
          platform_id: string | null
          qty_after: number
          qty_before: number
          size_id: string | null
          sku_id: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          color_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          kind?: string
          note?: string | null
          platform_id?: string | null
          qty_after?: number
          qty_before?: number
          size_id?: string | null
          sku_id?: string | null
          user_id?: string
          user_name?: string | null
        }
        Update: {
          color_id?: string | null
          created_at?: string
          delta?: number
          id?: string
          kind?: string
          note?: string | null
          platform_id?: string | null
          qty_after?: number
          qty_before?: number
          size_id?: string | null
          sku_id?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_edits_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edits_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edits_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "kits_available"
            referencedColumns: ["size_id"]
          },
          {
            foreignKeyName: "stock_edits_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_edits_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_units: {
        Row: {
          color_id: string
          id: string
          locked: boolean
          qty: number
          size_id: string
          sku_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color_id: string
          id?: string
          locked?: boolean
          qty?: number
          size_id: string
          sku_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color_id?: string
          id?: string
          locked?: boolean
          qty?: number
          size_id?: string
          sku_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_units_color_id_fkey"
            columns: ["color_id"]
            isOneToOne: false
            referencedRelation: "colors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_units_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "kits_available"
            referencedColumns: ["size_id"]
          },
          {
            foreignKeyName: "stock_units_size_id_fkey"
            columns: ["size_id"]
            isOneToOne: false
            referencedRelation: "sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_units_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
      user_prefs: {
        Row: {
          created_at: string
          dist_mode: string
          hidden_charts: string[]
          hidden_skus: string[]
          kit_view: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dist_mode?: string
          hidden_charts?: string[]
          hidden_skus?: string[]
          kit_view?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dist_mode?: string
          hidden_charts?: string[]
          hidden_skus?: string[]
          kit_view?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      kits_available: {
        Row: {
          available: number | null
          formed: number | null
          kit_id: string | null
          size_id: string | null
          sku_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kits_sku_id_fkey"
            columns: ["sku_id"]
            isOneToOne: false
            referencedRelation: "skus"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_movement: {
        Args: {
          p_affect_formed: boolean
          p_affect_units: boolean
          p_direction: Database["public"]["Enums"]["mov_direction"]
          p_kind: Database["public"]["Enums"]["mov_kind"]
          p_note?: string
          p_order_ref?: string
          p_platform_id?: string
          p_qty: number
          p_ref_id: string
          p_size_id: string
          p_sku_id: string
          p_source?: string
        }
        Returns: string
      }
      count_period_data: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      db_storage_info: { Args: never; Returns: Json }
      form_kits: {
        Args: {
          p_consume_units?: boolean
          p_kit_id: string
          p_qty: number
          p_size_id: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      purge_filtered_history: {
        Args: {
          p_confirm?: string
          p_direction?: string
          p_from: string
          p_order?: string
          p_sku_id?: string
          p_table: string
          p_to: string
        }
        Returns: Json
      }
      purge_period_data: {
        Args: { p_confirm: string; p_from: string; p_to: string }
        Returns: Json
      }
      set_allocation: {
        Args: {
          p_color_id: string
          p_platform_id: string
          p_qty: number
          p_size_id: string
          p_sku_id: string
        }
        Returns: undefined
      }
      set_sku_lock: {
        Args: { p_locked: boolean; p_sku_id: string }
        Returns: undefined
      }
      set_stock_lock: {
        Args: {
          p_color_id: string
          p_locked: boolean
          p_size_id: string
          p_sku_id: string
        }
        Returns: undefined
      }
      set_unit_stock:
        | {
            Args: {
              p_color_id: string
              p_qty: number
              p_size_id: string
              p_sku_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_color_id: string
              p_note?: string
              p_qty: number
              p_size_id: string
              p_sku_id: string
            }
            Returns: undefined
          }
      undo_movement: { Args: { p_movement_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "gerente" | "operador" | "leitor"
      mov_direction: "in" | "out"
      mov_kind: "unit" | "kit"
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
      app_role: ["admin", "gerente", "operador", "leitor"],
      mov_direction: ["in", "out"],
      mov_kind: ["unit", "kit"],
    },
  },
} as const
