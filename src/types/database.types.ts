export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          code: string;
          name: string;
          chain: string;
          branch: string;
          address: string;
          timing: string;
          is_active: boolean;
          entrance_qr_secret: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          code: string;
          name: string;
          chain?: string;
          branch: string;
          address: string;
          timing?: string;
          is_active?: boolean;
          entrance_qr_secret?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          chain?: string;
          branch?: string;
          address?: string;
          timing?: string;
          is_active?: boolean;
          entrance_qr_secret?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          full_name: string;
          email: string;
          phone: string | null;
          avatar_initials: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          email: string;
          phone?: string | null;
          avatar_initials?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          full_name?: string;
          email?: string;
          phone?: string | null;
          avatar_initials?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      store_staff: {
        Row: {
          id: string;
          user_id: string;
          store_id: string;
          role: "STORE_ADMIN" | "CASHIER" | "SECURITY_GUARD";
          terminal_id: string | null;
          assigned_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          store_id: string;
          role: "STORE_ADMIN" | "CASHIER" | "SECURITY_GUARD";
          terminal_id?: string | null;
          assigned_by?: string | null;
          created_at?: string;
        };
        Update: {
          role?: "STORE_ADMIN" | "CASHIER" | "SECURITY_GUARD";
          terminal_id?: string | null;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: number;
          barcode: string;
          name: string;
          brand: string;
          category: string;
          unit_size: string;
          emoji: string;
          description: string | null;
          image_url: string | null;
          image_source: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          barcode: string;
          name: string;
          brand: string;
          category: string;
          unit_size: string;
          emoji?: string;
          description?: string | null;
          image_url?: string | null;
          image_source?: string | null;
          created_at?: string;
        };
        Update: {
          barcode?: string;
          name?: string;
          brand?: string;
          category?: string;
          unit_size?: string;
          emoji?: string;
          description?: string | null;
          image_url?: string | null;
          image_source?: string | null;
        };
        Relationships: [];
      };
      store_inventory: {
        Row: {
          id: string;
          store_id: string;
          product_id: number;
          price: number;
          mrp: number;
          stock_quantity: number;
          is_available: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: number;
          price: number;
          mrp: number;
          stock_quantity?: number;
          is_available?: boolean;
          updated_at?: string;
        };
        Update: {
          price?: number;
          mrp?: number;
          stock_quantity?: number;
          is_available?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      store_entry_sessions: {
        Row: {
          id: string;
          user_id: string;
          store_id: string;
          session_token: string;
          verified_at: string;
          expires_at: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          store_id: string;
          session_token: string;
          verified_at?: string;
          expires_at: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          is_active?: boolean;
          expires_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          store_id: string;
          customer_id: string | null;
          session_id: string;
          receipt_id: string;
          subtotal: number;
          mrp_savings: number;
          coupon_code: string | null;
          coupon_discount: number;
          taxable_amount: number;
          cgst: number;
          sgst: number;
          tax_total: number;
          final_total: number;
          payment_method: "upi" | "card" | "wallet" | "cash";
          payment_status: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED" | "CANCELLED";
          payment_reference: string;
          idempotency_key: string | null;
          payload_hash: string | null;
          paid_at: string;
          created_at: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          payment_attempt_expires_at?: string | null;
          stock_restored?: boolean;
          stock_restored_at?: string | null;
          cancellation_reason?: string | null;
          refund_status?: "NONE" | "REFUND_REQUIRED" | "REFUND_PENDING" | "REFUNDED" | "REFUND_FAILED";
          refund_id?: string | null;
          refund_amount?: number | null;
          refund_reason?: string | null;
          refunded_at?: string | null;
        };
        Insert: {
          id: string;
          store_id: string;
          customer_id?: string | null;
          session_id: string;
          receipt_id: string;
          subtotal: number;
          mrp_savings?: number;
          coupon_code?: string | null;
          coupon_discount?: number;
          taxable_amount: number;
          cgst?: number;
          sgst?: number;
          tax_total?: number;
          final_total: number;
          payment_method: "upi" | "card" | "wallet" | "cash";
          payment_status?: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED" | "CANCELLED";
          payment_reference: string;
          idempotency_key?: string | null;
          payload_hash?: string | null;
          paid_at?: string;
          created_at?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          payment_attempt_expires_at?: string | null;
          stock_restored?: boolean;
          stock_restored_at?: string | null;
          cancellation_reason?: string | null;
          refund_status?: "NONE" | "REFUND_REQUIRED" | "REFUND_PENDING" | "REFUNDED" | "REFUND_FAILED";
          refund_id?: string | null;
          refund_amount?: number | null;
          refund_reason?: string | null;
          refunded_at?: string | null;
        };
        Update: {
          payment_status?: "PENDING" | "CONFIRMED" | "FAILED" | "REFUNDED" | "CANCELLED";
          payment_reference?: string;
          payload_hash?: string | null;
          paid_at?: string;
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          razorpay_signature?: string | null;
          payment_attempt_expires_at?: string | null;
          stock_restored?: boolean;
          stock_restored_at?: string | null;
          cancellation_reason?: string | null;
          refund_status?: "NONE" | "REFUND_REQUIRED" | "REFUND_PENDING" | "REFUNDED" | "REFUND_FAILED";
          refund_id?: string | null;
          refund_amount?: number | null;
          refund_reason?: string | null;
          refunded_at?: string | null;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: number | null;
          product_name: string;
          barcode: string;
          unit_price: number;
          quantity: number;
          total_price: number;
          category: string | null;
          unit_size: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: number | null;
          product_name: string;
          barcode: string;
          unit_price: number;
          quantity: number;
          total_price: number;
          category?: string | null;
          unit_size?: string | null;
        };
        Relationships: [];
      };
      exit_passes: {
        Row: {
          id: string;
          order_id: string;
          store_id: string;
          qr_payload: string;
          issued_at: string;
          expires_at: string;
          status: "ISSUED" | "VERIFIED" | "EXPIRED" | "REVOKED";
          verified_at: string | null;
          verified_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          store_id: string;
          qr_payload: string;
          issued_at?: string;
          expires_at: string;
          status?: "ISSUED" | "VERIFIED" | "EXPIRED" | "REVOKED";
          verified_at?: string | null;
          verified_by?: string | null;
          created_at?: string;
        };
        Update: {
          status?: "ISSUED" | "VERIFIED" | "EXPIRED" | "REVOKED";
          verified_at?: string | null;
          verified_by?: string | null;
        };
        Relationships: [];
      };
      security_logs: {
        Row: {
          id: string;
          store_id: string;
          order_id: string | null;
          receipt_id: string | null;
          guard_id: string | null;
          terminal_id: string;
          outcome: "success" | "duplicate_warning" | "failure";
          failure_reason: string | null;
          scanned_payload: string;
          has_discrepancy: boolean;
          discrepancy_note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          order_id?: string | null;
          receipt_id?: string | null;
          guard_id?: string | null;
          terminal_id: string;
          outcome: "success" | "duplicate_warning" | "failure";
          failure_reason?: string | null;
          scanned_payload: string;
          has_discrepancy?: boolean;
          discrepancy_note?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      store_aisles: {
        Row: {
          id: string;
          store_id: string;
          code: string;
          name: string;
          category: string;
          racks: string[];
          zone: string;
          description: string | null;
          walking_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          code: string;
          name: string;
          category: string;
          racks?: string[];
          zone: string;
          description?: string | null;
          walking_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          code?: string;
          name?: string;
          category?: string;
          racks?: string[];
          zone?: string;
          description?: string | null;
          walking_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_locations: {
        Row: {
          id: string;
          store_id: string;
          product_id: number;
          aisle_code: string;
          aisle_name: string;
          rack_code: string;
          shelf_code: string;
          verification_status: "VERIFIED" | "UNVERIFIED" | "MISSING";
          notes: string | null;
          updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          store_id: string;
          product_id: number;
          aisle_code: string;
          aisle_name: string;
          rack_code: string;
          shelf_code: string;
          verification_status?: "VERIFIED" | "UNVERIFIED" | "MISSING";
          notes?: string | null;
          updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          store_id?: string;
          product_id?: number;
          aisle_code?: string;
          aisle_name?: string;
          rack_code?: string;
          shelf_code?: string;
          verification_status?: "VERIFIED" | "UNVERIFIED" | "MISSING";
          notes?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      customer_store_catalog: {
        Row: {
          store_id: string;
          product_id: number;
          barcode: string;
          name: string;
          brand: string;
          category: string;
          unit_size: string;
          emoji: string;
          image_url?: string | null;
          description: string | null;
          price: number;
          mrp: number;
          is_available: boolean;
          in_stock: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      validate_store_entrance_qr: {
        Args: {
          p_store_code: string;
        };
        Returns: Json;
      };
      verify_turnstile_exit_pass: {
        Args: {
          p_order_id: string;
          p_terminal_id: string;
        };
        Returns: Json;
      };
      confirm_cash_order_payment: {
        Args: {
          p_order_id: string;
        };
        Returns: Json;
      };
      process_self_checkout_order: {
        Args: {
          p_store_id: string;
          p_items: Json;
          p_payment_method: string;
          p_idempotency_key: string;
          p_coupon_code?: string | null;
        };
        Returns: Json;
      };
      confirm_digital_order_payment: {
        Args: {
          p_order_id: string;
          p_gateway_reference: string;
        };
        Returns: Json;
      };
      confirm_guard_item_inspection: {
        Args: {
          p_order_id: string;
          p_terminal_id: string;
          p_items_checked: number;
          p_has_discrepancy?: boolean;
          p_discrepancy_note?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
