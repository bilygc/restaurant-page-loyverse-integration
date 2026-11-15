/**
 * ============================================================================
 * DBA NOTICE — READ BEFORE USE
 * ============================================================================
 * This file is a HAND-AUTHORED STAND-IN for `supabase gen types typescript
 * --local`. In this environment the Supabase CLI / local Postgres stack was
 * NOT available, so no CLI command could run. Every type below is derived
 * directly from:
 *   supabase/migrations/20261115120000_poc_loyverse_kitchen_schema.sql
 * but it is NOT CLI-generated. It MUST be replaced as soon as the local stack
 * is up (see supabase/POC_SCHEMA_NOTES.md for the full runbook):
 *   supabase gen types typescript --local > packages/shared/src/db/database.types.ts
 * ============================================================================
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      orders: {
        Row: {
          id: string;
          origin: Database['public']['Enums']['order_origin'];
          kitchen_state: Database['public']['Enums']['kitchen_state'];
          loyverse_receipt_number: string | null;
          sync_status: Database['public']['Enums']['sync_status'];
          total_centavos: number;
          dining_option: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          origin: Database['public']['Enums']['order_origin'];
          kitchen_state?: Database['public']['Enums']['kitchen_state'];
          loyverse_receipt_number?: string | null;
          sync_status?: Database['public']['Enums']['sync_status'];
          total_centavos: number;
          dining_option?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          origin?: Database['public']['Enums']['order_origin'];
          kitchen_state?: Database['public']['Enums']['kitchen_state'];
          loyverse_receipt_number?: string | null;
          sync_status?: Database['public']['Enums']['sync_status'];
          total_centavos?: number;
          dining_option?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          menu_item_id: string | null;
          variant_id: string | null;
          item_name: string;
          quantity: number;
          unit_price_centavos: number;
          line_note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          menu_item_id?: string | null;
          variant_id?: string | null;
          item_name: string;
          quantity?: number;
          unit_price_centavos: number;
          line_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          menu_item_id?: string | null;
          variant_id?: string | null;
          item_name?: string;
          quantity?: number;
          unit_price_centavos?: number;
          line_note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'order_items_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
      loyverse_item_mappings: {
        Row: {
          id: string;
          menu_item_id: string;
          loyverse_variant_id: string;
          reference_variant_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          menu_item_id: string;
          loyverse_variant_id: string;
          reference_variant_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          menu_item_id?: string;
          loyverse_variant_id?: string;
          reference_variant_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      loyverse_webhook_events: {
        Row: {
          id: string;
          receipt_number: string;
          payload: Json;
          processed: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          receipt_number: string;
          payload: Json;
          processed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          receipt_number?: string;
          payload?: Json;
          processed?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      outbox_jobs: {
        Row: {
          id: string;
          order_id: string;
          type: Database['public']['Enums']['outbox_job_type'];
          status: Database['public']['Enums']['outbox_job_status'];
          attempts: number;
          next_retry_at: string;
          last_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          type?: Database['public']['Enums']['outbox_job_type'];
          status?: Database['public']['Enums']['outbox_job_status'];
          attempts?: number;
          next_retry_at?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          type?: Database['public']['Enums']['outbox_job_type'];
          status?: Database['public']['Enums']['outbox_job_status'];
          attempts?: number;
          next_retry_at?: string;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'outbox_jobs_order_id_fkey';
            columns: ['order_id'];
            isOneToOne: false;
            referencedRelation: 'orders';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      set_updated_at: {
        Args: Record<PropertyKey, never>;
        Returns: unknown;
      };
    };
    Enums: {
      order_origin: 'web' | 'pos';
      kitchen_state: 'nuevo' | 'en_preparacion' | 'listo' | 'entregado';
      sync_status: 'pending' | 'synced' | 'failed';
      outbox_job_type: 'create_receipt';
      outbox_job_status: 'pending' | 'processing' | 'done' | 'failed';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database['public'];

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row'];

export type TablesInsert<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Insert'];

export type TablesUpdate<T extends keyof PublicSchema['Tables']> =
  PublicSchema['Tables'][T]['Update'];

export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T];

export const Constants = {
  public: {
    Enums: {
      order_origin: ['web', 'pos'],
      kitchen_state: ['nuevo', 'en_preparacion', 'listo', 'entregado'],
      sync_status: ['pending', 'synced', 'failed'],
      outbox_job_type: ['create_receipt'],
      outbox_job_status: ['pending', 'processing', 'done', 'failed'],
    },
  },
} as const;
