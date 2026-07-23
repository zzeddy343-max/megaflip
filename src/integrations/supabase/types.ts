export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      agents: {
        Row: {
          commission_pct: number;
          created_at: string;
          id: string;
          referral_code: string;
          user_id: string;
        };
        Insert: {
          commission_pct?: number;
          created_at?: string;
          id?: string;
          referral_code: string;
          user_id: string;
        };
        Update: {
          commission_pct?: number;
          created_at?: string;
          id?: string;
          referral_code?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      polymarket_events: {
        Row: {
          category: string;
          created_at: string;
          ends_at: string;
          id: string;
          no_price: number;
          outcome: string | null;
          question: string;
          resolved: boolean;
          volume_usd: number;
          yes_price: number;
        };
        Insert: {
          category?: string;
          created_at?: string;
          ends_at: string;
          id?: string;
          no_price?: number;
          outcome?: string | null;
          question: string;
          resolved?: boolean;
          volume_usd?: number;
          yes_price?: number;
        };
        Update: {
          category?: string;
          created_at?: string;
          ends_at?: string;
          id?: string;
          no_price?: number;
          outcome?: string | null;
          question?: string;
          resolved?: boolean;
          volume_usd?: number;
          yes_price?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          active_account: string;
          balance_ksh: number;
          balance_usd: number;
          created_at: string;
          demo_balance_usd: number;
          email: string | null;
          full_name: string | null;
          id: string;
          phone: string | null;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          active_account?: string;
          balance_ksh?: number;
          balance_usd?: number;
          created_at?: string;
          demo_balance_usd?: number;
          email?: string | null;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          active_account?: string;
          balance_ksh?: number;
          balance_usd?: number;
          created_at?: string;
          demo_balance_usd?: number;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [];
      };
      referrals: {
        Row: {
          agent_id: string | null;
          client_id: string;
          created_at: string;
          id: string;
          referral_code: string | null;
        };
        Insert: {
          agent_id?: string | null;
          client_id: string;
          created_at?: string;
          id?: string;
          referral_code?: string | null;
        };
        Update: {
          agent_id?: string | null;
          client_id?: string;
          created_at?: string;
          id?: string;
          referral_code?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "referrals_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agent_rollups";
            referencedColumns: ["agent_id"];
          },
          {
            foreignKeyName: "referrals_agent_id_fkey";
            columns: ["agent_id"];
            isOneToOne: false;
            referencedRelation: "agents";
            referencedColumns: ["id"];
          },
        ];
      };
      trades: {
        Row: {
          account_type: string;
          closed_at: string | null;
          created_at: string;
          direction: string;
          entry_price: number | null;
          exit_price: number | null;
          id: string;
          market: string;
          meta: Json | null;
          module: string;
          payout: number | null;
          stake: number;
          status: string;
          user_id: string;
        };
        Insert: {
          account_type?: string;
          closed_at?: string | null;
          created_at?: string;
          direction: string;
          entry_price?: number | null;
          exit_price?: number | null;
          id?: string;
          market: string;
          meta?: Json | null;
          module: string;
          payout?: number | null;
          stake: number;
          status?: string;
          user_id: string;
        };
        Update: {
          account_type?: string;
          closed_at?: string | null;
          created_at?: string;
          direction?: string;
          entry_price?: number | null;
          exit_price?: number | null;
          id?: string;
          market?: string;
          meta?: Json | null;
          module?: string;
          payout?: number | null;
          stake?: number;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          account_type: string;
          amount: number;
          created_at: string;
          currency: string;
          id: string;
          is_virtual: boolean;
          kind: string;
          meta: Json | null;
          method: string | null;
          status: string;
          user_id: string;
        };
        Insert: {
          account_type?: string;
          amount: number;
          created_at?: string;
          currency?: string;
          id?: string;
          is_virtual?: boolean;
          kind: string;
          meta?: Json | null;
          method?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          account_type?: string;
          amount?: number;
          created_at?: string;
          currency?: string;
          id?: string;
          is_virtual?: boolean;
          kind?: string;
          meta?: Json | null;
          method?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      agent_rollups: {
        Row: {
          agent_id: string | null;
          agent_user_id: string | null;
          agent_username: string | null;
          client_count: number | null;
          commission_pct: number | null;
          house_retained: number | null;
          referral_code: string | null;
          total_deposits: number | null;
          total_withdrawals: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
    };
    Enums: {
      app_role: "admin" | "agent" | "client";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "agent", "client"],
    },
  },
} as const;
